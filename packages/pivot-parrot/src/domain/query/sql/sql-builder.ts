/**
 * SQL Query Building Utilities
 * Constructs WHERE and HAVING clauses using Filter classes
 */

import { buildFilter } from './filters';
import { getFieldById } from '../../field/getFieldById';
import { FieldKind } from '../../models/types';

/**
 * Translate UI filters to SQL WHERE and HAVING clauses
 * @param {Array} filters - Array of filter objects from FilterDialog
 * @param {Array} customFilters - Array of custom filter definitions from config
 * @param {SQLDialect} dialect - SQL dialect for engine-specific generation
 * @param {Array} values - Array of value configurations to detect aggregated filters
 * @param {Array} customMetrics - Array of custom metrics (persisted aggregations)
 * @param {Array} hiddenValues - Array of hidden value configurations (for HAVING clause filters)
 * @returns {Object} { whereClause: string, havingClause: string }
 */
export function buildWhereClauses(filters, customFilters = [], dialect, values = [], customMetrics = [], hiddenValues = []) {
  if (!filters || filters.length === 0) {
    return { whereClause: '', havingClause: '' };
  }

  // Validate dialect parameter
  if (!dialect || typeof dialect.quoteIdentifier !== 'function') {
    throw new Error('buildWhereClauses requires a valid SQLDialect instance');
  }

  // Build a lookup of aggregated fields and their SQL expressions
  // Maps filter field name -> aggregation SQL (e.g., "sum_sales" -> "SUM(sales)")
  const aggregatedFields = new Map();

  // Add currently active values (both visible and hidden)
  const allValues = [...values, ...hiddenValues];
  allValues.forEach(v => {
    if (v.aggregation && v.field) {
      const agg = v.aggregation.toUpperCase();
      const aggSQL = `${agg}(${dialect.quoteIdentifier(v.field)})`;

      // Map various possible field name formats to the aggregation SQL
      aggregatedFields.set(`${agg}_${v.field}`, aggSQL); // e.g., "SUM_sales"
      aggregatedFields.set(`${agg.toLowerCase()}_${v.field}`, aggSQL); // e.g., "sum_sales"
      aggregatedFields.set(v.field, aggSQL); // e.g., "sales" (when only one aggregation exists)
    }
  });

  // Add custom metrics (persisted aggregations)
  customMetrics.forEach(m => {
    if (m.aggregation && m.field) {
      const agg = m.aggregation.toUpperCase();
      const aggSQL = `${agg}(${dialect.quoteIdentifier(m.field)})`;
      aggregatedFields.set(m.id, aggSQL); // Use custom metric ID
    } else if (m.expr) {
      // Custom metric with expression
      aggregatedFields.set(m.id, m.expr);
    }
  });

  const whereConditions = [];
  const havingConditions = [];

  filters.forEach(f => {
    // Determine if this is a HAVING filter (on aggregated value)
    const isHaving = f.filterType === 'having' || aggregatedFields.has(f.field);
    const aggSQL = aggregatedFields.get(f.field);

    // Build the filter SQL
    let filterSQL;
    if (f.isCustom || f.type === 'custom_filter') {
      const customFilter = customFilters.find(cf => cf.id === f.field);
      if (customFilter) {
        filterSQL = buildFilter({
          ...f,
          expr: customFilter.expr,
          name: customFilter.name
        }).toSQL(dialect);
      }
    } else {
      filterSQL = buildFilter(f).toSQL(dialect);
    }

    if (!filterSQL) return;

    // For HAVING filters, replace field reference with aggregation SQL
    if (isHaving && aggSQL) {
      const quotedField = dialect.quoteIdentifier(f.field);
      filterSQL = filterSQL.replace(quotedField, aggSQL);
    }

    // Route to appropriate clause
    if (isHaving) {
      havingConditions.push(filterSQL);
    } else {
      whereConditions.push(filterSQL);
    }
  });

  return {
    whereClause: whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '',
    havingClause: havingConditions.length > 0 ? 'HAVING ' + havingConditions.join(' AND ') : ''
  };
}

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
    } else if (fieldItem?.kind === FieldKind.CUSTOM_GROUPING && fieldItem.formula) {
      // Custom grouping used as filter - replace field with the expression
      const groupingExpr = `(${fieldItem.formula})`;
      if (f.type === 'custom_expr' && f.value) {
        // Replace {{field}} placeholder with the resolved expression
        const resolvedExpr = f.value.replace(/\{\{field\}\}/g, groupingExpr);
        filterSQL = `(${resolvedExpr})`;
      } else {
        filterSQL = buildFilter({
          ...f,
          field: groupingExpr,
          dtype: fieldItem.dtype
        }).toSQL(dialect, false); // Don't quote since it's an expression
      }
    } else {
      filterSQL = buildFilter({ ...f, dtype: fieldItem?.dtype }).toSQL(dialect);
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
 * Legacy function for backwards compatibility
 * @deprecated Use buildWhereClauses instead
 */
export function buildWhereClause(filters, customFilters = [], dialect) {
  const { whereClause } = buildWhereClauses(filters, customFilters, dialect);
  return whereClause;
}
