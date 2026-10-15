/**
 * Field Options Actions
 * Extracted from FieldOptionsContext for use in Zustand store
 */

import type { PivotTableConfig, Filter, ValueConfig, DerivedField } from '../../domain/models/types';
import { FieldKind } from '../../domain/models/types';
import type { FieldItem } from '../../domain/field/FieldItem';
import { getArrowType } from '../../domain/types/ArrowTypes';
import {
  createCustomMetric,
  updateCustomMetric,
  addCustomMetric,
  changeAggregation as changeAggregationUtil,
  autoManageValuesField
} from '../utils/fieldUtils';
import { getFieldById } from '../utils/getFieldById';

/**
 * Get FieldKind for a field by checking FieldItem or custom expressions
 */
function getFieldKind(fieldName: string, config: PivotTableConfig, availableFields: FieldItem[]): FieldKind {
  // Special case
  if (fieldName === 'Σ Values') return FieldKind.SIGMA_VALUES;

  // Check active aggregations (e.g., SUM_sales)
  for (const valueConfig of config.values || []) {
    if (valueConfig.isCustom) continue;
    const aggId = `${valueConfig.aggregation.toUpperCase()}_${valueConfig.field}`;
    if (aggId === fieldName) {
      return FieldKind.AGGREGATION;
    }
  }

  // Check custom metrics
  if ((config.customMetrics || []).some(m => m.id === fieldName)) {
    return FieldKind.CUSTOM_METRIC;
  }

  // Check custom expressions (not FieldItems)
  if ((config.customFilters || []).some(f => f.id === fieldName)) return FieldKind.CUSTOM_FILTER;
  if ((config.customGroupings || []).some(g => g.id === fieldName)) return FieldKind.CUSTOM_GROUPING;

  // Look up FieldItem (has kind property)
  const fieldItem = availableFields.find(f => f.id === fieldName);
  if (fieldItem) {
    return fieldItem.kind;
  }

  // Fallback
  return FieldKind.BASE_FIELD;
}

function getAggregationId(valueConfig: ValueConfig): string {
  return `${valueConfig.aggregation.toUpperCase()}_${valueConfig.field}`;
}

function matchesValueConfig(fieldName: string, valueConfig: ValueConfig): boolean {
  if (valueConfig.isCustom) {
    return valueConfig.field === fieldName;
  }
  return getAggregationId(valueConfig) === fieldName;
}

function isNumericType(typeName: string | number | undefined): boolean {
  return typeof typeName === 'string' && Boolean(getArrowType(typeName)?.isNumeric);
}

export type CheckboxZone = 'rows' | 'values' | 'filters';

const CHECKBOX_ZONE_BY_KIND: Partial<Record<FieldKind, CheckboxZone>> = {
  [FieldKind.AGGREGATION]: 'values',
  [FieldKind.CUSTOM_METRIC]: 'values',
  [FieldKind.CUSTOM_FILTER]: 'filters'
};

/**
 * Zone a field lands in when its checkbox is ticked (Excel-like): measures and
 * numeric base fields go to Values, custom filters to Filters, everything else to Rows.
 */
export function checkboxTargetZone(
  fieldName: string,
  config: PivotTableConfig,
  availableFields: FieldItem[],
  detectedTypes: Record<string, string | number>
): CheckboxZone {
  const kind = getFieldKind(fieldName, config, availableFields);
  const zone = CHECKBOX_ZONE_BY_KIND[kind];
  if (zone) return zone;
  return kind === FieldKind.BASE_FIELD && isNumericType(detectedTypes[fieldName]) ? 'values' : 'rows';
}

export function buildHandleDrop(
  config: PivotTableConfig,
  availableFields: FieldItem[],
  detectedTypes: Record<string, string | number>
) {
  return (fieldName: string, sourceZone: string, targetZone: string | null, index: number | null = null, sourceIndex: number | null = null) => {
    // Step 1: Determine field type
    const kind = getFieldKind(fieldName, config, availableFields);
    const isMeasure = kind === FieldKind.AGGREGATION || kind === FieldKind.CUSTOM_METRIC;
    const draggedValueConfig = sourceZone === 'values'
      ? (sourceIndex !== null && sourceIndex >= 0 && sourceIndex < config.values.length
          ? config.values[sourceIndex]
          : config.values.find(v => matchesValueConfig(fieldName, v)))
      : config.values.find(v => matchesValueConfig(fieldName, v));

    // Step 2: Remove from source
    let newConfig = { ...config };
    if (sourceZone === 'rows') {
      newConfig.rows = config.rows.filter(f => f !== fieldName);
    } else if (sourceZone === 'columns') {
      newConfig.columns = config.columns.filter(f => f !== fieldName);
    } else if (sourceZone === 'filters') {
      newConfig.filters = (config.filters || []).filter(f => f.field !== fieldName);
    } else if (sourceZone === 'values') {
      if (sourceIndex !== null && sourceIndex >= 0 && sourceIndex < config.values.length) {
        newConfig.values = config.values.filter((_, valueIndex) => valueIndex !== sourceIndex);
      } else {
        newConfig.values = config.values.filter(v => !matchesValueConfig(fieldName, v));
      }
    }

    // Step 3: Handle drop outside zones
    if (!targetZone) {
      return {
        config: autoManageValuesField(newConfig),
        shouldOpenFilterDialog: false,
        shouldOpenHavingDialog: false,
        fieldName: null
      };
    }

    // Step 4: Add to target zone
    const insertAt = index !== null ? index : 0;

    if (targetZone === 'rows' || targetZone === 'columns') {
      // Validate: measures can't go to dimension zones
      if (isMeasure) {
        return { config, shouldOpenFilterDialog: false, shouldOpenHavingDialog: false, fieldName: null };
      }
      const targetArray = targetZone === 'rows' ? [...newConfig.rows] : [...newConfig.columns];
      targetArray.splice(insertAt, 0, fieldName);
      if (targetZone === 'rows') newConfig.rows = targetArray;
      else newConfig.columns = targetArray;

    } else if (targetZone === 'values') {
      const targetArray = [...newConfig.values];

      // Check if this is a custom metric
      if (kind === FieldKind.CUSTOM_METRIC) {
        // Custom metrics use isCustom: true and aggregation: 'custom'
        targetArray.splice(insertAt, 0, { field: fieldName, aggregation: 'custom', isCustom: true });
      } else if (kind === FieldKind.AGGREGATION && draggedValueConfig) {
        targetArray.splice(insertAt, 0, { ...draggedValueConfig });
      } else {
        const defaultAgg = isNumericType(detectedTypes[fieldName]) ? 'Sum' : 'Count';
        targetArray.splice(insertAt, 0, { field: fieldName, aggregation: defaultAgg });
      }
      newConfig.values = targetArray;

    } else if (targetZone === 'filters') {
      const targetArray = [...(newConfig.filters || [])];

      // Enrich filter with info from FieldItem for HAVING clause generation
      const fieldItem = getFieldById(fieldName, availableFields, config);

      const filterItem: any = { field: fieldName, type: 'equal' };

      // Mark custom filters so they're recognized in SQL generation
      if (kind === FieldKind.CUSTOM_FILTER) {
        filterItem.isCustom = true;
        filterItem.type = 'custom_filter';
      }

      if (fieldItem) {
        if (fieldItem.sourceField) {
          filterItem.sourceField = fieldItem.sourceField;
        }
        if (fieldItem.aggregation) {
          filterItem.aggregation = fieldItem.aggregation;
        }
        if (fieldItem.formula) {
          filterItem.formula = fieldItem.formula;
        }

        // Set filterType for HAVING clause detection - only for aggregations and custom metrics
        // Custom groupings and custom filters have formulas but are dimension-like (WHERE clause)
        if (kind === FieldKind.AGGREGATION || kind === FieldKind.CUSTOM_METRIC) {
          filterItem.filterType = 'having';
        }
      }

      targetArray.splice(insertAt, 0, filterItem);
      newConfig.filters = targetArray;

      // Auto-open dialog (unless custom filter or reordering)
      const isReordering = sourceZone === 'filters';
      const shouldOpen = kind !== FieldKind.CUSTOM_FILTER && !isReordering;

      if (shouldOpen && isMeasure) {
        return {
          config: autoManageValuesField(newConfig),
          shouldOpenFilterDialog: false,
          shouldOpenHavingDialog: true,
          fieldName
        };
      } else if (shouldOpen) {
        return {
          config: autoManageValuesField(newConfig),
          shouldOpenFilterDialog: true,
          shouldOpenHavingDialog: false,
          fieldName
        };
      }
    }

    return {
      config: autoManageValuesField(newConfig),
      shouldOpenFilterDialog: false,
      shouldOpenHavingDialog: false,
      fieldName: null
    };
  };
}

export function buildHandleApplyFilter(config: PivotTableConfig, filter: Filter) {
  // Find and update the filter in-place in config.filters
  const existingIndex = (config.filters || []).findIndex(f => f.field === filter.field);

  if (existingIndex >= 0) {
    // Update existing filter with new values
    const newFilters = [...config.filters];
    newFilters[existingIndex] = { ...newFilters[existingIndex], ...filter };
    return { ...config, filters: newFilters };
  } else {
    // Filter not in zone yet? This shouldn't happen, but add it just in case
    return { ...config, filters: [...(config.filters || []), filter] };
  }
}

export function buildHandleRemoveFilter(config: PivotTableConfig, fieldName: string) {
  const newFilters = (config.filters || []).filter(f => f.field !== fieldName);
  return { ...config, filters: newFilters };
}

export function buildHandleCreateExpression(
  config: PivotTableConfig,
  availableFields: FieldItem[],
  derivedFieldsMap: Record<string, DerivedField[]>,
  data: { name: string; formula: string; format?: string },
  type: string,
  editingId?: string
) {
  if (editingId) {
    // Update existing
    const newConfig = updateCustomMetric(
      config,
      editingId,
      data.name,
      data.formula,
      data.format,
      type
    );
    // Apply auto-management since this could affect metrics
    return autoManageValuesField(newConfig);
  } else {
    // Create new
    const newExpression = createCustomMetric(
      data.name,
      data.formula,
      data.format,
      type,
      config,
      availableFields,
      derivedFieldsMap
    );

    const newConfig = addCustomMetric(config, newExpression, type);

    // Apply auto-management since addCustomMetric adds to values
    const finalConfig = autoManageValuesField(newConfig);

    return { config: finalConfig, newExpressionId: newExpression.id };
  }
}

export function buildChangeAggregation(config: PivotTableConfig, index: number, aggregation: string) {
  return changeAggregationUtil(index, aggregation, config);
}

export function buildHandleAddDerivedFields(
  derivedFieldsMap: Record<string, DerivedField[]>,
  sourceField: string,
  fields: DerivedField[]
) {
  return {
    ...derivedFieldsMap,
    [sourceField]: fields
  };
}

/**
 * Delete a custom expression (metric/filter/grouping) and remove from all zones
 */
export function buildDeleteCustomExpression(
  config: PivotTableConfig,
  expressionId: string,
  type: 'metric' | 'filter' | 'grouping'
) {
  const configKey = type === 'metric' ? 'customMetrics' :
                    type === 'filter' ? 'customFilters' :
                    'customGroupings';

  const getFieldId = (f: string | FieldItem) => typeof f === 'string' ? f : f.id;

  const getFilterFieldId = (f: string | { field: string | { id: string } }) =>
    typeof f === 'string' ? f : (typeof f.field === 'string' ? f.field : f.field.id);

  const newConfig = {
    ...config,
    [configKey]: (config[configKey] || []).filter(m => m.id !== expressionId),
    // Remove from all zones
    filters: config.filters.filter(f => getFilterFieldId(f) !== expressionId),
    columns: config.columns.filter(f => getFieldId(f) !== expressionId),
    rows: config.rows.filter(f => getFieldId(f) !== expressionId),
    values: config.values.filter(v => getFieldId(v.field) !== expressionId)
  };

  // Also remove from filters if it's a custom filter
  if (type === 'filter') {
    newConfig.filters = (config.filters || []).filter(f => f.field !== expressionId);
  }

  // Apply auto-management since deleting a metric could change values count
  return autoManageValuesField(newConfig);
}

/**
 * Remove a field from all configuration zones
 */
export function buildRemoveFieldFromAllZones(
  config: PivotTableConfig,
  fieldId: string
) {
  const getFieldId = (f: string | FieldItem) => typeof f === 'string' ? f : f.id;
  const getFilterFieldId = (f: string | { field: string | { id: string } }) =>
    typeof f === 'string' ? f : (typeof f.field === 'string' ? f.field : f.field.id);

  const newConfig = {
    ...config,
    filters: config.filters.filter(f => getFilterFieldId(f) !== fieldId),
    columns: config.columns.filter(f => getFieldId(f) !== fieldId),
    rows: config.rows.filter(f => getFieldId(f) !== fieldId),
    values: config.values.filter(v => getFieldId(v.field) !== fieldId)
  };

  // Apply auto-management since removing a field from values could change values count
  return autoManageValuesField(newConfig);
}
