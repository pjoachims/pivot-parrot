/**
 * Value and label formatting utilities for PivotDisplay
 *
 * Cells hold raw values; the engine type name is resolved from the dtypes
 * map at format time (keyed by the metric/field name), not carried per-cell.
 * Dialect provides display transforms via toDisplay(v, typeName).
 */

/**
 * Format a value based on its format type
 * @param {*} n - The raw cell value
 * @param {string} valueKey - The value field key (for looking up format config and type)
 * @param {Object} config - Pivot config containing format info
 * @param {string} locale - Locale for number formatting (default: 'en-US')
 * @param {Object} dtypes - Column name → engine type name mapping
 * @param {Object} dialect - SQL dialect with type registry
 * @returns {string} Formatted value string
 */
export const createFormatValue = (config, locale = 'en-US', dtypes = {}, dialect = null) => (n, valueKey) => {
  const typeName = dtypes[valueKey] ?? null;

  if (n === null || n === undefined || n === '') return '';

  // Use dialect transform if available
  if (typeName !== null && dialect && dialect.toDisplay) {
    const transformed = dialect.toDisplay(n, typeName);
    n = transformed;
  }

  // Find format config
  const valueField = (config.values || []).find(v =>
    v.isCustom ? v.field === valueKey : `${v.aggregation}_${v.field}` === valueKey
  );
  let format = valueField?.format;
  if (!format && config.customMetrics) {
    format = config.customMetrics.find(m => m.id === valueKey)?.format;
  }
  if (!format) {
    // Set default format based on Arrow type category
    // For parameterized types like "decimal<35,19>", extract base type for lookup
    const baseTypeName = typeName && typeName.includes('<')
      ? typeName.slice(0, typeName.indexOf('<'))
      : typeName;
    const typeInfo = baseTypeName && dialect?.types?.[baseTypeName];
    const category = typeInfo?.category;

    if (category === 'float') {
      format = { type: 'number', decimals: 2, useThousandSeparator: false };
    } else if (category === 'integer') {
      format = { type: 'number', decimals: 0, useThousandSeparator: false };
    } else {
      return String(n);
    }
  }

  const decimals = format.decimals ?? 2;
  const useThousandSeparator = format.useThousandSeparator ?? (format.type === 'currency');

  // Handle BigInt that wasn't converted by toDisplay (fallback safety)
  if (typeof n === 'bigint') {
    // Convert to string - loses precision but prevents crash
    n = n.toString();
  }

  // After dialect transform, values should be numbers or strings
  // Try to parse as number for formatting
  // Wrap in try-catch to handle DuckDB's BigInt proxy that throws on Number()
  let num;
  try {
    num = Number(n);
  } catch (e) {
    // DuckDB BigInt proxy throws "not safe to convert" - return as string
    return String(n);
  }
  if (isNaN(num)) {
    return String(n);
  }

  // For very large/small numbers that would display in scientific notation,
  // return the original string representation if available
  const wouldBeScientific = Math.abs(num) >= 1e21 || (Math.abs(num) < 1e-6 && num !== 0);
  if (wouldBeScientific && typeof n === 'string' && !/e/i.test(n)) {
    return n;
  }

  switch (format.type) {
    case 'percentage':
      const pctValue = num * 100;
      return (useThousandSeparator
        ? pctValue.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : pctValue.toFixed(decimals)) + '%';
    case 'currency':
      return num.toLocaleString(locale, {
        style: 'currency',
        currency: format.currency || 'USD',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        useGrouping: useThousandSeparator
      });
    default:
      return useThousandSeparator
        ? num.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : num.toFixed(decimals);
  }
};

/**
 * Format a row label
 * @param {*} value - The raw label value
 * @param {string} fieldName - The field name (for looking up type)
 * @param {Object} rowFormats - Row format configurations (unused, kept for API compatibility)
 * @param {Object} detectedTypes - Detected field types (unused, kept for API compatibility)
 * @param {Object} dtypes - Column name → engine type name mapping
 * @param {Object} dialect - SQL dialect with type registry
 * @returns {string} Formatted label
 */
export const createFormatRowLabel = (rowFormats, detectedTypes, dtypes = {}, dialect = null) => (value, fieldName) => {
  let label = value;
  const typeName = dtypes[fieldName] ?? null;

  // Handle null/undefined/empty
  if (label === null || label === undefined || label === '' || label === '(null)') {
    return '(Blank)';
  }

  // Handle boolean values
  if (typeof label === 'boolean') {
    return String(label);
  }

  // Use dialect transform if available
  if (typeName !== null && dialect && dialect.toDisplay) {
    const transformed = dialect.toDisplay(label, typeName);
    label = transformed;
  }

  // Convert to string
  return String(label);
};

/**
 * Simple number formatter (fallback)
 * No thousand separators by default - matches formatValue default behavior
 * NOTE: This is a legacy formatter. Prefer using createFormatValue with dtypes and dialect.
 */
export const fmt = (n) => {
  if (n === null || n === undefined || n === '') return '';

  // If it's already a number, convert to string
  if (typeof n === 'number') {
    return String(n);
  }

  // Otherwise return as-is (let the caller handle it)
  return String(n);
};
