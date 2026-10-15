/**
 * Validation utilities for custom metrics
 */

import { extractMetricReferences, resolveMetricReferences } from '../../../../domain/field/metric-resolver';
import { formatNumber } from '../../../../application/utils/formatters';

interface ValidationOptions {
  referenceLookup?: Record<string, { name?: string; label?: string }>;
}

/**
 * Normalize string for flexible matching (remove whitespace, lowercase)
 */
function normalize(str: string) {
  return str.toLowerCase().replace(/\s+/g, '');
}

/**
 * Extract {{field_id}} references from expression
 */
function extractTemplateReferences(expr: string) {
  if (!expr) return [];
  const matches = expr.match(/\{\{([^}]+)\}\}/g) || [];
  return matches.map(m => m.slice(2, -2).trim()); // Trim whitespace to handle {{ name }}
}

/**
 * Validate custom metric name and formula
 * @param {string} name - Name of the expression
 * @param {string} formula - Formula/expression
 * @param {Array} availableMetrics - Legacy: array of available metrics (for old-style references)
 * @param {Object} options - Optional validation context
 * @param {Object} options.referenceLookup - Lookup map for {{}} syntax validation
 * @returns {object|null} Error object if invalid, null if valid
 */
export function validateCustomMetric(name: string, formula: string, availableMetrics: Array<{ name: string }>, options: ValidationOptions = {}) {
  // Check name
  if (!name.trim()) {
    return { error: 'Name is required' };
  }

  // Check formula
  if (!formula.trim()) {
    return { error: 'Formula is required' };
  }


  // Validate {{}} template references (if referenceLookup provided)
  const hasTemplateRefs = /\{\{.*?\}\}/.test(formula);

  if (options.referenceLookup && hasTemplateRefs) {
    // Build unified hash with all possible references (ID + normalized names/labels)
    const unifiedHash: Record<string, any> = {};
    for (const [id, field] of Object.entries(options.referenceLookup)) {
      // Index by exact ID
      unifiedHash[id] = field;

      // Index by normalized name
      if ((field as any).name) {
        unifiedHash[normalize((field as any).name)] = field;
      }

      // Index by normalized label
      if ((field as any).label) {
        unifiedHash[normalize((field as any).label)] = field;
      }
    }

    const templateRefs = extractTemplateReferences(formula);
    for (const ref of templateRefs) {
      // Single O(1) lookup: try exact match first, then normalized
      const found = unifiedHash[ref] || unifiedHash[normalize(ref)];

      if (!found) {
        return { error: `Field "{{${ref}}}" not found. Check the spelling or create it first.` };
      }
    }
    // If using {{}} syntax, skip legacy validation
    return null;
  }

  // Validate legacy metric references (for backward compatibility)
  // Only runs if NO {{}} syntax is used
  try {
    const references = extractMetricReferences(formula);
    for (const ref of references) {
      if (!availableMetrics.find(m => m.name === ref)) {
        return { error: `Metric "${ref}" not found. Create it first or check the spelling.` };
      }
    }

    // Try to resolve to catch circular dependencies
    resolveMetricReferences(formula, availableMetrics);
  } catch (err: any) {
    return { error: err.message };
  }

  return null; // Valid
}

/**
 * Format example value for preview
 */
export function formatExample(value, type, decimals, currency, useThousandSeparator, locale = 'en-US') {
  if (type === 'auto') return 'Engine will decide based on data type';
  return formatNumber(value, { type, decimals, currency, useThousandSeparator }, locale);
}
