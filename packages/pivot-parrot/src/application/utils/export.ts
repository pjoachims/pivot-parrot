/**
 * Export utilities for PivotDisplay
 */

import { profiler } from '../../domain/query/utils/profiler';
import { fieldDisplayName } from '../../domain/field/fieldDisplayName';
import { toCSV, type CsvCell } from '../../domain/query/utils/csv';
import { findValueFormat } from './formatters';

// Escape a string for safe use inside a RegExp
const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replace every occurrence of each id with its friendly name, in a single pass.
 * Ids are matched longest-first so a short id (e.g. "sum") can't clobber part of
 * a longer id (e.g. "sum_total") before the longer one gets a chance to match,
 * and .replace() with a global regex catches every occurrence (not just the first).
 */
export const replaceIdsWithNames = (header, idNamePairs) => {
  const pairs = idNamePairs.filter(p => p?.id && p?.name);
  if (pairs.length === 0) return header;

  const sorted = [...pairs].sort((a, b) => b.id.length - a.id.length);
  const nameById = new Map(sorted.map(p => [p.id, p.name]));
  const pattern = new RegExp(sorted.map(p => escapeRegExp(p.id)).join('|'), 'g');

  return header.replace(pattern, match => nameById.get(match) ?? match);
};

/** Download CSV text as a file. The UTF-8 BOM makes Excel decode it as UTF-8. */
export const downloadCSV = (csv: string, filename: string) => {
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
};

const today = () => new Date().toISOString().slice(0, 10);

/** A metric value as a CSV cell: percentages are written as percents, not fractions. */
const metricCell = (config, value, metricKey): CsvCell =>
  typeof value === 'number' && findValueFormat(config, metricKey)?.type === 'percentage'
    ? { percent: value }
    : value;

const GROUPING_PREFIX = '_grouping_';

/**
 * CSV of raw CUBE rows with friendly column names. The _grouping_* columns are
 * dropped; a dimension rolled up by the CUBE (its grouping flag is 1) is written
 * as "Total" so it can't be mistaken for a NULL member, which stays empty.
 */
export const buildDataCSV = (cubeRows, config = null, locale?: string): string => {
  if (!cubeRows?.length) return '';
  const headers = Object.keys(cubeRows[0]).filter(h => !h.startsWith(GROUPING_PREFIX));

  // Map technical IDs to friendly names for custom metrics and groupings
  // (single pass, longest id first - see replaceIdsWithNames)
  const idNamePairs = [
    ...(config?.customGroupings || []),
    ...(config?.customMetrics || [])
  ];
  const friendlyHeaders = headers.map(header => {
    const name = fieldDisplayName(header, config || {});
    return name !== header ? name : replaceIdsWithNames(header, idNamePairs);
  });

  const rows = cubeRows.map(row => headers.map(h =>
    Number(row[GROUPING_PREFIX + h]) === 1 ? 'Total' : metricCell(config, row[h], h)
  ));
  return toCSV([friendlyHeaders, ...rows], locale);
};

/**
 * Export raw SQL data to CSV with friendly column names
 */
export const exportDataCSV = (displayData, config = null, locale?: string) => {
  return profiler.profile('exportDataCSV', () => {
  const csv = buildDataCSV(displayData?.cubeResults, config, locale);
  if (!csv) {
    alert('No data to export');
    return;
  }
  downloadCSV(csv, `pivot_data_${today()}.csv`);
  });
};

/**
 * Build CSV string from pivot display data (internal function)
 * @param {Object} data - Pivot display data
 * @param {Array} leafCols - Leaf columns from column hierarchy
 * @param {Array} rowFields - Row field names
 * @param {boolean} showRowSubtotals - Whether to show row subtotals
 * @param {boolean} showGrandTotal - Whether to show grand total
 * @param {Object} config - Pivot config for mapping custom metric names
 * @param {string} locale - Decides delimiter and decimal mark (default: en, comma and dot)
 * @returns {string} CSV string
 */
export const buildPivotCSV = (data, leafCols, rowFields, showRowSubtotals, showGrandTotal, config = null, locale?: string) => {
  return profiler.profile('buildPivotCSV', () => {
  if (!data || !data.rowGroups) {
    return '';
  }

  const getMetricName = (metricId) => metricId && fieldDisplayName(metricId, config || {});

  const lines: CsvCell[][] = [];
  const valuesIndex = (rowFields || []).indexOf('Σ Values');
  const colFields = data.columnConfig.colFields || [];
  const hasColFields = colFields.length > 0;

  if (hasColFields && leafCols && leafCols.length > 0) {
    // Build multi-row headers for column hierarchy
    const numLevels = colFields.length + 1; // colFields + value field row

    for (let level = 0; level < numLevels; level++) {
      const row = level === 0 ? ['Row Labels'] : [''];

      leafCols.forEach(leaf => {
        // Use the existing path array from the leaf
        const path = leaf.path || [];

        // For regular columns, path contains: [colField1Value, colField2Value, ..., metricName]
        // For subtotals, path contains: [...colFieldValues, "_SUBTOTAL_metric"]
        // For grand total, path is: ["_GRAND_TOTAL_metric"]

        if (leaf.isGrandTotal) {
          // Grand Total column
          if (level === 0) {
            row.push('Grand Total');
          } else if (level === numLevels - 1) {
            row.push(getMetricName(leaf.value) || '');
          } else {
            row.push('');
          }
        } else if (leaf.isSubtotal) {
          // Subtotal column - show parent values, then "Subtotal", then metric
          const pathWithoutSubtotal = path.slice(0, -1); // Remove _SUBTOTAL_xxx
          const subtotalDepth = pathWithoutSubtotal.length;

          if (level < subtotalDepth) {
            const pathVal = pathWithoutSubtotal[level];
            row.push(pathVal || '');
          } else if (level === subtotalDepth) {
            row.push('Subtotal');
          } else if (level === numLevels - 1) {
            row.push(getMetricName(leaf.value) || '');
          } else {
            row.push('');
          }
        } else {
          // Regular column - path has colField values followed by metric name
          if (level < path.length) {
            // Last level of path is the metric name - map it to friendly name
            const value = path[level];
            row.push(level === path.length - 1 ? getMetricName(value) : value);
          } else {
            row.push('');
          }
        }
      });

      lines.push(row);
    }
  } else {
    // Simple header: Row Labels + value fields (map to friendly names)
    const valueHeaders = (data.columnConfig.valueFields || []).map(getMetricName);
    const headers = ['Row Labels', ...valueHeaders];
    lines.push(headers);
  }

  // Build data rows with indentation
  const buildRow = (row, depth = 0) => {
    // Skip null rows if explicitly configured to hide them (default: show as "(Blank)")
    if (config?.showNullGroups === false && (row.groupLabel === '(null)' || row.groupLabel === null)) return;

    const indent = '    '.repeat(depth); // 4 spaces per level
    // Export raw row label without formatting - handle false, 0, "" correctly
    const labelValue = row.groupLabel;
    const labelStr = (labelValue === null || labelValue === undefined) ? '' : String(labelValue);
    const label = indent + labelStr;

    // Determine which values to show
    const hasKids = row.children && row.children.length > 0;
    const isSubtotalRow = row.subtotals && hasKids;
    let cellValues = row.values;

    if (isSubtotalRow && showRowSubtotals) {
      cellValues = row.subtotals;
    } else if (!row.values && !row.subtotals) {
      cellValues = null;
    }

    const rowMetric = valuesIndex >= 0 ? row.path?.[valuesIndex] : null;
    lines.push([label, ...(leafCols || []).map((leaf, idx) => metricCell(config, cellValues?.[idx], rowMetric || leaf.metric))]);

    // Recurse for children
    if (hasKids && row.children) {
      row.children.forEach(child => buildRow(child, depth + 1));
    }
  };

  data.rowGroups.forEach(group => buildRow(group, 0));

  // Add Grand Total row with raw numbers
  if (showGrandTotal && data.grandTotal) {
    lines.push(['Grand Total', ...(leafCols || []).map((leaf, idx) => metricCell(config, data.grandTotal[idx], leaf.metric))]);
  }

  return toCSV(lines, locale);
  });
};

/**
 * Export visual pivot layout to CSV file (browser download)
 * @param {Object} data - Pivot display data
 * @param {Array} leafCols - Leaf columns from column hierarchy
 * @param {Array} rowFields - Row field names
 * @param {boolean} showRowSubtotals - Whether to show row subtotals
 * @param {boolean} showGrandTotal - Whether to show grand total
 * @param {Object} config - Pivot config for mapping custom metric names
 * @param {string} locale - Decides delimiter and decimal mark
 */
export const exportPivotCSV = (data, leafCols, rowFields, showRowSubtotals, showGrandTotal, config = null, locale?: string) => {
  return profiler.profile('exportPivotCSV', () => {
  const csv = buildPivotCSV(data, leafCols, rowFields, showRowSubtotals, showGrandTotal, config, locale);

  if (!csv) {
    alert('No pivot data to export');
    return;
  }

  downloadCSV(csv, `pivot_visual_${today()}.csv`);
  });
};
