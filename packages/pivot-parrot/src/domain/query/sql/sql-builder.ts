/**
 * SQL Query Building Utilities
 * Constructs WHERE conditions using Filter classes
 */

import { buildFilter } from './filters';
import { getFieldById } from '../../field/getFieldById';
import { resolveFieldExpr } from '../../field/resolveFieldExpr';
import { buildReferenceLookup, resolveDerivedFieldsInExpressionV2 } from '../../field/derived-field-resolver-v2';
import { FieldKind } from '../../models/types';

/**
 * Convert activeFilters to drilldown filter format
 * Takes UI filters and converts them to {field, sqlExpr, value?, dtype?} objects
 * for use in drilldown queries. Only handles WHERE filters (skips HAVING filters
 * based on filterType property).
 *
 * @param {Array} activeFilters - Array of filter objects from FilterDialog
 * @param {SQLDialect} dialect - SQL dialect for engine-specific generation
 * @param {Array} availableFields - Array of available fields for lookup
 * @param {Object} config - Pivot config for getFieldById lookup
 * @returns {Array} Array of filter objects for drilldown: {field, sqlExpr, value?, dtype?}
 */
export function buildFieldItemFilters(activeFilters, dialect, availableFields = [], config: any = {}) {
  if (!activeFilters || activeFilters.length === 0) {
    return [];
  }

  const drilldownFilters = [];

  activeFilters.forEach(f => {
    // Skip HAVING filters (aggregated values) - drilldown is on raw data
    if (f.filterType === 'having') return;

    // Look up field to check if it's a custom filter or custom grouping
    const fieldItem = getFieldById(f.field, availableFields, config);

    // Build the filter SQL expression
    let filterSQL;
    if (f.isCustom || f.type === 'custom_filter' || fieldItem?.kind === FieldKind.CUSTOM_FILTER) {
      // Custom filter - use the stored expression directly
      if (fieldItem?.formula) {
        filterSQL = buildFilter({
          ...f,
          expr: fieldItem.formula,
          name: fieldItem.name
        }).toSQL(dialect);
      }
    } else {
      const fieldExpr = resolveFieldExpr(f.field, availableFields, config, dialect);
      if (f.type === 'custom_expr' && f.value) {
        filterSQL = `(${f.value.replace(/\{\{field\}\}/g, fieldExpr)})`;
      } else {
        filterSQL = buildFilter({ ...f, field: fieldExpr, dtype: fieldItem?.dtype }).toSQL(dialect, false);
      }
    }

    if (!filterSQL) return;

    // Add to drilldown filters
    // For drilldown, we store the full SQL expression rather than decomposing it
    drilldownFilters.push({
      field: f.field,
      sqlExpr: filterSQL,
      // Don't include value/dtype for complex filters - the sqlExpr contains everything
      filterType: f.type
    });
  });

  return drilldownFilters;
}

/**
 * The WHERE condition (without the keyword) of filters built by buildFieldItemFilters,
 * with {{}} references resolved against dimensions, as the pivot query applies it.
 */
export function buildWhereCondition(whereFilters, dialect, availableFields = [], config: any = {}): string {
  const dimensionLookup = buildReferenceLookup({
    availableFields,
    customGroupings: config.customGroupings || [],
    customFilters: config.customFilters || [],
    customMetrics: config.customMetrics || [],
    includeMetrics: false
  });
  const resolved = whereFilters.map(f => ({
    ...f,
    sqlExpr: f.sqlExpr ? resolveDerivedFieldsInExpressionV2(f.sqlExpr, dimensionLookup) : f.sqlExpr
  }));
  return resolved.length > 0 ? dialect.buildWhereClause(resolved) : '';
}
