/**
 * Pivot-specific utility functions
 */

/**
 * Generate metric key from value field configuration
 * NOTE: Must match column alias in SQL (see buildCubeSQL)
 */
export function toMetricKey(v) {
  if (v.isCustom) return v.field;  // Use stable ID, not display name
  // Lowercase to match DuckDB's identifier normalization (unquoted identifiers → lowercase)
  const aggName = v.aggregation.toLowerCase().replace(/\s+/g, '_');
  return `${aggName}_${v.field}`;
}

/**
 * Generate metric label for display (user-friendly name)
 * This is what the user sees in column headers
 */
export function toMetricLabel(v) {
  if (v.isCustom) {
    // Use friendly display name if available, fallback to field ID
    if (!v.name) {
      return v.field; // Fallback to ID
    }
    return v.name;
  }
  // For regular fields, use the same format as the key
  const aggName = v.aggregation.replace(/\s+/g, '_');
  return `${aggName}_${v.field}`;
}
