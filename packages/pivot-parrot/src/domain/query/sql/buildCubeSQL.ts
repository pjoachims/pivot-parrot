import { resolveMetricReferences } from '../../field/metric-resolver';
import { buildReferenceLookup, resolveDerivedFieldsInExpressionV2 } from '../../field/derived-field-resolver-v2';
import { getFieldById } from '../../field/getFieldById';
import { FieldKind } from '../../models/types';
import { AGGREGATION_SQL_NAMES } from './aggregations';

/**
 * Build CUBE SQL query from pivot configuration
 *
 * @param {Object} config - Pivot configuration
 * @param {Array} whereFilters - Array of WHERE filter objects {field, value?, dtype?, sqlExpr?}
 * @param {Object} fieldTypes - Field type mapping {fieldName: type}
 * @param {string} tableName - Table name (default: 'pivot_data')
 * @param {SQLDialect} dialect - SQL dialect for engine-specific SQL generation
 * @param {Array} availableFields - Array of FieldItems (base fields, derived fields)
 * @param {Array} havingFilters - Array of HAVING filter objects {field, value?, dtype?, sqlExpr?}
 * @param {boolean} disableSubtotals - If true, use regular GROUP BY instead of CUBE (no subtotals)
 * @returns {string} SQL query
 */
export function buildCubeSQL(config, whereFilters = [], fieldTypes = {}, tableName = 'pivot_data', dialect, availableFields = [], havingFilters = [], disableSubtotals = false) {
  // Validate dialect parameter
  if (!dialect || typeof dialect.quoteIdentifier !== 'function') {
    throw new Error('buildCubeSQL requires a valid SQLDialect instance');
  }

  // Build context-aware reference lookups for {{}} syntax resolution

  // For WHERE filters and custom groupings: Can reference derived fields, custom groupings, custom filters
  // (but NOT custom metrics - those are aggregations)
  const dimensionLookup = buildReferenceLookup({
    availableFields,
    customGroupings: config.customGroupings || [],
    customFilters: config.customFilters || [],
    customMetrics: config.customMetrics || [],
    includeMetrics: false  // Dimensions can't reference aggregations
  });

  // For custom metrics: Can reference everything (derived fields, groupings, filters, other metrics)
  const metricLookup = buildReferenceLookup({
    availableFields,
    customGroupings: config.customGroupings || [],
    customFilters: config.customFilters || [],
    customMetrics: config.customMetrics || [],
    includeMetrics: true  // Metrics can reference other metrics for composition
  });

  // Resolve references in filter expressions (use dimension lookup)
  const resolvedWhereFilters = (whereFilters || []).map(f => ({
    ...f,
    sqlExpr: f.sqlExpr ? resolveDerivedFieldsInExpressionV2(f.sqlExpr, dimensionLookup) : f.sqlExpr
  }));

  // HAVING filters could potentially reference metrics, but typically reference aggregations
  // For now, use dimension lookup (most HAVING filters are on SUM_field etc, not custom metrics)
  const resolvedHavingFilters = (havingFilters || []).map(f => ({
    ...f,
    sqlExpr: f.sqlExpr ? resolveDerivedFieldsInExpressionV2(f.sqlExpr, dimensionLookup) : f.sqlExpr
  }));

  // Build WHERE and HAVING clauses from filter objects
  const whereClause = resolvedWhereFilters.length > 0
    ? 'WHERE ' + dialect.buildWhereClause(resolvedWhereFilters)
    : '';

  const havingClause = resolvedHavingFilters.length > 0
    ? 'HAVING ' + dialect.buildWhereClause(resolvedHavingFilters)
    : '';

  // Helper: extract field ID (handles FieldItem objects and 'Σ Values' string)
  const getFieldId = (f) => typeof f === 'string' ? f : f.id;

  // Use dialect for identifier quoting
  const quoteIdentifier = (id) => dialect.quoteIdentifier(id);

  const customGroupings = config.customGroupings || [];

  // Build dimension expressions for SELECT and GROUP BY using getFieldById
  const buildDimensionExpr = (fieldId) => {
    // Get field metadata
    const fieldItem = getFieldById(fieldId, availableFields, config);

    if (!fieldItem) {
      // Field not found - treat as regular column
      const quoted = quoteIdentifier(fieldId);
      return {
        id: fieldId,
        expr: quoted,
        alias: quoted,
        forGroupBy: quoted
      };
    }

    // Handle different field kinds
    if (fieldItem.kind === FieldKind.CUSTOM_GROUPING && fieldItem.formula) {
      // Custom grouping - resolve {{}} references
      const resolvedExpr = resolveDerivedFieldsInExpressionV2(fieldItem.formula, dimensionLookup);
      return {
        id: fieldId,
        expr: resolvedExpr,
        alias: quoteIdentifier(fieldId),
        forGroupBy: resolvedExpr
      };
    }

    if (fieldItem.kind === FieldKind.DERIVED_FIELD && fieldItem.formula) {
      // Derived field - use formula as SQL expression
      return {
        id: fieldId,
        expr: fieldItem.formula,
        alias: quoteIdentifier(fieldId),
        forGroupBy: fieldItem.formula
      };
    }

    // Base field - use quoted identifier
    const quoted = quoteIdentifier(fieldId);
    return {
      id: fieldId,
      expr: quoted,
      alias: quoted,
      forGroupBy: quoted
    };
  };

  // Filter out 'Σ Values' placeholder - it's not an actual column
  const rowDimensions = (config.rows || [])
    .filter(r => getFieldId(r) !== 'Σ Values')
    .map(r => buildDimensionExpr(getFieldId(r)));

  const colDimensions = (config.columns || [])
    .filter(c => getFieldId(c) !== 'Σ Values')
    .map(c => buildDimensionExpr(getFieldId(c)));

  const allDimensions = [...rowDimensions, ...colDimensions];
  const groupBy = allDimensions.map(d => d.forGroupBy);

  // Extract custom metrics for reference resolution
  const customMetrics = (config.customMetrics || []).map(m => ({
    name: m.name,
    expr: m.expr
  }));

  const aggNameMap = AGGREGATION_SQL_NAMES;

  // Helper: resolve field to its SQL expression (for custom groupings, derived fields, etc.)
  const resolveFieldExpr = (fieldId) => {
    const fieldItem = getFieldById(fieldId, availableFields, config);

    if (!fieldItem) {
      // Field not found - treat as regular column
      return quoteIdentifier(fieldId);
    }

    // Custom grouping - resolve {{}} references and return the expression
    if (fieldItem.kind === FieldKind.CUSTOM_GROUPING && fieldItem.formula) {
      return resolveDerivedFieldsInExpressionV2(fieldItem.formula, dimensionLookup);
    }

    // Derived field - use formula as SQL expression
    if (fieldItem.kind === FieldKind.DERIVED_FIELD && fieldItem.formula) {
      return resolveDerivedFieldsInExpressionV2(fieldItem.formula, dimensionLookup);
    }

    // Base field - use quoted identifier
    return quoteIdentifier(fieldId);
  };

  // Build aggregation expressions
  // Combine visible values and hidden values for SQL generation
  const allValues = [...(config.values || []), ...(config.hiddenValues || [])];
  const aggs = allValues.map(v => {
    if (v.isCustom) {
      // Custom metrics: resolve {{}} references, then metric references, no casting
      // User is responsible for writing engine-compatible SQL and knows the return type
      // Step 1: Resolve {{}} syntax (derived fields, groupings, filters, other metrics)
      const exprWithReferences = resolveDerivedFieldsInExpressionV2(v.expr, metricLookup);
      // Step 2: Resolve metric references (SUM_field -> SUM(...))
      const resolvedExpr = resolveMetricReferences(exprWithReferences, customMetrics);
      return `${resolvedExpr} AS ${quoteIdentifier(v.field)}`;
    }

    const fieldType = fieldTypes[v.field];
    const aggUpper = v.aggregation.toUpperCase().trim();
    const aggAlias = v.aggregation.toLowerCase().replace(/\s+/g, '_'); // Lowercase for consistency
    // Resolve field to its expression (handles custom groupings, derived fields)
    const fieldExpr = resolveFieldExpr(v.field);

    // Validate: numeric aggregations (SUM, AVG) work on numeric and boolean fields
    const numericAggs = ['SUM', 'AVG'];
    // Get Arrow type definition: either it's already an object, or look it up by name
    // For parameterized types like "decimal<35,19>", extract base type for lookup
    let baseFieldType = fieldType;
    if (fieldType && typeof fieldType === 'string' && fieldType.includes('<')) {
      baseFieldType = fieldType.slice(0, fieldType.indexOf('<'));
    }
    const typeInfo = (fieldType && typeof fieldType === 'object' && 'isNumeric' in fieldType)
      ? fieldType  // Already an Arrow type object
      : (baseFieldType ? dialect.types[baseFieldType] : null);  // Type name string - look up in dialect
    const isNumericType = typeInfo?.isNumeric === true;
    if (numericAggs.includes(aggUpper) && !isNumericType) {
      // Fallback to COUNT
      const countExpr = dialect.getAggregation('count', fieldExpr);
      return `${dialect.cast(countExpr, 'bigint')} AS ${quoteIdentifier(`count_${v.field}`)}`;
    }

    // Get aggregation name for dialect registry
    const aggKey = aggNameMap[aggUpper];
    if (!aggKey) {
      throw new Error(`Unknown aggregation type: ${aggUpper}`);
    }

    // Check if dialect supports this aggregation
    if (!dialect.supports('aggregation', aggKey)) {
      throw new Error(
        `Aggregation '${aggUpper}' is not supported by ${dialect.name} dialect. ` +
        `Available: ${Object.keys(dialect.aggregations).join(', ')}`
      );
    }

    // Generate aggregation expression using dialect
    const aggExpr = dialect.getAggregation(aggKey, fieldExpr);
    return `${aggExpr} AS ${quoteIdentifier(`${aggAlias}_${v.field}`)}`;
  }).join(', ');

  // Generate SQL based on configuration
  let sql = '';
  if (groupBy.length === 0) {
    // No dimensions at all - just aggregates
    sql = `SELECT ${aggs} FROM ${tableName} ${whereClause} ${havingClause}`;
  } else {
    // Build SELECT clause with inline expressions
    // e.g., YEAR(date) AS "grouping_123", "region" AS "region"
    const dimensionSelects = allDimensions.map(d =>
      `${d.expr} AS ${d.alias}`
    ).join(', ');

    // ORDER BY uses aliases (result column names)
    // e.g., "grouping_123" NULLS LAST, "region" NULLS LAST
    const orderBy = allDimensions.map(d => `${d.alias} NULLS LAST`).join(', ');

    // Use CUBE unless explicitly disabled (typically when HAVING filters would make subtotals confusing)
    const useCube = !disableSubtotals;

    if (useCube) {
      // Use CUBE to generate subtotals and grand totals
      // Build GROUPING columns using raw expressions
      // e.g., GROUPING(YEAR(date)) AS _grouping_grouping_123, GROUPING("region") AS "_grouping_region"
      const groupingCols = allDimensions.map(d =>
        `CAST(GROUPING(${d.forGroupBy}) AS INTEGER) AS ${quoteIdentifier(`_grouping_${d.id}`)}`
      ).join(', ');

      sql = `SELECT ${dimensionSelects}, ${groupingCols}, ${aggs} FROM ${tableName} ${whereClause} GROUP BY CUBE(${groupBy.join(', ')}) ${havingClause} ORDER BY ${orderBy}`;
    } else {
      // Regular GROUP BY without subtotals
      sql = `SELECT ${dimensionSelects}, ${aggs} FROM ${tableName} ${whereClause} GROUP BY ${groupBy.join(', ')} ${havingClause} ORDER BY ${orderBy}`;
    }
  }

  return sql.trim();
}
