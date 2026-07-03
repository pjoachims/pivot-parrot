/**
 * Cache key/hash helpers for data change detection and pivot cube caching
 */

/**
 * Generate hash from data (detects changes across the full dataset)
 * Folds every row into a rolling hash instead of sampling first/last rows -
 * two different datasets with the same length, columns, first and last row
 * used to hash identically and silently skip a reload.
 * @param {Array<Object>} data - Data to hash
 * @returns {string} Hash string
 */
export function hashData(data) {
  if (!data || !data.length) return 'empty';

  const cols = Object.keys(data[0]).sort().join(',');

  let hash = 0;
  const fold = (str) => {
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
  };

  fold(`${data.length}_${cols}_`);
  for (const row of data) {
    fold(JSON.stringify(row));
  }

  return hash.toString(36);
}

/**
 * Build the canonical (order-independent) signature string for a pivot config.
 * Shared by hashPivotConfig (hash of this string) and callers that need to
 * verify a cache hit isn't a hash collision by comparing signatures directly.
 * @param {Object} config - Pivot configuration
 * @param {string} whereClause - WHERE clause
 * @returns {string} Canonical JSON signature
 */
export function getPivotConfigSignature(config, whereClause = '') {
  // Helper: extract field ID (handles FieldItem objects and 'Σ Values' string)
  const getFieldId = (f) => typeof f === 'string' ? f : f.id;

  // Combine ALL dimensions and sort together
  // This way moving Category from rows to columns gives same hash!
  const allDimensionIds = [
    ...(config.rows || []).filter(r => getFieldId(r) !== 'Σ Values').map(getFieldId),
    ...(config.columns || []).filter(c => getFieldId(c) !== 'Σ Values').map(getFieldId)
  ].sort();

  // For each dimension, include custom grouping expression if it's a custom grouping
  const dimensionsWithExpressions = allDimensionIds.map(id => {
    const customGrouping = (config.customGroupings || []).find(g => g.id === id);
    if (customGrouping) {
      return { id, expr: customGrouping.expr };
    }
    return { id };
  });

  // Track where Values appears (rows vs columns matters for display)
  const valuesInRows = (config.rows || []).some(r => getFieldId(r) === 'Σ Values');

  // Values order matters (different aggregations)
  const values = (config.values || []).map(v => ({
    field: v.field, // field is already a string in values
    aggregation: v.aggregation,
    isCustom: v.isCustom,
    expr: v.isCustom ? v.expr : undefined
  }));

  // Include actual filter values in the hash
  const filterValues = (config.filters || []).map(f => ({
    field: f.field,
    type: f.type,
    value: f.value,
    selectedValues: f.selectedValues,
    isNot: f.isNot,
    betweenStart: f.betweenStart,
    betweenEnd: f.betweenEnd,
    // Include custom filter properties
    isCustom: f.isCustom,
    formula: f.formula
  }));

  const normalized = {
    dimensions: dimensionsWithExpressions,  // Dimensions with their expressions!
    valuesInRows,  // Track Values position
    values,
    filters: filterValues,  // Include actual filter values
    suffix: whereClause  // Keep the suffix for _no_cube etc.
  };

  return JSON.stringify(normalized);
}

/**
 * Generate order-independent hash for pivot config
 * Key insight: CUBE(date, region) = CUBE(region, date)
 * Moving dimensions between rows/columns shouldn't change the hash!
 *
 * This is a 32-bit hash used only as a cache-key shortcut - it can collide.
 * Callers that serve cached results on a hit should also compare
 * getPivotConfigSignature() to guard against collisions (see verify-on-hit
 * usage in usePivotCalculation).
 * @param {Object} config - Pivot configuration
 * @param {string} whereClause - WHERE clause
 * @returns {string} Order-independent hash
 */
export function hashPivotConfig(config, whereClause = '') {
  const signature = getPivotConfigSignature(config, whereClause);

  // Simple string hash
  let hash = 0;
  for (let i = 0; i < signature.length; i++) {
    const char = signature.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}
