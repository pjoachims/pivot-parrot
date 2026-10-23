/**
 * Export utilities for PivotDisplay
 */

import { profiler } from '../../domain/query/utils/profiler';
import { fieldDisplayName } from '../../domain/field/fieldDisplayName';
import { toCSV, type CsvCell } from '../../domain/query/utils/csv';
import { decodeNumber, findValueFormat } from './formatters';
import type { SQLDialect } from '../../domain/query/dialects/SQLDialect';
import { SIGMA_VALUES_ID } from '../../domain/models/types';
import { rowKey } from './treeOperations';
import { columnPathKey } from './cubeIndex';
import { computeLeafColumns } from './columnHelpers';
import { displayTotals } from './displayTotals';

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

type Dtypes = Record<string, string>;

/** A metric value as a CSV cell: percentages are written as percents, not fractions. */
const metricCell = (config, raw, metricKey, dtypes: Dtypes, dialect: SQLDialect | null): CsvCell => {
  const value = decodeNumber(raw, dtypes[metricKey], dialect);
  return typeof value === 'number' && findValueFormat(config, metricKey)?.type === 'percentage'
    ? { percent: value }
    : value;
};

const GROUPING_PREFIX = '_grouping_';

/**
 * CSV of raw CUBE rows with friendly column names. The _grouping_* columns are
 * dropped; a dimension rolled up by the CUBE (its grouping flag is 1) is written
 * as "Total" so it can't be mistaken for a NULL member, which stays empty.
 */
export const buildDataCSV = (cubeRows, config = null, locale?: string, dtypes: Dtypes = {}, dialect: SQLDialect | null = null): string => {
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
    Number(row[GROUPING_PREFIX + h]) === 1 ? 'Total' : metricCell(config, row[h], h, dtypes, dialect)
  ));
  return toCSV([friendlyHeaders, ...rows], locale);
};

/**
 * Export raw SQL data to CSV with friendly column names
 */
export const exportDataCSV = (displayData, config = null, locale?: string, dtypes: Dtypes = {}, dialect: SQLDialect | null = null) => {
  return profiler.profile('exportDataCSV', () => {
  const csv = buildDataCSV(displayData?.cubeResults, config, locale, dtypes, dialect);
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
 * @param {Object} dtypes - Result column → engine type name, to decode raw cells
 * @param {Object} dialect - SQL dialect that decodes them
 * @returns {string} CSV string
 */
export const buildPivotCSV = (data, leafCols, rowFields, showRowSubtotals, showGrandTotal, config = null, locale?: string, dtypes: Dtypes = {}, dialect: SQLDialect | null = null) => {
  return profiler.profile('buildPivotCSV', () => {
  const { cells } = buildPivotGrid(data, leafCols, rowFields, showRowSubtotals, showGrandTotal, config, dtypes, dialect);
  return cells.length ? toCSV(cells, locale) : '';
  });
};

/**
 * What a row of the pivot grid is: a header row (column members, metric names),
 * a member row at its depth (`group` when members sit under it: `key` is its
 * expansion key, see rowKey, and `open` whether they are shown), or a grand-total row.
 */
export type PivotGridRow =
  | { kind: 'header' }
  | { kind: 'item'; depth: number }
  | { kind: 'group'; depth: number; key: string; open: boolean }
  | { kind: 'total' };

/** What a column of the pivot grid is: the row labels, a metric's values, a column subtotal or a grand total. */
export type PivotGridColumn = 'label' | 'value' | 'subtotal' | 'total';

/**
 * A column group in the header: at header row `row`, its first column `col`;
 * `key` is its columnPathKey and `open` whether its members' columns are shown.
 */
export interface PivotGridColumnGroup {
  row: number;
  col: number;
  key: string;
  open: boolean;
}

/** The pivot's visual layout: its cells, what each row and column of them is, and its column groups. */
export interface PivotGrid {
  cells: CsvCell[][];
  rows: PivotGridRow[];
  columns: PivotGridColumn[];
  columnGroups: PivotGridColumnGroup[];
}

const leafKind = (leaf): PivotGridColumn => leaf.isGrandTotal ? 'total' : leaf.isSubtotal ? 'subtotal' : 'value';

/**
 * The pivot's visual layout as rows of cells: what the "Visual Layout" CSV writes and sheet mode shows.
 * Without `expanded` every member is shown; with it, a member's children only when expanded[rowKey(member)],
 * as the table shows them. Column groups are as `data` was built: a collapsed group is one leaf per metric.
 */
export const buildPivotGrid = (data, leafCols, rowFields, showRowSubtotals, showGrandTotal, config = null, dtypes: Dtypes = {}, dialect: SQLDialect | null = null, expanded?: Record<string, boolean>): PivotGrid => {
  if (!data || !data.rowGroups) {
    return { cells: [], rows: [], columns: [], columnGroups: [] };
  }

  const getMetricName = (metricId) => metricId && fieldDisplayName(metricId, config || {});
  // A dimension member as the table shows it: the dialect renders a typed value (a date's epoch ms as 2024-01-01).
  const member = (value, field: string | undefined) => {
    if (value === null || value === undefined) return '';
    const typeName = field ? dtypes[field] : undefined;
    return typeName && dialect ? String(dialect.toDisplay(value, typeName)) : String(value);
  };

  const lines: CsvCell[][] = [];
  const rows: PivotGridRow[] = [];
  const columnGroups: PivotGridColumnGroup[] = [];
  const valuesIndex = (rowFields || []).indexOf(SIGMA_VALUES_ID);
  const colFields = data.columnConfig.colFields || [];
  const hasColFields = colFields.length > 0;

  // With Σ Values in rows the metric names label rows, so the header has no metric level
  const valuesInRows = valuesIndex >= 0;
  const metricLevel = valuesInRows ? -1 : colFields.length;

  if (hasColFields && leafCols && leafCols.length > 0) {
    // Build multi-row headers for column hierarchy
    const numLevels = valuesInRows ? colFields.length : colFields.length + 1;

    for (let level = 0; level < numLevels; level++) {
      const row = level === 0 ? ['Row Labels'] : [''];

      leafCols.forEach(leaf => {
        // A hierarchy leaf's path may hold its metric too; columnPath, and an outline column's path, hold only members
        const path = leaf.columnPath ?? leaf.path ?? [];

        if (level === metricLevel && (leaf.isSubtotal || leaf.isGrandTotal)) {
          row.push(getMetricName(leaf.metric) || '');
        } else if (leaf.isGrandTotal) {
          row.push(level === 0 ? 'Grand Total' : '');
        } else if (leaf.isSubtotal) {
          row.push(level < path.length ? member(path[level], colFields[level]) : level === path.length ? 'Subtotal' : '');
        } else if (level < path.length) {
          row.push(member(path[level], colFields[level]));
        } else {
          row.push(level === metricLevel ? getMetricName(leaf.metric) : '');
        }
      });

      lines.push(row);
      rows.push({ kind: 'header' });
    }

    // Header row `level` shows the members of column field `level`; a group starts where its key first appears.
    const collapsible = new Set((data.columnConfig.groups || []).map(columnPathKey));
    for (let level = 0; level < colFields.length - 1; level++) {
      let previous: string | null = null;
      leafCols.forEach((leaf, i) => {
        const path = leaf.isGrandTotal ? [] : leaf.columnPath ?? leaf.path ?? [];
        const key = path.length > level ? columnPathKey(path.slice(0, level + 1)) : null;
        if (key && key !== previous && collapsible.has(key)) {
          columnGroups.push({ row: level, col: i + 1, key, open: !(leaf.isCollapsed && path.length === level + 1) });
        }
        previous = key;
      });
    }
  } else if (valuesInRows) {
    lines.push(['Row Labels', ...(leafCols || []).map(leaf => leaf.isGrandTotal ? 'Grand Total' : leaf.label)]);
    rows.push({ kind: 'header' });
  } else {
    // Simple header: Row Labels + value fields (map to friendly names)
    const valueHeaders = (data.columnConfig.valueFields || []).map(getMetricName);
    const headers = ['Row Labels', ...valueHeaders];
    lines.push(headers);
    rows.push({ kind: 'header' });
  }

  // Build data rows with indentation
  const buildRow = (row, depth = 0) => {
    // Skip null rows if explicitly configured to hide them (default: show as "(Blank)")
    if (config?.showNullGroups === false && (row.groupLabel === '(null)' || row.groupLabel === null)) return;

    const indent = '    '.repeat(depth); // 4 spaces per level
    const label = indent + (depth === valuesIndex ? member(row.groupLabel, undefined) : member(row.label, rowFields?.[depth]));

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
    lines.push([label, ...(leafCols || []).map(leaf => metricCell(config, cellValues?.[leaf.valueIndex], rowMetric || leaf.metric, dtypes, dialect))]);

    if (!hasKids) {
      rows.push({ kind: 'item', depth });
      return;
    }
    const key = rowKey(row);
    const open = !expanded || !!expanded[key];
    rows.push({ kind: 'group', depth, key, open });
    if (open) row.children.forEach(child => buildRow(child, depth + 1));
  };

  data.rowGroups.forEach(group => buildRow(group, 0));

  // Add Grand Total row with raw numbers
  if (showGrandTotal && data.grandTotal) {
    if (valuesInRows) {
      // One grand-total row per metric: data.grandTotal holds {metric, metricLabel, values}
      data.grandTotal.forEach(gt => {
        lines.push([`Grand Total - ${gt.metricLabel}`, ...(leafCols || []).map(leaf => metricCell(config, gt.values?.[leaf.valueIndex], gt.metric, dtypes, dialect))]);
        rows.push({ kind: 'total' });
      });
    } else {
      lines.push(['Grand Total', ...(leafCols || []).map(leaf => metricCell(config, data.grandTotal[leaf.valueIndex], leaf.metric, dtypes, dialect))]);
      rows.push({ kind: 'total' });
    }
  }

  return { cells: lines, rows, columns: ['label', ...(leafCols || []).map(leafKind)], columnGroups };
};

/**
 * The "Visual Layout" CSV: the pivot with the table's totals (displayTotals) and column groups, every row group open.
 * It is the whole result as laid out, not the part of the rows the view shows open.
 */
export const layoutCSV = (data, config, locale?: string, dtypes: Dtypes = {}, dialect: SQLDialect | null = null): string => {
  const rowFields = (config?.rows || []).map(f => typeof f === 'string' ? f : f.id);
  const totals = displayTotals(config);
  const leafCols = computeLeafColumns(data, totals.grandTotalCol, totals.colSubtotals);
  return buildPivotCSV(data, leafCols, rowFields, totals.rowSubtotals, totals.grandTotalRow, config, locale, dtypes, dialect);
};

/** Download the "Visual Layout" CSV (see layoutCSV). */
export const exportPivotCSV = (data, config, locale?: string, dtypes: Dtypes = {}, dialect: SQLDialect | null = null) => {
  return profiler.profile('exportPivotCSV', () => {
  const csv = layoutCSV(data, config, locale, dtypes, dialect);

  if (!csv) {
    alert('No pivot data to export');
    return;
  }

  downloadCSV(csv, `pivot_visual_${today()}.csv`);
  });
};
