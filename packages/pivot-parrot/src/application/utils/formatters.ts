/**
 * Value and label formatting utilities for PivotDisplay
 *
 * Cells hold raw values; the engine type name is resolved from the dtypes
 * map at format time (keyed by the metric/field name), not carried per-cell.
 * Dialect provides display transforms via toDisplay(v, typeName).
 */

import type { ValueFormat } from '../../domain/models/types';
import { toMetricKey } from '../../domain/pivot/utils';

export interface ResolvedFormat {
  type: 'number' | 'currency' | 'percentage';
  decimals: number;
  grouping: boolean;
  currency: string;
}

/** The defaults of a ValueFormat, in one place for every surface that shows a value. */
export function resolveFormat(format: ValueFormat = {}): ResolvedFormat {
  const type = format.type === 'currency' || format.type === 'percentage' ? format.type : 'number';
  const parsed = parseInt(String(format.decimals ?? 2), 10);
  return {
    type,
    decimals: Number.isNaN(parsed) ? 2 : parsed,
    grouping: format.useThousandSeparator ?? (type === 'currency'),
    currency: format.currency || 'USD'
  };
}

const numberFormats = new Map<string, Intl.NumberFormat>();

function numberFormatFor(format: ValueFormat, locale: string): Intl.NumberFormat {
  const { type, decimals, grouping, currency } = resolveFormat(format);
  const cacheKey = `${locale}|${type}|${decimals}|${grouping}|${currency}`;
  let nf = numberFormats.get(cacheKey);
  if (!nf) {
    nf = new Intl.NumberFormat(locale, {
      style: type === 'percentage' ? 'percent' : type === 'currency' ? 'currency' : 'decimal',
      ...(type === 'currency' && { currency }),
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: grouping
    });
    numberFormats.set(cacheKey, nf);
  }
  return nf;
}

/** Format a number for display. Percentages take a fraction (0.123 → 12.3%). */
export function formatNumber(value: number, format: ValueFormat, locale = 'en-US'): string {
  const nf = numberFormatFor(format, locale);
  // A negative that rounds to zero would print "-0,0 %". signDisplay: 'negative'
  // says the same, but is newer than the ES2020 target and throws where unsupported.
  if (value <= 0 && nf.format(-value) === nf.format(0)) return nf.format(0);
  return nf.format(value);
}

/** The format configured for a result column key (as produced by toMetricKey). */
export function findValueFormat(config, valueKey: string): ValueFormat | undefined {
  const valueField = (config?.values || []).find(v => toMetricKey(v) === valueKey);
  return valueField?.format ?? config?.customMetrics?.find(m => m.id === valueKey)?.format;
}

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
  let format = findValueFormat(config, valueKey);
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

  return formatNumber(num, format, locale);
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
