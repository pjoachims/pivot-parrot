/**
 * Field Utilities for FieldOptions
 * Helper functions for field operations and checking
 */

import { generateUniqueId } from './nameGenerator';
import { CustomMetric, CustomFilter, CustomGrouping } from '../../domain/models/types';
import { getArrowType } from '../../domain/types/ArrowTypes';
export { lookupField, getFieldSQL, fieldExists, getFieldLabel, createFieldLookup } from './lookupField';

type CustomExpression = CustomMetric | CustomFilter | CustomGrouping;

// Helper: extract field ID (handles FieldItem objects, Filter objects, and 'Σ Values' string)
// FieldItems use 'id', Filters use 'field'
const getFieldId = (f) => typeof f === 'string' ? f : (f.field || f.id);

/**
 * Check if a field is currently used in any zone
 */
export function isFieldUsed(fieldName, config) {
  // For custom metrics, check if they're in customMetrics (not if in Values)
  const isCustomMetric = (config.customMetrics || []).some(m => m.id === fieldName);
  if (isCustomMetric) {
    return true; // Custom metrics are always "used" (they're stored separately)
  }

  return config.filters.some(f => getFieldId(f) === fieldName) ||
         config.columns.some(f => getFieldId(f) === fieldName) ||
         config.rows.some(f => getFieldId(f) === fieldName) ||
         config.values.some(v => getFieldId(v.field) === fieldName) ||
         (fieldName === 'Σ Values' && (config.rows.some(f => getFieldId(f) === 'Σ Values') || config.columns.some(f => getFieldId(f) === 'Σ Values')));
}

/**
 * Check if a custom metric is currently in use (in Values)
 */
export function isCustomMetricInUse(metricId, config) {
  return config.values.some(v => getFieldId(v.field) === metricId);
}

/**
 * Remove a field from a specific zone
 */
export function removeFromZone(fieldName, zone, config) {
  let newConfig = { ...config };
  if (zone === 'filters') {
    newConfig.filters = config.filters.filter(f => getFieldId(f) !== fieldName);
  } else if (zone === 'columns') {
    newConfig.columns = config.columns.filter(f => getFieldId(f) !== fieldName);
  } else if (zone === 'rows') {
    newConfig.rows = config.rows.filter(f => getFieldId(f) !== fieldName);
  } else if (zone === 'values') {
    newConfig.values = config.values.filter(v => getFieldId(v.field) !== fieldName);
  }
  return newConfig;
}

/**
 * Change aggregation for a specific value entry by index
 */
export function changeAggregation(index, aggregation, config) {
  const newValues = config.values.map((v, i) => {
    return i === index ? { ...v, aggregation } : v;
  });

  return {
    ...config,
    values: newValues
  };
}

/**
 * Enrich config.values with metric details from config.customMetrics
 */
export function enrichValuesWithMetrics(config) {
  if (!config || !Array.isArray(config.values)) {
    return [];
  }

  return config.values.map(v => {
    if (v.isCustom) {
      const metric = (config.customMetrics || []).find(m => m.id === v.field);
      if (metric) {
        return {
          ...v,
          name: metric.name,
          expr: metric.expr,
          format: metric.format
        };
      }
    }
    return v;
  });
}

/**
 * Filter available fields based on search query
 * Excludes Σ Values and derived fields
 */
export function filterAvailableFields(availableFields, derivedFieldsMap, searchQuery) {
  const allDerivedFields = Object.values(derivedFieldsMap).flat();
  const filtered = availableFields.filter(field => {
    const fieldId = typeof field === 'string' ? field : field.id;
    return fieldId !== 'Σ Values' && !allDerivedFields.includes(fieldId);
  });

  if (!searchQuery.trim()) {
    return filtered;
  }

  const query = searchQuery.toLowerCase();
  return filtered.filter(field => {
    const fieldId = typeof field === 'string' ? field : field.id;
    const fieldName = typeof field === 'string' ? field : (field.name || field.id);
    return fieldId.toLowerCase().includes(query) || fieldName.toLowerCase().includes(query);
  });
}

/**
 * Filter custom metrics based on search query
 */
export function filterCustomMetrics(customMetrics, searchQuery) {
  if (!searchQuery.trim()) {
    return customMetrics;
  }

  const query = searchQuery.toLowerCase();
  return customMetrics.filter(m => m.name.toLowerCase().includes(query));
}

/**
 * Deduplicate a name by adding (1), (2), etc. if it already exists
 * Similar to Windows file naming
 */
function deduplicateName(name, existingNames) {
  if (!existingNames.includes(name)) {
    return name;
  }

  let counter = 1;
  let newName = `${name} (${counter})`;

  while (existingNames.includes(newName)) {
    counter++;
    newName = `${name} (${counter})`;
  }

  return newName;
}

/**
 * Create new custom expression definition (metric, filter, or grouping)
 */
export function createCustomMetric(name, formula, format, type = 'metric', config = null, availableFields = [], derivedFieldsMap = {}) {
  // Deduplicate name if config is provided
  let finalName = name;
  let expressionId;

  if (config) {
    const existingNames = getAllCustomNames(config, availableFields, derivedFieldsMap);
    finalName = deduplicateName(name, existingNames);

    // Generate friendly ID from the name
    const existingIds = getAllExistingIds(config, availableFields, derivedFieldsMap);
    const prefix = type === 'filter' ? 'filter' : type === 'grouping' ? 'grouping' : 'custom';
    expressionId = generateUniqueId(finalName, existingIds, prefix);
  } else {
    // Fallback to timestamp-based ID if no config is provided
    const prefix = type === 'filter' ? 'filter' : type === 'grouping' ? 'grouping' : 'custom';
    expressionId = `${prefix}_${Date.now()}`;
  }

  const definition: CustomExpression = {
    id: expressionId,
    name: finalName,
    expr: formula,
    ...(type === 'metric' && format ? { format } : {})
  };

  return definition;
}

/**
 * Get all custom names (metrics, filters, groupings) from config plus existing field names and derived fields
 */
function getAllCustomNames(config, availableFields = [], derivedFieldsMap = {}) {
  const names = [];

  // Add existing data field names
  availableFields.forEach(field => {
    const fieldName = typeof field === 'string' ? field : (field.name || field.id);
    if (fieldName) {
      names.push(fieldName);
    }
  });

  // Add derived field names (flatten all derived fields from the map)
  Object.values(derivedFieldsMap).forEach((derivedFields: any) => {
    derivedFields.forEach((df: any) => {
      const derivedFieldName = typeof df === 'string' ? df : df.id;
      if (derivedFieldName) {
        names.push(derivedFieldName);
      }
    });
  });

  // Add custom metric names
  if (config.customMetrics) {
    names.push(...config.customMetrics.map(m => m.name));
  }

  // Add custom filter names
  if (config.customFilters) {
    names.push(...config.customFilters.map(f => f.name));
  }

  // Add custom grouping names
  if (config.customGroupings) {
    names.push(...config.customGroupings.map(g => g.name));
  }

  return names;
}

/**
 * Get all existing IDs (metrics, filters, groupings) from config plus available field IDs
 */
function getAllExistingIds(config, availableFields = [], derivedFieldsMap = {}) {
  const ids = [];

  // Add existing data field IDs
  availableFields.forEach(field => {
    const fieldId = typeof field === 'string' ? field : field.id;
    if (fieldId) {
      ids.push(fieldId);
    }
  });

  // Add derived field IDs (flatten all derived fields from the map)
  Object.values(derivedFieldsMap).forEach((derivedFields: any) => {
    derivedFields.forEach((df: any) => {
      const derivedFieldId = typeof df === 'string' ? df : df.id;
      if (derivedFieldId) {
        ids.push(derivedFieldId);
      }
    });
  });

  // Add custom metric IDs
  if (config.customMetrics) {
    ids.push(...config.customMetrics.map(m => m.id));
  }

  // Add custom filter IDs
  if (config.customFilters) {
    ids.push(...config.customFilters.map(f => f.id));
  }

  // Add custom grouping IDs
  if (config.customGroupings) {
    ids.push(...config.customGroupings.map(g => g.id));
  }

  return ids;
}

/**
 * Update custom expression in config
 */
export function updateCustomMetric(config, expressionId, name, formula, format, type = 'metric') {
  const configKey = type === 'metric' ? 'customMetrics' : type === 'filter' ? 'customFilters' : 'customGroupings';

  return {
    ...config,
    [configKey]: (config[configKey] || []).map(m =>
      m.id === expressionId
        ? { ...m, name, expr: formula, ...(type === 'metric' && format ? { format } : {}) }
        : m
    )
  };
}

/**
 * Add custom expression to config
 */
export function addCustomMetric(config, expressionDefinition, type = 'metric') {
  const configKey = type === 'metric' ? 'customMetrics' : type === 'filter' ? 'customFilters' : 'customGroupings';

  const newConfig = {
    ...config,
    [configKey]: [...(config[configKey] || []), expressionDefinition]
  };

  // Only auto-add metrics to values (filters and groupings are added manually by user)
  if (type === 'metric') {
    newConfig.values = [
      ...config.values,
      {
        field: expressionDefinition.id,
        aggregation: 'custom',
        isCustom: true
      }
    ];
  }

  return newConfig;
}

/**
 * Delete custom metric from config
 */
export function deleteCustomMetric(config, metricId) {
  return {
    ...config,
    customMetrics: (config.customMetrics || []).filter(m => m.id !== metricId),
    values: config.values.filter(v => v.field !== metricId)
  };
}

/**
 * Handle field checkbox toggle (add/remove from zones)
 */
export function toggleFieldUsage(fieldName, checked, config, detectedTypes) {
  let newConfig = { ...config };
  if (checked) {
    // Add to Values zone with smart default aggregation
    if (!config.values.some(v => getFieldId(v.field) === fieldName)) {
      const fieldTypeName = detectedTypes[fieldName]; // e.g., 'int64', 'decimal<35,19>'
      const fieldTypeInfo = getArrowType(fieldTypeName); // Handles parameterized types like decimal<35,19>
      const defaultAgg = fieldTypeInfo?.isNumeric ? 'Sum' : 'Count';
      newConfig.values = [...config.values, { field: fieldName, aggregation: defaultAgg }];
    }
  } else {
    // Remove from all zones
    newConfig.filters = config.filters.filter(f => getFieldId(f) !== fieldName);
    newConfig.columns = config.columns.filter(f => getFieldId(f) !== fieldName);
    newConfig.rows = config.rows.filter(f => getFieldId(f) !== fieldName);
    newConfig.values = config.values.filter(v => getFieldId(v.field) !== fieldName);
  }
  return newConfig;
}

/**
 * Handle custom metric checkbox toggle (add/remove from Values only)
 */
export function toggleCustomMetricUsage(metricId, checked, config) {
  if (checked) {
    // Add to Values zone (store only ID reference)
    return {
      ...config,
      values: [
        ...config.values,
        {
          field: metricId,
          aggregation: 'custom',
          isCustom: true
        }
      ]
    };
  } else {
    // Remove from Values zone (but keep in customMetrics)
    return {
      ...config,
      values: config.values.filter(v => getFieldId(v.field) !== metricId)
    };
  }
}

/**
 * Auto-manage Σ Values field based on number of value fields
 *
 * Rules:
 * - When 2+ value fields: Auto-inject Σ Values to columns (at end) if not already in rows/columns
 * - When 0-1 value fields: Auto-remove Σ Values from rows and columns
 *
 * This should be called after any config change that might affect the values array
 */
export function autoManageValuesField(config: any) {
  const hasMultipleValues = config.values.length >= 2;
  const hasValuesInRows = config.rows.some((f: any) => getFieldId(f) === 'Σ Values');
  const hasValuesInCols = config.columns.some((f: any) => getFieldId(f) === 'Σ Values');

  let newConfig = { ...config };

  if (hasMultipleValues && !hasValuesInRows && !hasValuesInCols) {
    // Auto-inject to columns at the end
    newConfig.columns = [...config.columns, 'Σ Values'];
  } else if (!hasMultipleValues && (hasValuesInRows || hasValuesInCols)) {
    // Auto-remove when only 1 or 0 value fields
    newConfig.rows = config.rows.filter((f: any) => getFieldId(f) !== 'Σ Values');
    newConfig.columns = config.columns.filter((f: any) => getFieldId(f) !== 'Σ Values');
  }

  return newConfig;
}
