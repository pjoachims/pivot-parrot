/**
 * CUBE index utilities for fast, order-independent lookups
 *
 * The hash is based on:
 * 1. Which fields are grouped (aggregated)
 * 2. Values of ungrouped fields
 *
 * This makes lookups order-independent - Category in rows vs columns
 * produces the same hash since it's the same CUBE row.
 */

/**
 * Check if a CUBE grouping column value indicates the dimension is NOT grouped (leaf level)
 * Handles both Number (0) and BigInt (0n) from Arrow/remote mode
 */
export function isUngrouped(value) {
  return value === 0 || value === 0n;
}

/**
 * Check if a CUBE grouping column value indicates the dimension IS grouped (aggregated)
 * Handles both Number (1) and BigInt (1n) from Arrow/remote mode
 */
export function isGrouped(value) {
  return value === 1 || value === 1n;
}

/**
 * Safe JSON.stringify that handles BigInt values
 */
export function safeStringify(value) {
  return JSON.stringify(value, (key, val) =>
    typeof val === 'bigint' ? String(val) : val
  );
}

/**
 * Normalize a value for hashing - strip quotes from DECIMAL values
 */
function normalizeValue(val) {
  if (val === null || val === undefined) return val;

  const str = String(val);
  // Remove quotes from large DECIMAL values (e.g., "17604449022020080021205" -> 17604449022020080021205)
  if (str.startsWith('"') && str.endsWith('"')) {
    return str.slice(1, -1);
  }
  return val;
}

/**
 * Create a hash key from a CUBE result row
 *
 * @param {Object} row - SQL CUBE result row
 * @param {Array<string>} allFields - All dimension fields (rows + columns)
 * @returns {string} Hash key for O(1) lookup
 */
export function createCubeHash(row, allFields) {
  const ungrouped = [];
  const grouped = [];

  allFields.forEach(field => {
    const groupingValue = row[`_grouping_${field}`];
    // Handle both Number and BigInt for grouping columns (BigInt in remote mode with Arrow)
    if (isUngrouped(groupingValue)) {
      // Ungrouped: include field name and normalized value (strip quotes)
      const normalizedVal = normalizeValue(row[field]);
      ungrouped.push(`${field}:${normalizedVal}`);
    } else {
      // Grouped: just mark as aggregated
      grouped.push(`${field}:*`);
    }
  });

  // Sort for order-independence (Category in rows vs columns = same hash)
  return [...ungrouped.sort(), ...grouped.sort()].join('|');
}

/**
 * Build hash index from SQL CUBE results for O(1) lookups
 *
 * @param {Array<Object>} sqlRows - SQL CUBE results
 * @param {Array<string>} allFields - All dimension fields
 * @returns {Map} Hash → row mapping
 */
export function buildCubeIndex(sqlRows, allFields) {
  const index = new Map();

  sqlRows.forEach(row => {
    const hash = createCubeHash(row, allFields);
    // Store all rows with this hash (shouldn't have duplicates, but just in case)
    if (!index.has(hash)) {
      index.set(hash, []);
    }
    index.get(hash).push(row);
  });

  return index;
}

/**
 * Create hash for a specific cell lookup (node + column)
 *
 * @param {Array} nodePath - Row node path values
 * @param {Array<string>} rowFields - Row dimension field names
 * @param {Array} colPath - Column path values
 * @param {Array<string>} colFields - Column dimension field names
 * @returns {string} Hash key to lookup in index
 */
export function createCellHash(nodePath, rowFields, colPath, colFields) {
  const ungrouped = [];
  const grouped = [];

  // Process row dimensions
  rowFields.forEach((field, i) => {
    if (i < nodePath.length && nodePath[i] !== undefined) {
      const normalizedVal = normalizeValue(nodePath[i]);
      ungrouped.push(`${field}:${normalizedVal}`);
    } else {
      grouped.push(`${field}:*`);
    }
  });

  // Process column dimensions
  colFields.forEach((field, i) => {
    if (i < colPath.length && colPath[i] !== undefined) {
      const normalizedVal = normalizeValue(colPath[i]);
      ungrouped.push(`${field}:${normalizedVal}`);
    } else {
      grouped.push(`${field}:*`);
    }
  });

  // Sort for order-independence
  return [...ungrouped.sort(), ...grouped.sort()].join('|');
}

/**
 * Lookup a value from the CUBE index
 *
 * @param {Map} cubeIndex - Hash index built from SQL rows
 * @param {string} hash - Hash key
 * @param {string} metric - Metric column name
 * @returns {*} Value or null
 */
export function lookupCubeValue(cubeIndex, hash, metric) {
  const rows = cubeIndex.get(hash);
  if (!rows || rows.length === 0) return null;

  // Should only be one row per hash, but take first if multiple
  return rows[0][metric] ?? null;
}
