import { resolveMetricReferences } from '../../field/metric-resolver';
import { buildReferenceLookup, resolveDerivedFieldsInExpressionV2 } from '../../field/derived-field-resolver-v2';
import { resolveFieldExpr } from '../../field/resolveFieldExpr';
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
  const whereCondition = resolvedWhereFilters.length > 0
    ? dialect.buildWhereClause(resolvedWhereFilters)
    : '';
  const whereClause = whereCondition ? `WHERE ${whereCondition}` : '';

  const havingClause = resolvedHavingFilters.length > 0
    ? 'HAVING ' + dialect.buildWhereClause(resolvedHavingFilters)
    : '';

  // Helper: extract field ID (handles FieldItem objects and 'Σ Values' string)
  const getFieldId = (f) => typeof f === 'string' ? f : f.id;

  // Use dialect for identifier quoting
  const quoteIdentifier = (id) => dialect.quoteIdentifier(id);

  const buildDimensionExpr = (fieldId) => {
    const expr = resolveFieldExpr(fieldId, availableFields, config, dialect);
    return { id: fieldId, expr, alias: quoteIdentifier(fieldId), forGroupBy: expr };
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
    const fieldExpr = resolveFieldExpr(v.field, availableFields, config, dialect);

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

    // Use CUBE unless explicitly disabled
    const useCube = !disableSubtotals;

    if (useCube) {
      // Use CUBE to generate subtotals and grand totals
      // Build GROUPING columns using raw expressions
      // e.g., GROUPING(YEAR(date)) AS _grouping_grouping_123, GROUPING("region") AS "_grouping_region"
      const groupingCols = allDimensions.map(d =>
        `CAST(GROUPING(${d.forGroupBy}) AS INTEGER) AS ${quoteIdentifier(`_grouping_${d.id}`)}`
      ).join(', ');

      // HAVING picks leaf groups (an Excel value filter): subtotals and totals
      // must aggregate only the surviving leaves, so the CUBE runs over the
      // base rows of those leaves. The leaf query keeps the aggregate aliases
      // so a HAVING on an alias still resolves; only its keys leave it, so the
      // correlated dimension expressions below can bind to the outer row.
      let cubeWhereClause = whereClause;
      if (havingClause) {
        const keys = allDimensions.map((d, i) => `_pp_k${i}`);
        const leafGroups = `SELECT ${allDimensions.map((d, i) => `${d.forGroupBy} AS ${keys[i]}`).join(', ')}, ${aggs} FROM ${tableName} ${whereClause} GROUP BY ${groupBy.join(', ')} ${havingClause}`;
        const sameLeaf = allDimensions.map((d, i) => `_pp_leaves.${keys[i]} IS NOT DISTINCT FROM ${d.forGroupBy}`).join(' AND ');
        const survives = `EXISTS (SELECT 1 FROM (SELECT ${keys.join(', ')} FROM (${leafGroups}) _pp_groups) _pp_leaves WHERE ${sameLeaf})`;
        cubeWhereClause = whereCondition ? `WHERE (${whereCondition}) AND ${survives}` : `WHERE ${survives}`;
      }

      sql = `SELECT ${dimensionSelects}, ${groupingCols}, ${aggs} FROM ${tableName} ${cubeWhereClause} GROUP BY CUBE(${groupBy.join(', ')}) ORDER BY ${orderBy}`;
    } else {
      // Regular GROUP BY without subtotals
      sql = `SELECT ${dimensionSelects}, ${aggs} FROM ${tableName} ${whereClause} GROUP BY ${groupBy.join(', ')} ${havingClause} ORDER BY ${orderBy}`;
    }
  }

  return sql.trim();
}
