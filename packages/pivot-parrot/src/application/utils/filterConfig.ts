/**
 * Filter Configuration
 * Defines which filter types are available for each data type
 */

/**
 * Filter types available for each data type category
 */
export const FILTER_TYPES_BY_DTYPE = {
  string: [
    'equal',
    'contains',
    'starts_with',
    'ends_with',
    'regex',
    'null',
    'one_of'
  ],
  numeric: [
    'equal',
    'greater',
    'less',
    'greater_equal',
    'less_equal',
    'between',
    'null',
    'one_of'
  ],
  date: [
    'equal',
    'greater',
    'less',
    'greater_equal',
    'less_equal',
    'between',
    'null'
  ],
  timestamp: [
    'equal',
    'greater',
    'less',
    'greater_equal',
    'less_equal',
    'between',
    'null'
  ],
  custom_grouping: [
    'equal',
    'one_of',
    'custom_expr'
  ]
};

/**
 * Human-readable labels for filter types
 */
export const FILTER_LABELS = {
  equal: 'Equal to',
  one_of: 'One of',
  contains: 'Contains',
  starts_with: 'Starts with',
  ends_with: 'Ends with',
  regex: 'Matches regex',
  null: 'Null',
  greater: 'Greater than',
  less: 'Less than',
  greater_equal: 'Greater than or equal',
  less_equal: 'Less than or equal',
  between: 'Between',
  custom_expr: 'Custom expression'
};

/**
 * Default filter type for each data type category
 */
export const DEFAULT_FILTER_TYPE = {
  string: 'equal',
  numeric: 'equal',
  date: 'between',
  timestamp: 'between',
  custom_grouping: 'equal'
};

/**
 * Determine filter category from field type
 * @param {object} fieldType - Arrow type object
 * @param {string} fieldKind - Optional field kind (e.g., 'custom_grouping')
 * @returns {string} Category: 'string', 'numeric', 'date', 'timestamp', or 'custom_grouping'
 */
export function getFilterCategory(fieldType, fieldKind = null) {
  // Custom groupings get their own filter set
  if (fieldKind === 'custom_grouping') {
    return 'custom_grouping';
  }

  if (!fieldType || typeof fieldType !== 'object' || !('category' in fieldType)) {
    return 'string';
  }

  const category = fieldType.category;
  if (category === 'integer' || category === 'float') return 'numeric';
  if (category === 'temporal') {
    // Check if it's a date or timestamp
    const name = fieldType.name || '';
    return name.includes('date') ? 'date' : 'timestamp';
  }
  return category === 'string' ? 'string' : 'string'; // default to string
}

/**
 * Get available filter types for a field type
 * @param {object} fieldType - Arrow type object
 * @param {string} fieldKind - Optional field kind (e.g., 'custom_grouping')
 * @returns {Array<{value: string, label: string}>} Available filter types
 */
export function getAvailableFilters(fieldType, fieldKind = null) {
  const category = getFilterCategory(fieldType, fieldKind);
  const filterTypes = FILTER_TYPES_BY_DTYPE[category] || FILTER_TYPES_BY_DTYPE.string;

  return filterTypes.map(type => ({
    value: type,
    label: FILTER_LABELS[type]
  }));
}

/**
 * Get default filter type for a field type
 * @param {object} fieldType - Arrow type object
 * @param {string} fieldKind - Optional field kind (e.g., 'custom_grouping')
 * @returns {string} Default filter type
 */
export function getDefaultFilterType(fieldType, fieldKind = null) {
  const category = getFilterCategory(fieldType, fieldKind);
  return DEFAULT_FILTER_TYPE[category] || 'one_of';
}
