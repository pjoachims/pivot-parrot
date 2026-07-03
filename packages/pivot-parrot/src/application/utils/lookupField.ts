/**
 * Unified field lookup utility
 * Searches for a field across all possible sources:
 * - availableFields (regular columns + derived field items)
 * - derivedFieldsMap (raw derived field definitions)
 * - customGroupings
 * - customMetrics
 * - customFilters
 */

/**
 * Create a field lookup context for efficient field operations
 * Call this once and reuse the returned object for multiple lookups
 *
 * @param {Array} availableFields - Array of FieldItem objects
 * @param {Object} derivedFieldsMap - Map of base field -> derived fields array
 * @param {Object} config - Pivot config with customGroupings, customMetrics, customFilters
 * @returns {Object} FieldLookup context with lookup methods
 *
 * @example
 * const fields = createFieldLookup(availableFields, derivedFieldsMap, config);
 * const field = fields.lookup('order_year');
 * const sql = fields.getSQL('order_year');
 * const label = fields.getLabel('order_year');
 */
import type { FieldItem } from '../../domain/field/FieldItem';
import type { CustomFilter, CustomGrouping, CustomMetric, DerivedField } from '../../domain/models/types';

type LookupConfig = {
  customGroupings?: CustomGrouping[];
  customMetrics?: CustomMetric[];
  customFilters?: CustomFilter[];
};

type LookupContext = {
  availableFields?: Array<FieldItem | { id: string } | string>;
  derivedFieldsMap?: Record<string, DerivedField[]>;
  config?: LookupConfig;
};

type LookupResult =
  | (FieldItem & { sql?: string; expr?: string; label?: string })
  | { id: string; sql?: string; expr?: string; formula?: string; label?: string; name?: string };

export function createFieldLookup(
  availableFields: Array<FieldItem | { id: string } | string> = [],
  derivedFieldsMap: Record<string, DerivedField[]> = {},
  config: LookupConfig = {}
) {
  return {
    lookup: (fieldId) => lookupField(fieldId, { availableFields, derivedFieldsMap, config }),
    getSQL: (fieldId) => getFieldSQL(fieldId, { availableFields, derivedFieldsMap, config }),
    getLabel: (fieldId) => getFieldLabel(fieldId, { availableFields, derivedFieldsMap, config }),
    exists: (fieldId) => fieldExists(fieldId, { availableFields, derivedFieldsMap, config })
  };
}

/**
 * Lookup a field by ID across all field sources
 * Returns the raw field object from wherever it's found, or null if not found
 *
 * @param {string} fieldId - Field ID to lookup
 * @param {Object} context - Context containing field sources
 * @param {Array} context.availableFields - Array of FieldItem objects
 * @param {Object} context.derivedFieldsMap - Map of base field -> derived fields array
 * @param {Object} context.config - Pivot config with customGroupings, customMetrics, customFilters
 * @returns {Object|null} Field object or null if not found
 *
 * @example
 * const field = lookupField('order_year', { availableFields, derivedFieldsMap, config });
 * if (field) {
 *   // Could be FieldItem, derived field, custom grouping, metric, or filter
 *   // Check properties to determine type: field.expr vs field.formula vs field.sql
 * }
 */
export function lookupField(fieldId: string, { availableFields = [], derivedFieldsMap = {}, config = {} }: LookupContext): LookupResult | null {
  // 1. Check availableFields (regular columns + derived field items)
  // availableFields contains both base columns and derived fields that were added
  let field = availableFields.find(f => {
    const id = typeof f === 'string' ? f : f.id;
    return id === fieldId;
  });
  if (field) {
    return typeof field === 'string' ? { id: field, name: field } : field;
  }

  // 2. Check derivedFieldsMap (raw derived field definitions)
  // This is a fallback for derived fields not yet added to availableFields
  for (const derivedFields of Object.values(derivedFieldsMap)) {
    if (Array.isArray(derivedFields)) {
      field = derivedFields.find(f => f.id === fieldId);
      if (field) return field;  // Return { id, sql, label, derivation_type }
    }
  }

  // 3. Check custom groupings
  field = (config.customGroupings || []).find(g => g.id === fieldId);
  if (field) return field;  // Return { id, expr, name }

  // 4. Check custom metrics
  field = (config.customMetrics || []).find(m => m.id === fieldId);
  if (field) return field;  // Return { id, expr, name, format }

  // 5. Check custom filters
  field = (config.customFilters || []).find(f => f.id === fieldId);
  if (field) return field;  // Return { id, expr, name }

  return null;
}

/**
 * Get the SQL expression for a field
 * Works for regular fields, derived fields, custom groupings, metrics, and filters
 *
 * @param {string} fieldId - Field ID to get SQL for
 * @param {Object} context - Context containing field sources (same as lookupField)
 * @returns {string|null} SQL expression or null if not found
 *
 * @example
 * const sql = getFieldSQL('order_year', { availableFields, derivedFieldsMap, config });
 * // Returns: 'EXTRACT(YEAR FROM "order_date")'
 */
export function getFieldSQL(fieldId: string, context: LookupContext) {
  const field = lookupField(fieldId, context);
  if (!field) return null;

  // Different field types store SQL in different properties
  return field.sql || field.expr || field.formula || null;
}

/**
 * Check if a field exists in any source
 *
 * @param {string} fieldId - Field ID to check
 * @param {Object} context - Context containing field sources (same as lookupField)
 * @returns {boolean} True if field exists
 */
export function fieldExists(fieldId: string, context: LookupContext) {
  return lookupField(fieldId, context) !== null;
}

/**
 * Get the display name/label for a field
 *
 * @param {string} fieldId - Field ID
 * @param {Object} context - Context containing field sources (same as lookupField)
 * @returns {string} Display name (fallback to fieldId if not found)
 */
export function getFieldLabel(fieldId: string, context: LookupContext) {
  const field = lookupField(fieldId, context);
  if (!field) return fieldId;

  // Different field types store labels in different properties
  return field.label || field.name || field.id || fieldId;
}
