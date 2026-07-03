import { FieldItem } from './FieldItem';
import { FieldKind, PivotTableConfig } from '../models/types';

/**
 * Lookup a field by ID across all possible sources and return a FieldItem.
 *
 * This is pure domain logic - no UI or state dependencies.
 *
 * Checks:
 * 1. availableFields (base fields, derived fields)
 * 2. config.values (active aggregations like SUM_sales)
 * 3. config.customMetrics
 * 4. config.customFilters
 * 5. config.customGroupings
 *
 * @param fieldId - The field ID to look up (e.g., 'category', 'SUM_sales', 'profit_margin')
 * @param availableFields - Array of FieldItems from store
 * @param config - Pivot configuration
 * @returns FieldItem or null if not found
 */
export function getFieldById(
  fieldId: string,
  availableFields: FieldItem[],
  config: PivotTableConfig
): FieldItem | null {
  // 1. Check availableFields (base fields, derived fields)
  const fieldItem = availableFields.find(f => f.id === fieldId);
  if (fieldItem) {
    return fieldItem;
  }

  // 2. Check active aggregations (e.g., SUM_sales)
  for (const valueConfig of config.values || []) {
    if (valueConfig.isCustom) continue;

    const aggId = `${valueConfig.aggregation.toUpperCase()}_${valueConfig.field}`;
    if (aggId === fieldId) {
      const sourceField = availableFields.find(f => f.id === valueConfig.field);
      const displayName = sourceField
        ? `${valueConfig.aggregation.toUpperCase()}(${sourceField.name})`
        : aggId;

      return {
        id: aggId,
        name: displayName,
        dtype: sourceField?.dtype || 'double',
        originalType: null,
        kind: FieldKind.AGGREGATION,
        sourceField: valueConfig.field,
        aggregation: valueConfig.aggregation,
        formula: null,
        format: null
      };
    }
  }

  // 3. Check custom metrics
  const customMetric = (config.customMetrics || []).find(m => m.id === fieldId);
  if (customMetric) {
    return {
      id: customMetric.id,
      name: customMetric.name,
      dtype: 'double',
      originalType: null,
      kind: FieldKind.CUSTOM_METRIC,
      sourceField: null,
      aggregation: null,
      formula: customMetric.expr,
      format: customMetric.format || null
    };
  }

  // 4. Check custom filters
  const customFilter = (config.customFilters || []).find(f => f.id === fieldId);
  if (customFilter) {
    return {
      id: customFilter.id,
      name: customFilter.name,
      dtype: 'bool',
      originalType: null,
      kind: FieldKind.CUSTOM_FILTER,
      sourceField: null,
      aggregation: null,
      formula: customFilter.expr,
      format: null
    };
  }

  // 5. Check custom groupings
  const customGrouping = (config.customGroupings || []).find(g => g.id === fieldId);
  if (customGrouping) {
    return {
      id: customGrouping.id,
      name: customGrouping.name,
      dtype: 'string',
      originalType: null,
      kind: FieldKind.CUSTOM_GROUPING,
      sourceField: null,
      aggregation: null,
      formula: customGrouping.expr,
      format: null
    };
  }

  return null;
}
