/**
 * Serialization utilities for Pivot configuration
 *
 * Provides compact JSON representation of pivot state with minimal data needed for reconstruction
 */

// Type definitions for serialization objects
interface SerializedValue {
  field: any;
  agg: any;
  custom?: boolean;
  fmt?: any;
}

interface SerializedMetric {
  id: any;
  name: any;
  expr: any;
  fmt?: any;
}

interface SerializedFilter {
  field: any;
  type: any;
  values?: any;
  value?: any;
  start?: any;
  end?: any;
  not?: boolean;
  custom?: boolean;
}

interface ActiveFilter {
  field: any;
  type: any;
  selectedValues?: any;
  value?: any;
  start?: any;
  end?: any;
  betweenStart?: any;
  betweenEnd?: any;
  isNot?: boolean;
  isCustom?: boolean;
}

/**
 * Extract field ID from FieldItem object or string
 */
function getFieldId(field) {
  return typeof field === 'string' ? field : field.id;
}

/**
 * Serialize FieldItem to minimal representation
 */
function serializeFieldItem(fieldItem) {
  if (typeof fieldItem === 'string') {
    return { id: fieldItem };
  }

  return {
    id: fieldItem.id,
    dtype: fieldItem.dtype,
    ...(fieldItem.name !== fieldItem.id && { name: fieldItem.name })
  };
}

/**
 * Serialize value config (field + aggregation)
 */
function serializeValue(value: any): SerializedValue {
  const serialized: SerializedValue = {
    field: getFieldId(value.field),
    agg: value.aggregation
  };

  if (value.isCustom) serialized.custom = true;
  if (value.format) serialized.fmt = value.format;

  return serialized;
}

/**
 * Serialize custom metric
 */
function serializeCustomMetric(metric: any): SerializedMetric {
  const serialized: SerializedMetric = {
    id: metric.id,
    name: metric.name,
    expr: metric.expr
  };

  if (metric.format) serialized.fmt = metric.format;

  return serialized;
}

/**
 * Serialize custom expression (filter/grouping)
 */
function serializeCustomExpression(expression) {
  return {
    id: expression.id,
    name: expression.name,
    expr: expression.expr
  };
}

/**
 * Serialize active filter
 */
function serializeActiveFilter(filter: ActiveFilter): SerializedFilter {
  const serialized: SerializedFilter = {
    field: getFieldId(filter.field),
    type: filter.type
  };

  // Add type-specific data
  if (filter.selectedValues) serialized.values = filter.selectedValues;
  if (filter.value !== undefined) serialized.value = filter.value;
  if (filter.start !== undefined) serialized.start = filter.start;
  if (filter.end !== undefined) serialized.end = filter.end;
  if (filter.betweenStart !== undefined) serialized.start = filter.betweenStart;
  if (filter.betweenEnd !== undefined) serialized.end = filter.betweenEnd;
  if (filter.isNot) serialized.not = true;
  if (filter.isCustom) serialized.custom = true;

  return serialized;
}

/**
 * Serialize complete pivot configuration to minimal JSON
 */
export function serializeConfig(config, availableFields = [], derivedFieldsMap = {}) {
  return {
    config: {
      rows: (config.rows || []).map(getFieldId),
      columns: (config.columns || []).map(getFieldId),
      values: (config.values || []).map(serializeValue),
      filters: (config.filters || []).map(serializeActiveFilter),
      customMetrics: (config.customMetrics || []).map(serializeCustomMetric),
      customFilters: (config.customFilters || []).map(serializeCustomExpression),
      customGroupings: (config.customGroupings || []).map(serializeCustomExpression)
    },
    fields: availableFields.map(serializeFieldItem),
    derived: derivedFieldsMap
  };
}

/**
 * Deserialize FieldItem from minimal representation
 */
function deserializeFieldItem(data) {
  if (typeof data === 'string') {
    return { id: data, name: data, dtype: null };
  }

  return {
    id: data.id,
    name: data.name || data.id,
    dtype: data.dtype || null,
    semanticType: inferSemanticType(data.dtype),
    sourceField: null,
    isBase: true,
    isDerived: false,
    aggregation: null,
    formula: null,
    format: null
  };
}

/**
 * Infer semantic type from dtype
 */
function inferSemanticType(dtype) {
  if (!dtype) return 'category';

  const upper = dtype.toUpperCase();

  if (upper.includes('INT') || upper.includes('DOUBLE') ||
      upper.includes('FLOAT') || upper.includes('DECIMAL') ||
      upper.includes('NUMERIC')) {
    return 'measure';
  }

  if (upper.includes('DATE')) return 'date';
  if (upper.includes('TIMESTAMP')) return 'timestamp';
  if (upper.includes('BOOL')) return 'boolean';

  return 'category';
}

/**
 * Deserialize value config
 */
function deserializeValue(data) {
  return {
    field: data.field,
    aggregation: data.agg,
    ...(data.custom && { isCustom: true }),
    ...(data.fmt && { format: data.fmt })
  };
}

/**
 * Deserialize custom metric
 */
function deserializeCustomMetric(data) {
  return {
    id: data.id,
    name: data.name,
    expr: data.expr,
    ...(data.fmt && { format: data.fmt })
  };
}

/**
 * Deserialize custom expression
 */
function deserializeCustomExpression(data) {
  return {
    id: data.id,
    name: data.name,
    expr: data.expr
  };
}

/**
 * Deserialize active filter
 */
function deserializeActiveFilter(data: SerializedFilter): ActiveFilter {
  const filter: ActiveFilter = {
    field: data.field,
    type: data.type
  };

  // Restore type-specific data
  if (data.values !== undefined) filter.selectedValues = data.values;
  if (data.value !== undefined) filter.value = data.value;
  if (data.start !== undefined) {
    filter.start = data.start;
    filter.betweenStart = data.start; // Support both naming conventions
  }
  if (data.end !== undefined) {
    filter.end = data.end;
    filter.betweenEnd = data.end;
  }
  if (data.not) filter.isNot = true;
  if (data.custom) filter.isCustom = true;

  return filter;
}

/**
 * Deserialize complete pivot configuration from minimal JSON
 */
export function deserializeConfig(serialized) {
  const availableFields = (serialized.fields || []).map(deserializeFieldItem);

  // Build detectedTypes from fields
  const detectedTypes = {};
  availableFields.forEach(field => {
    if (field.dtype) {
      const dtype = field.dtype.toUpperCase();
      if (dtype.includes('INT')) {
        detectedTypes[field.id] = 'integer';
      } else if (dtype.includes('DOUBLE') || dtype.includes('FLOAT') ||
                 dtype.includes('DECIMAL') || dtype.includes('NUMERIC')) {
        detectedTypes[field.id] = 'numeric';
      } else if (dtype.includes('TIMESTAMP')) {
        detectedTypes[field.id] = 'timestamp';
      } else if (dtype.includes('DATE')) {
        detectedTypes[field.id] = 'date';
      } else if (dtype.includes('BOOL')) {
        detectedTypes[field.id] = 'boolean';
      } else {
        detectedTypes[field.id] = 'string';
      }
    }
  });

  return {
    config: {
      rows: serialized.config.rows || [],
      columns: serialized.config.columns || [],
      values: (serialized.config.values || []).map(deserializeValue),
      filters: (serialized.config.filters || []).map(deserializeActiveFilter),
      customMetrics: (serialized.config.customMetrics || []).map(deserializeCustomMetric),
      customFilters: (serialized.config.customFilters || []).map(deserializeCustomExpression),
      customGroupings: (serialized.config.customGroupings || []).map(deserializeCustomExpression)
    },
    availableFields,
    detectedTypes,
    derivedFieldsMap: serialized.derived || {}
  };
}
