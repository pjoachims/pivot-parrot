/**
 * Field Options Actions
 * Extracted from FieldOptionsContext for use in Zustand store
 */

import type { PivotTableConfig, Filter, ValueConfig, DerivedField } from '../../domain/models/types';
import { FieldKind, SIGMA_VALUES_ID } from '../../domain/models/types';
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
import { aggregationId } from '../../domain/field/aggregations';

function getFieldKind(fieldName: string, config: PivotTableConfig, availableFields: FieldItem[]): FieldKind {
  if (fieldName === SIGMA_VALUES_ID) return FieldKind.SIGMA_VALUES;
  return getFieldById(fieldName, availableFields, config)?.kind ?? FieldKind.BASE_FIELD;
}

function matchesValueConfig(fieldName: string, valueConfig: ValueConfig): boolean {
  if (valueConfig.isCustom) {
    return valueConfig.field === fieldName;
  }
  return aggregationId(valueConfig) === fieldName;
}

function sameValue(a: ValueConfig, b: ValueConfig): boolean {
  return a.field === b.field
    && a.aggregation.toUpperCase() === b.aggregation.toUpperCase()
    && Boolean(a.isCustom) === Boolean(b.isCustom);
}

/**
 * Insert `item` at `index` after removing every entry `isSame` matches. `index`
 * is a drop position counted in `items` as the user saw them, removed entries included.
 */
function insertOnce<T>(items: T[], item: T, index: number, isSame: (entry: T, position: number) => boolean): T[] {
  const removedBefore = items.slice(0, index).filter(isSame).length;
  const kept = items.filter((entry, position) => !isSame(entry, position));
  kept.splice(index - removedBefore, 0, item);
  return kept;
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

type DimensionZone = 'rows' | 'columns' | 'filters';
const DIMENSION_ZONES: DimensionZone[] = ['rows', 'columns', 'filters'];

function isDimensionZone(zone: string | null): zone is DimensionZone {
  return DIMENSION_ZONES.includes(zone as DimensionZone);
}

function removeFromZone(config: PivotTableConfig, zone: DimensionZone, fieldName: string): PivotTableConfig {
  return zone === 'filters'
    ? { ...config, filters: (config.filters || []).filter(f => f.field !== fieldName) }
    : { ...config, [zone]: config[zone].filter(f => f !== fieldName) };
}

/** The Values entry a field dropped into Values becomes. */
function measureValueConfig(
  fieldName: string,
  kind: FieldKind,
  fieldItem: FieldItem | null | undefined,
  draggedValueConfig: ValueConfig | undefined,
  detectedTypes: Record<string, string | number>
): ValueConfig {
  if (kind === FieldKind.CUSTOM_METRIC) return { field: fieldName, aggregation: 'custom', isCustom: true };
  if (kind === FieldKind.AGGREGATION && draggedValueConfig) return { ...draggedValueConfig };
  if (kind === FieldKind.AGGREGATION && fieldItem?.sourceField && fieldItem.aggregation) {
    // Coming back from Filters, where the aggregation lived as a HAVING filter
    return { field: fieldItem.sourceField, aggregation: fieldItem.aggregation as ValueConfig['aggregation'] };
  }
  return { field: fieldName, aggregation: isNumericType(detectedTypes[fieldName]) ? 'Sum' : 'Count' };
}

export function buildHandleDrop(
  config: PivotTableConfig,
  availableFields: FieldItem[],
  detectedTypes: Record<string, string | number>
) {
  return (fieldName: string, sourceZone: string, targetZone: string | null, index: number | null = null, sourceIndex: number | null = null) => {
    // Step 1: Determine field type
    const fieldItem = getFieldById(fieldName, availableFields, config);
    const kind = getFieldKind(fieldName, config, availableFields);
    const isMeasure = kind === FieldKind.AGGREGATION || kind === FieldKind.CUSTOM_METRIC;
    const draggedValueConfig = sourceZone === 'values'
      ? (sourceIndex !== null && sourceIndex >= 0 && sourceIndex < config.values.length
          ? config.values[sourceIndex]
          : config.values.find(v => matchesValueConfig(fieldName, v)))
      : config.values.find(v => matchesValueConfig(fieldName, v));

    // Step 2: Remove from source
    let newConfig = { ...config };
    if (isDimensionZone(sourceZone)) {
      newConfig = removeFromZone(newConfig, sourceZone, fieldName);
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

    // Σ Values only lays out the metrics, in Rows or Columns.
    if (kind === FieldKind.SIGMA_VALUES && targetZone !== 'rows' && targetZone !== 'columns') {
      return { config, shouldOpenFilterDialog: false, shouldOpenHavingDialog: false, fieldName: null };
    }

    // A metric dropped on Rows or Columns lays the metrics out there (like dragging Σ Values in Excel):
    // it stays in Values, or joins them, and Σ Values moves to the drop position.
    if (isMeasure && (targetZone === 'rows' || targetZone === 'columns')) {
      const kept = sourceZone === 'values' ? config : newConfig;
      const values = draggedValueConfig
        ? kept.values
        : [...kept.values, measureValueConfig(fieldName, kind, fieldItem, draggedValueConfig, detectedTypes)];
      const sigmaIndex = config[targetZone].indexOf(SIGMA_VALUES_ID);
      const sigmaAt = sigmaIndex !== -1 && sigmaIndex < insertAt ? insertAt - 1 : insertAt;
      const withoutSigma = (zone: 'rows' | 'columns') => kept[zone].filter(f => f !== SIGMA_VALUES_ID);
      const placed = { ...kept, values, rows: withoutSigma('rows'), columns: withoutSigma('columns') };
      placed[targetZone] = [...placed[targetZone]];
      placed[targetZone].splice(Math.min(sigmaAt, placed[targetZone].length), 0, SIGMA_VALUES_ID);
      return { config: autoManageValuesField(placed), shouldOpenFilterDialog: false, shouldOpenHavingDialog: false, fieldName: null };
    }

    // Rows and Columns hold a field once between them, so dropping it into one moves it there whatever
    // the source. Filters and Values may hold it alongside: a row field can be filtered too.
    if (targetZone === 'rows' || targetZone === 'columns') {
      newConfig = removeFromZone(newConfig, targetZone === 'rows' ? 'columns' : 'rows', fieldName);
    }

    if (targetZone === 'rows' || targetZone === 'columns') {
      newConfig[targetZone] = insertOnce(config[targetZone], fieldName, insertAt, f => f === fieldName);

    } else if (targetZone === 'values') {
      const valueConfig = measureValueConfig(fieldName, kind, fieldItem, draggedValueConfig, detectedTypes);
      // A field may sit in Values with several aggregations (and in Rows too), but not twice with the same one.
      newConfig.values = insertOnce(config.values, valueConfig, insertAt,
        (v, position) => sameValue(v, valueConfig) || (sourceZone === 'values' && position === sourceIndex));

    } else if (targetZone === 'filters') {
      // Enrich filter with info from FieldItem for HAVING clause generation
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

      const filters = config.filters || [];
      const placed = filters.find(f => f.field === fieldName) ?? filterItem;
      newConfig.filters = insertOnce(filters, placed, insertAt, f => f.field === fieldName);

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
    // Keep what the drop put on the filter (filterType, aggregation, ...), but no values of an earlier type.
    const { value, selectedValues, betweenStart, betweenEnd, relative, ...dropped } = config.filters[existingIndex];
    const newFilters = [...config.filters];
    newFilters[existingIndex] = { ...dropped, ...filter };
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
