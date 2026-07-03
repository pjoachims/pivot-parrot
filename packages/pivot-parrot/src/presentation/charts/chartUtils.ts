/**
 * Chart utilities - shared functions for chart data processing
 */

import { isUngrouped, isGrouped, buildCubeIndex } from '../../application/utils/cubeIndex';

// ==================== Type Definitions ====================

/**
 * Plotly format configuration for axis display
 */
interface PlotlyFormat {
  tick: string;
  hover: string;
}

/**
 * Arrow type object from SQL dialect
 */
interface ArrowType {
  name: string;
  category?: 'temporal' | 'integer' | 'float' | 'string' | 'boolean';
  [key: string]: unknown;
}

/**
 * SQL Dialect with type registry
 */
interface SQLDialect {
  types?: Record<string, ArrowType>;
  [key: string]: unknown;
}

/**
 * Column name to type name mapping
 */
type DTypes = Record<string, string>;

/**
 * Cube result row with grouping columns and data
 */
type CubeRow = Record<string, unknown>;

/**
 * Chart configuration object
 */
interface ChartConfig {
  chartType: 'bar' | 'bar-line' | 'scatter' | 'treemap';
  xAxis?: string | { id: string };
  groupBy?: string | { id: string };
  levels?: Array<string | { id: string }>;
  level1?: string | { id: string };
  level2?: string | { id: string };
  level3?: string | { id: string };
  pointLevel?: string | { id: string };
  colorBy?: string | { id: string };
  [key: string]: unknown;
}

/**
 * Value configuration in pivot config
 */
interface ValueConfig {
  field: string;
  aggregation: string;
  format?: MetricFormat | string;
  isCustom?: boolean;
  name?: string;
}

/**
 * Metric format configuration
 */
interface MetricFormat {
  type?: 'numeric' | 'currency' | 'percentage' | 'auto';
  decimals?: number;
  currency?: string;
  useThousandSeparator?: boolean;
  prefix?: string;
  suffix?: string;
}

/**
 * Custom metric definition
 */
interface CustomMetric {
  id: string;
  name: string;
  expr: string;
  format?: MetricFormat;
}

/**
 * Pivot configuration object
 */
interface PivotConfig {
  rows: string[];
  columns: string[];
  values: ValueConfig[];
  customMetrics?: CustomMetric[];
  [key: string]: unknown;
}

/**
 * Aggregation pattern for cube lookup
 */
interface AggregationPattern {
  dim: string;
  grouped: boolean;
  value?: unknown;
}

/**
 * Field or FieldItem union type
 */
type FieldOrFieldItem = string | { id: string; _id?: string; getSQLColumnName?: () => string };

/**
 * Chart data prepared for rendering
 */
interface ChartData {
  rows: CubeRow[];
  rawRows: CubeRow[];
  cubeIndex: Map<string, CubeRow>;
  dimensions: string[];
  allDimensions: string[];
  dtypes: DTypes;
  dialect: SQLDialect;
  config: PivotConfig;
}

// ==================== Constants ====================

/**
 * Plotly format strings for different data types
 * Maps engine type names to Plotly axis format strings
 */
const TYPE_PLOTLY_FORMATS: Record<string, PlotlyFormat> = {
  'TIMESTAMP': { tick: '%Y-%m-%d %H:%M:%S', hover: '%Y-%m-%d %H:%M:%S' },
  'TIMESTAMP_NTZ': { tick: '%Y-%m-%d %H:%M:%S', hover: '%Y-%m-%d %H:%M:%S' },
  'DATETIME': { tick: '%Y-%m-%d %H:%M:%S', hover: '%Y-%m-%d %H:%M:%S' },
  'DATE': { tick: '%Y-%m-%d', hover: '%Y-%m-%d' },
  // Other types don't need special formatting
};

/**
 * Color palette for traces
 */
const COLORS = [
  '#3b82f6', // blue
  '#f97316', // orange
  '#10b981', // green
  '#ef4444', // red
  '#8b5cf6', // purple
  '#f59e0b', // amber
  '#06b6d4', // cyan
  '#ec4899', // pink
];

// ==================== Format & Type Detection ====================

/**
 * Get Plotly format strings for a given dtype
 */
export function getPlotlyFormat(dtype: string | ArrowType | null | undefined): Partial<PlotlyFormat> {
  // Handle Arrow type objects
  if (dtype && typeof dtype === 'object' && 'name' in dtype) {
    const typeName = dtype.name.toUpperCase();
    // Map Arrow type names to Plotly format keys
    if (typeName.includes('TIMESTAMP')) return TYPE_PLOTLY_FORMATS['TIMESTAMP'];
    if (typeName.includes('DATE')) return TYPE_PLOTLY_FORMATS['DATE'];
    return {};
  }
  // Handle type name strings (legacy)
  if (typeof dtype === 'string') {
    return TYPE_PLOTLY_FORMATS[dtype] || {};
  }
  return {};
}

/**
 * Normalize field to string ID
 */
export function normalizeField(field: FieldOrFieldItem | null | undefined): string {
  if (!field) return '';
  if (typeof field === 'string') return field;
  return field.id || (field as { _id?: string })._id || '';
}

/**
 * Detect axis type from data
 */
export function detectAxisType(data: CubeRow[], field: string): 'category' | 'date' | 'linear' {
  if (!data || data.length === 0) return 'category';

  const firstValue = data[0]?.[field];
  if (!firstValue) return 'category';

  if (firstValue instanceof Date) return 'date';
  if (typeof firstValue === 'string' && !isNaN(Date.parse(firstValue))) return 'date';
  if (typeof firstValue === 'number') return 'linear';

  return 'category';
}

/**
 * Get color from palette by index
 */
export function getColor(index: number): string {
  return COLORS[index % COLORS.length];
}

// ==================== Value Conversion ====================

/**
 * Convert a value to chart-ready format for Plotly
 * Converts timestamps to Date objects, numeric values to Numbers
 * Uses dialect.toChartValue for proper decimal handling
 */
export function toChartValue(
  value: unknown,
  columnName: string,
  dialect: SQLDialect | null | undefined,
  dtypes: DTypes | null | undefined
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (!dialect || !dtypes) {
    return value;
  }

  const typeName = dtypes[columnName];
  if (!typeName) {
    return value;
  }

  // Extract base type for category lookup
  const baseTypeName = typeName.includes('<') ? typeName.slice(0, typeName.indexOf('<')) : typeName;
  const arrowType = dialect.types?.[baseTypeName];

  // Convert based on Arrow type category
  const category = arrowType?.category;

  if (category === 'temporal') {
    // Convert millisecond timestamps to Date objects for Plotly
    if (typeof value === 'number') {
      return new Date(value);
    }
    if (typeof value === 'string') {
      return new Date(value);
    }
    return value;
  }

  if (category === 'integer' || category === 'float') {
    // Use dialect.toChartValue for proper decimal/BigInt handling
    return (dialect as any).toChartValue?.(value, typeName) ?? value;
  }

  // Strings, booleans, etc. - pass through
  return value;
}

/**
 * Prepare chart data - convert raw cube values to chart-ready values using dtypes
 */
export function prepareChartData(
  rows: CubeRow[],
  dialect: SQLDialect | null | undefined,
  dtypes: DTypes | null | undefined
): CubeRow[] {
  if (!dialect || !dtypes) {
    return rows;
  }

  return rows.map(row => {
    const processedRow: CubeRow = {};

    for (const [key, value] of Object.entries(row)) {
      // Skip _grouping columns
      if (key.startsWith('_grouping_')) {
        processedRow[key] = value;
        continue;
      }

      // Convert value using dialect's toChartValue
      processedRow[key] = toChartValue(value, key, dialect, dtypes);
    }

    return processedRow;
  });
}

/**
 * Format value for display in legend/labels
 * Converts Date objects to readable strings, handles timestamps vs dates
 */
export function formatValueForDisplay(value: unknown, typeName: string | ArrowType | null = null): string {
  if (value instanceof Date) {
    // Extract string name if typeName is an Arrow type object, otherwise use as-is
    const typeStr = typeof typeName === 'object' && typeName !== null ? typeName.name : typeName;
    // Check if it's a timestamp type (case-insensitive)
    const typeUpper = typeStr ? String(typeStr).toUpperCase() : '';
    if (typeUpper.includes('TIMESTAMP') || typeUpper.includes('DATETIME')) {
      // TIMESTAMP: show date + time (YYYY-MM-DD HH:MM:SS)
      return value.toISOString().replace('T', ' ').slice(0, 19);
    } else {
      // DATE or unknown: show only date (YYYY-MM-DD)
      return value.toISOString().split('T')[0];
    }
  }
  return String(value);
}

// ==================== Cube Data Operations ====================

/**
 * Look up a value from CUBE results for a specific aggregation pattern
 *
 * Finds the row in CUBE results that matches the given pattern of grouped/ungrouped
 * dimensions and their values. This is used to get parent node values from CUBE
 * instead of calculating them.
 */
export function lookupCubeValue(
  cubeResults: CubeRow[],
  pattern: AggregationPattern[],
  metricColumn: string,
  dtypes: DTypes | null = null
): number {
  const row = cubeResults.find(row => {
    return pattern.every(p => {
      const groupingCol = `_grouping_${p.dim}`;
      const groupingValue = row[groupingCol];

      // Check if grouped status matches
      if (p.grouped) {
        if (!isGrouped(groupingValue)) return false;
      } else {
        if (!isUngrouped(groupingValue)) return false;
        // For ungrouped dimensions, check the value matches
        const rowValue = row[p.dim];
        const patternValue = p.value;

        // Handle Date objects - compare formatted strings
        if (rowValue instanceof Date) {
          const typeName = dtypes ? dtypes[p.dim] : null;
          const formattedRowValue = formatValueForDisplay(rowValue, typeName);
          if (formattedRowValue !== patternValue) return false;
        } else {
          if (rowValue !== patternValue) return false;
        }
      }

      return true;
    });
  });

  if (!row) return 0;
  const val = row[metricColumn];
  if (typeof val === 'bigint') {
    return val <= Number.MAX_SAFE_INTEGER && val >= Number.MIN_SAFE_INTEGER
      ? Number(val)
      : 0; // Can't safely convert, return 0 for charts
  }
  return Number(val) || 0;
}

/**
 * Select and aggregate chart data from CUBE results
 *
 * Filters CUBE results to the chart's aggregation level and validates dimensions exist.
 * Returns rows where chartDimensions are ungrouped (detail level) and other dimensions
 * are grouped (aggregated away).
 */
export function selectChartData(
  cubeResults: CubeRow[],
  chartDimensions: string[],
  allDimensions: string[],
  config: PivotConfig
): CubeRow[] {
  if (!cubeResults || cubeResults.length === 0) {
    throw new Error('No data available');
  }

  // Validate chart dimensions exist in CUBE results
  const sampleRow = cubeResults[0];
  const missingDimensions = chartDimensions.filter(dim => !(dim in sampleRow));

  if (missingDimensions.length > 0) {
    throw new Error(`Dimension not found: ${missingDimensions.join(', ')}`);
  }

  // Filter CUBE results to chart aggregation level
  const filtered = cubeResults.filter(row => {
    return allDimensions.every(dim => {
      const groupingCol = `_grouping_${dim}`;

      if (chartDimensions.includes(dim)) {
        // Chart needs this dimension at detail level
        return isUngrouped(row[groupingCol]);
      } else {
        // Chart wants this dimension aggregated away
        return isGrouped(row[groupingCol]);
      }
    });
  });

  if (filtered.length === 0) {
    throw new Error('No data at selected aggregation level');
  }

  return filtered;
}

/**
 * Group data by field
 */
export function groupData(
  data: CubeRow[],
  groupField: string,
  typeName: string | null = null
): Record<string, CubeRow[]> {
  const groups: Record<string, CubeRow[]> = {};
  data.forEach(row => {
    // Cast to string to preserve falsy values like false, 0, etc.
    // Only null and undefined become 'Unknown'
    let groupValue = row[groupField] != null ? String(row[groupField]) : 'Unknown';

    // Format Date objects for use as object keys
    if (row[groupField] instanceof Date) {
      groupValue = formatValueForDisplay(row[groupField], typeName);
    }

    if (!groups[groupValue]) {
      groups[groupValue] = [];
    }
    groups[groupValue].push(row);
  });
  return groups;
}

// ==================== Chart Configuration ====================

/**
 * Extract dimensions from chart configuration
 */
export function getChartDimensions(chartConfig: ChartConfig): string[] {
  const type = chartConfig.chartType;

  if (type === 'treemap') {
    // Handle both array format (levels) and individual fields (level1, level2, level3)
    if (chartConfig.levels) {
      return chartConfig.levels.map(normalizeField);
    }
    // Build levels array from level1, level2, level3
    const levels: string[] = [];
    if (chartConfig.level1) levels.push(normalizeField(chartConfig.level1));
    if (chartConfig.level2) levels.push(normalizeField(chartConfig.level2));
    if (chartConfig.level3) levels.push(normalizeField(chartConfig.level3));
    return levels;
  }

  if (type === 'bar' || type === 'bar-line') {
    const dims = [normalizeField(chartConfig.xAxis)];
    if (chartConfig.groupBy) dims.push(normalizeField(chartConfig.groupBy));
    return dims;
  }

  if (type === 'scatter') {
    const dims: string[] = [];
    if (chartConfig.pointLevel) dims.push(normalizeField(chartConfig.pointLevel));
    if (chartConfig.colorBy) dims.push(normalizeField(chartConfig.colorBy));
    return dims;
  }

  return [];
}

/**
 * Prepare chart data from CUBE results
 * Centralizes filtering, value conversion, and cubeIndex access
 */
export function buildChartData(
  sqlRows: CubeRow[],
  chartConfig: ChartConfig,
  config: PivotConfig,
  dtypes: DTypes,
  dialect: SQLDialect
): ChartData {
  // Extract chart dimensions
  const chartDimensions = getChartDimensions(chartConfig);

  // Get all pivot dimensions
  const allDimensions = [...(config.rows || []), ...(config.columns || [])]
    .map(normalizeField)
    .filter(dim => dim !== 'Σ Values');

  // Build cubeIndex if not present (needed for treemap)
  let cubeIndex = (sqlRows as CubeRow[] & { _cubeIndex?: Map<string, CubeRow> })._cubeIndex;
  if (!cubeIndex && sqlRows.length > 0) {
    cubeIndex = buildCubeIndex(sqlRows, allDimensions);
  }

  // Filter to detail rows (for discovering all paths)
  const detailRows = selectChartData(sqlRows, chartDimensions, allDimensions, config);

  // Convert ALL values for plotting (Date objects, BigInt → Number, unwrap typed arrays)
  const convertedRows = detailRows.map(row => {
    const converted: CubeRow = {};
    for (const [key, value] of Object.entries(row)) {
      // Skip _grouping columns
      if (key.startsWith('_grouping_')) {
        converted[key] = value;
        continue;
      }
      // Convert all values (dimensions AND metrics)
      converted[key] = toChartValue(value, key, dialect, dtypes);
    }
    return converted;
  });

  // Return standard data + cubeIndex for treemap lookups
  return {
    rows: convertedRows,           // Pre-converted detail rows (for display)
    rawRows: detailRows,           // Raw detail rows (for cube hash lookups)
    cubeIndex: cubeIndex || new Map(),  // For treemap parent lookups
    dimensions: chartDimensions,
    allDimensions: allDimensions,
    dtypes: dtypes,
    dialect: dialect,
    config: config                 // Pivot config (for getCubeColumnName, etc.)
  };
}

// ==================== Field & Metric Utilities ====================

/**
 * Sanitize field to SQL column name
 * Single source of truth for converting field references to SQL column names
 */
export function sanitizeFieldName(fieldOrFieldItem: FieldOrFieldItem, config: PivotConfig | null = null): string {
  // If it's a FieldItem-like object with id property
  if (typeof fieldOrFieldItem === 'object' && fieldOrFieldItem && fieldOrFieldItem.id) {
    return fieldOrFieldItem.id;
  }

  // Otherwise it's a field ID string - look it up in config
  if (!config) {
    throw new Error('Config required when field is a string');
  }

  const field = fieldOrFieldItem as string;
  const valueConfig = config.values.find(v => v.field === field);

  if (!valueConfig) {
    throw new Error(`Metric not found: ${field}`);
  }

  return valueConfig.isCustom
    ? field
    : `${valueConfig.aggregation.toLowerCase()}_${field}`;
}

/**
 * Build metric label for display
 */
export function getMetricLabel(field: string, config: PivotConfig): string {
  const valueConfig = config.values.find(v => v.field === field);

  if (!valueConfig) {
    throw new Error(`Metric not found: ${field}`);
  }

  if (valueConfig.isCustom) {
    // Look up display name from customMetrics
    const customMetric = config.customMetrics?.find(m => m.id === field);
    return customMetric?.name || valueConfig.name || field;
  }

  return `${valueConfig.aggregation} of ${field}`;
}

/**
 * Get format string for a metric (respects custom formats)
 * Converts format object {type, decimals, currency, useThousandSeparator} to d3-format string
 */
export function getMetricFormat(field: string, config: PivotConfig): string {
  const valueField = config.values.find(v => v.field === field);
  let format = valueField?.format;

  // Check custom metrics for format
  if (!format && config.customMetrics) {
    format = config.customMetrics.find(m => m.id === field)?.format;
  }

  // If format is an object, convert to d3-format string
  if (format && typeof format === 'object') {
    const { type, decimals = 2, currency = 'USD', useThousandSeparator = true } = format;
    const dec = parseInt(String(decimals)) || 0;
    const sep = useThousandSeparator ? ',' : '';

    switch (type) {
      case 'numeric':
        return `${sep}.${dec}f`;
      case 'currency':
        return `$${sep}.${dec}f`;
      case 'percentage':
        return `${sep}.${dec}%`;
      case 'auto':
      default:
        return `${sep}.${dec}f`;
    }
  }

  // If format is already a string, use it as-is
  if (typeof format === 'string') {
    return format;
  }

  // Default: 2 decimal places with thousand separators
  return ',.2f';
}
