/**
 * Dependency graph-based field reference resolver
 * Properly handles nested {{field_id}} references with:
 * - Circular dependency detection
 * - Caching of resolved expressions
 * - Clear error messages
 * - Optimal resolution order
 */

// ==================== Type Definitions ====================

/**
 * Field definition with expression/SQL and metadata
 */
interface FieldDefinition {
  id: string;
  sql?: string;
  expr?: string;
  name?: string;
  label?: string;
}

/**
 * Lookup map from field ID to field definition
 */
type ReferenceLookup = Record<string, FieldDefinition>;

/**
 * Reference extracted from {{field_id}} syntax
 */
interface ExtractedReference {
  original: string;  // Original with spaces for regex matching
  trimmed: string;   // Trimmed for lookup
}

/**
 * Field collision between two fields with same normalized name
 */
interface FieldCollision {
  key: string;
  field1: { id: string; name: string };
  field2: { id: string; name: string };
}

/**
 * Dependency graph structure
 */
interface DependencyGraph {
  deps: Map<string, Set<string>>;
  nodes: Set<string>;
}

/**
 * Validation result for field references
 */
interface ValidationResult {
  valid: boolean;
  error: string | null;
  cycle: string[] | null;
}

/**
 * Options for building reference lookup
 */
interface BuildReferenceLookupOptions {
  availableFields?: Array<{ id: string; formula: string | null; name: string; kind: string }>;
  customGroupings?: Array<{ id: string; expr: string; name: string }>;
  customFilters?: Array<{ id: string; expr: string; name: string }>;
  customMetrics?: Array<{ id: string; expr: string; name: string }>;
  values?: unknown[];
  hiddenValues?: unknown[];
  dialect?: unknown;
  includeMetrics?: boolean;
}

// ==================== Global Cache ====================

// Global cache for resolved expressions
// Key: stringified referenceLookup, Value: Map<fieldId, resolvedExpr>
const RESOLVED_CACHE = new Map<string, Map<string, string>>();

// Cap on RESOLVED_CACHE size - every distinct referenceLookup shape (e.g. per snapshot/config
// edit) gets its own entry, so without a bound this grows unboundedly over a long session.
const RESOLVED_CACHE_MAX_SIZE = 500;

/**
 * Clear the global resolver cache
 * Call this before applying changes to custom metrics/filters/groupings
 * @example
 * // In your dialog's onSave handler:
 * clearResolverCache();
 * updateConfig({ customMetrics: [...] });
 */
export function clearResolverCache(): void {
  RESOLVED_CACHE.clear();
}

// ==================== Helper Functions ====================

/**
 * Generate cache key from referenceLookup
 * Simple stringification of field IDs + expressions
 */
function getCacheKey(referenceLookup: ReferenceLookup): string {
  const keys = Object.keys(referenceLookup).sort();
  const entries = keys.map(k => {
    const field = referenceLookup[k];
    const expr = field.sql || field.expr || '';
    return `${k}:${expr}`;
  });
  return entries.join('|');
}

/**
 * Extract all {{field_id}} references from an expression
 * Returns objects with both original (for regex) and trimmed (for lookup) versions
 */
function extractReferences(expr: string): ExtractedReference[] {
  if (!expr) return [];
  const matches = expr.match(/\{\{([^}]+)\}\}/g) || [];
  return matches.map(m => {
    const content = m.slice(2, -2); // Remove {{ and }}
    return {
      original: content,      // Keep original with spaces for regex
      trimmed: content.trim() // Trimmed for lookup
    };
  });
}

/**
 * Normalize string for flexible matching (remove whitespace, lowercase)
 */
function normalize(str: string): string {
  return str.toLowerCase().replace(/\s+/g, '');
}

/**
 * Build unified lookup hash with all possible references to fields
 * Includes: exact IDs, normalized names, normalized labels
 * All keys point to the same field object for O(1) lookup
 */
function buildUnifiedHash(referenceLookup: ReferenceLookup): Record<string, FieldDefinition> {
  const hash: Record<string, FieldDefinition> = {};
  const collisions: FieldCollision[] = [];

  for (const [id, field] of Object.entries(referenceLookup)) {
    // Index by exact ID
    hash[id] = field;

    // Index by normalized name
    if (field.name) {
      const normalizedName = normalize(field.name);
      const existing = hash[normalizedName];

      // Check for collision: different field with same normalized name
      if (existing && existing.id !== id) {
        collisions.push({
          key: normalizedName,
          field1: { id: existing.id, name: existing.name || existing.label || '' },
          field2: { id: id, name: field.name }
        });
      }

      hash[normalizedName] = field;
    }

    // Index by normalized label (for derived fields)
    if (field.label) {
      const normalizedLabel = normalize(field.label);
      const existing = hash[normalizedLabel];

      // Check for collision: different field with same normalized label
      if (existing && existing.id !== id) {
        collisions.push({
          key: normalizedLabel,
          field1: { id: existing.id, name: existing.name || existing.label || '' },
          field2: { id: id, name: field.label }
        });
      }

      hash[normalizedLabel] = field;
    }
  }

  // Warn about collisions
  if (collisions.length > 0) {
    console.warn(
      '⚠️  Field name collision detected! Multiple fields normalize to the same key.\n' +
      'This may cause unexpected behavior when referencing fields by name.\n' +
      'Collisions:\n' +
      collisions.map(c =>
        `  - "${c.key}" matches both:\n` +
        `    • "${c.field1.name}" (id: ${c.field1.id})\n` +
        `    • "${c.field2.name}" (id: ${c.field2.id})`
      ).join('\n')
    );
  }

  return hash;
}

/**
 * Build dependency graph from field lookup
 */
function buildDependencyGraph(referenceLookup: ReferenceLookup): DependencyGraph {
  const deps = new Map<string, Set<string>>();
  const nodes = new Set<string>();
  const unifiedHash = buildUnifiedHash(referenceLookup);

  for (const [fieldId, field] of Object.entries(referenceLookup)) {
    nodes.add(fieldId);
    const expr = field.sql || field.expr;
    if (expr) {
      const references = extractReferences(expr);
      // Normalize references to canonical IDs (handle name-based references like "Is Premium" -> "is_premium")
      const normalizedRefs = references.map(refObj => {
        // Try exact match first, then normalized
        const refField = unifiedHash[refObj.trimmed] || unifiedHash[normalize(refObj.trimmed)];
        return refField && refField.id ? refField.id : refObj.trimmed;
      });
      deps.set(fieldId, new Set(normalizedRefs));
    } else {
      deps.set(fieldId, new Set());
    }
  }

  return { deps, nodes };
}

/**
 * Topologically sort fields by dependencies
 * Base fields (no dependencies) come first, then fields that depend on them
 * @throws {Error} If circular dependency detected
 */
function topologicalSort(deps: Map<string, Set<string>>, nodes: Set<string>): string[] {
  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(nodeId: string): void {
    if (visited.has(nodeId)) return;

    if (visiting.has(nodeId)) {
      // Circular dependency detected
      const cycle = Array.from(visiting).concat([nodeId]);
      const cycleStr = cycle.slice(cycle.indexOf(nodeId)).join(' → ');
      throw new Error(
        `Circular dependency detected: ${cycleStr}\n` +
        `Cannot resolve field references because they form a loop.`
      );
    }

    visiting.add(nodeId);

    const dependencies = deps.get(nodeId) || new Set();
    for (const depId of dependencies) {
      // Only visit if it's in the lookup (ignore regular column names)
      if (nodes.has(depId)) {
        visit(depId);
      }
    }

    visiting.delete(nodeId);
    visited.add(nodeId);
    sorted.push(nodeId);
  }

  for (const nodeId of nodes) {
    visit(nodeId);
  }

  return sorted;
}

// ==================== Main Resolution Function ====================

/**
 * Resolve all {{field_id}} references with dependency graph approach
 * - Builds dependency graph
 * - Topologically sorts fields
 * - Resolves in order (base fields first)
 * - Caches resolved expressions
 * - Detects circular dependencies
 *
 * @throws {Error} If circular dependency detected
 *
 * @example
 * const lookup = {
 *   order_year: { id: 'order_year', sql: 'EXTRACT(YEAR FROM "order_date")' },
 *   is_recent: { id: 'is_recent', expr: '{{order_year}} >= 2023' },
 *   final: { id: 'final', expr: 'CASE WHEN {{is_recent}} THEN 1 ELSE 0 END' }
 * };
 * resolveDerivedFieldsInExpressionV2('{{final}}', lookup)
 * // Returns: 'CASE WHEN ((EXTRACT(YEAR FROM "order_date")) >= 2023) THEN 1 ELSE 0 END'
 */
export function resolveDerivedFieldsInExpressionV2(
  expr: string,
  referenceLookup: ReferenceLookup
): string {
  if (!expr || !referenceLookup) {
    return expr;
  }

  // Build unified hash once for O(1) lookups (includes IDs + normalized names/labels)
  const unifiedHash = buildUnifiedHash(referenceLookup);

  // Check global cache first
  const cacheKey = getCacheKey(referenceLookup);
  let resolvedCache = RESOLVED_CACHE.get(cacheKey);

  if (!resolvedCache) {
    // Cache miss - build dependency graph and topologically sort
    const { deps, nodes } = buildDependencyGraph(referenceLookup);
    let sortedFields: string[];

    try {
      sortedFields = topologicalSort(deps, nodes);
    } catch (error) {
      // Re-throw with original error message about circular dependency
      throw error;
    }

    // Build cache for resolved expressions
    resolvedCache = new Map<string, string>();

    // Resolve fields in topological order (dependencies first)
    for (const fieldId of sortedFields) {
      const field = referenceLookup[fieldId];
      if (!field) continue;

      const originalExpr = field.sql || field.expr;
      if (!originalExpr) {
        resolvedCache.set(fieldId, '');
        continue;
      }

      // If expression has no {{}} references, it's already resolved
      if (!/\{\{.*?\}\}/.test(originalExpr)) {
        resolvedCache.set(fieldId, originalExpr);
        continue;
      }

      // Resolve all {{}} references in this expression using cache
      let resolvedExpr = originalExpr;
      const references = extractReferences(originalExpr);

      // Sort by original length (descending) to prevent partial matches
      const sortedRefs = references.sort((a, b) => b.original.length - a.original.length);

      for (const refObj of sortedRefs) {
        // Single O(1) lookup: try exact match first, then normalized
        const refField = unifiedHash[refObj.trimmed] || unifiedHash[normalize(refObj.trimmed)];
        const canonicalId = refField && refField.id ? refField.id : refObj.trimmed;

        const refResolved = resolvedCache.get(canonicalId);
        if (refResolved !== undefined) {
          // Replace {{ref}} with resolved expression (wrapped in parens)
          // Use original (with spaces) for regex matching
          const regex = new RegExp(`\\{\\{${refObj.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
          resolvedExpr = resolvedExpr.replace(regex, `(${refResolved})`);
        } else {
          // Reference not in cache - might be a regular column, leave as-is
          // The SQL engine will handle it
        }
      }

      resolvedCache.set(fieldId, resolvedExpr);
    }

    // Store in global cache for future calls (simple FIFO eviction to bound memory)
    if (RESOLVED_CACHE.size >= RESOLVED_CACHE_MAX_SIZE) {
      const oldestKey = RESOLVED_CACHE.keys().next().value;
      if (oldestKey !== undefined) RESOLVED_CACHE.delete(oldestKey);
    }
    RESOLVED_CACHE.set(cacheKey, resolvedCache);
  }

  // Now resolve the input expression using the cache
  let result = expr;
  const inputRefs = extractReferences(expr);
  const sortedInputRefs = inputRefs.sort((a, b) => b.original.length - a.original.length);

  for (const refObj of sortedInputRefs) {
    // Single O(1) lookup: try exact match first, then normalized
    const refField = unifiedHash[refObj.trimmed] || unifiedHash[normalize(refObj.trimmed)];
    const canonicalId = refField && refField.id ? refField.id : refObj.trimmed;

    const refResolved = resolvedCache.get(canonicalId);
    if (refResolved !== undefined) {
      // Use original (with spaces) for regex matching
      const regex = new RegExp(`\\{\\{${refObj.original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}\\}`, 'g');
      result = result.replace(regex, `(${refResolved})`);
    }
  }

  return result;
}

// ==================== Validation & Utility Functions ====================

/**
 * Validate field references for circular dependencies without resolving
 * Useful for validation when user creates/updates custom expressions
 */
export function validateFieldReferences(referenceLookup: ReferenceLookup): ValidationResult {
  try {
    const { deps, nodes } = buildDependencyGraph(referenceLookup);
    topologicalSort(deps, nodes);
    return { valid: true, error: null, cycle: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const match = message.match(/Circular dependency detected: (.+?)\n/);
    const cycle = match ? match[1].split(' → ') : null;
    return {
      valid: false,
      error: message,
      cycle
    };
  }
}

/**
 * Build derived fields lookup from derivedFieldsMap
 * Flattens the map structure into a simple lookup by field ID
 */
export function buildDerivedFieldsLookup(
  derivedFieldsMap: Record<string, FieldDefinition[]> | null | undefined
): ReferenceLookup {
  const lookup: ReferenceLookup = {};
  Object.values(derivedFieldsMap || {}).forEach(fields => {
    if (Array.isArray(fields)) {
      fields.forEach(f => {
        lookup[f.id] = f;
      });
    }
  });
  return lookup;
}

/**
 * Build unified reference lookup for {{}} syntax resolution
 * Combines derived fields, custom groupings, custom filters, and optionally custom metrics
 * One entry per field (by ID) - names are stored in the field object for matching
 */
export function buildReferenceLookup({
  availableFields = [],
  customGroupings = [],
  customFilters = [],
  customMetrics = [],
  includeMetrics = true
}: BuildReferenceLookupOptions): ReferenceLookup {
  const lookup: ReferenceLookup = {};

  // Add derived fields from availableFields (filter for kind = 'derived_field')
  availableFields.forEach(field => {
    if (field.kind === 'derived_field' && field.formula) {
      lookup[field.id] = {
        id: field.id,
        sql: field.formula,  // FieldItem uses 'formula' for SQL expression
        name: field.name
      };
    }
  });

  // Add custom groupings (one entry per field, indexed by ID)
  customGroupings.forEach(g => {
    if (g.id && g.expr) {
      lookup[g.id] = { id: g.id, expr: g.expr, name: g.name };
    }
  });

  // Add custom filters (one entry per field, indexed by ID)
  customFilters.forEach(f => {
    if (f.id && f.expr) {
      lookup[f.id] = { id: f.id, expr: f.expr, name: f.name };
    }
  });

  // Add custom metrics (only if includeMetrics is true, one entry per field)
  if (includeMetrics) {
    customMetrics.forEach(m => {
      if (m.id && m.expr) {
        lookup[m.id] = { id: m.id, expr: m.expr, name: m.name };
      }
    });
  }

  return lookup;
}
