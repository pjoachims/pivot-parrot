/**
 * Export utilities for PivotDisplay
 */

import { profiler } from '../../domain/query/utils/profiler';
import { fieldDisplayName } from '../../domain/field/fieldDisplayName';
import { toCSV, type CsvCell } from '../../domain/query/utils/csv';
import { createFormatRowLabel, decodeNumber, findValueFormat } from './formatters';
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
 * @param {Object} layout - Report layout of the row labels (default compact)
 * @returns {string} CSV string
 */
export const buildPivotCSV = (data, leafCols, rowFields, showRowSubtotals, showGrandTotal, config = null, locale?: string, dtypes: Dtypes = {}, dialect: SQLDialect | null = null, layout: RowLayout = DEFAULT_ROW_LAYOUT) => {
  return profiler.profile('buildPivotCSV', () => {
  const { cells } = buildPivotGrid(data, leafCols, rowFields, showRowSubtotals, showGrandTotal, config, dtypes, dialect, undefined, layout);
  return cells.length ? toCSV(cells, locale) : '';
  });
};

/**
 * Excel's PivotTable report layouts for the row labels. Compact: one label column, each level indented.
 * Outline: one column per row field, a parent on its own row above its children. Tabular: one column
 * per row field, a parent on its first child's row and its subtotals on a "<label> Total" row after them.
 * `repeatLabels` writes every ancestor's label on each row (Excel's "Repeat All Item Labels").
 */
export type RowLayout = { form: 'compact' } | { form: 'outline' | 'tabular'; repeatLabels: boolean };

export const DEFAULT_ROW_LAYOUT: RowLayout = { form: 'compact' };

/**
 * What a row of the pivot grid is: a header row (column members, metric names), a member row at its
 * depth, a row carrying a parent's subtotals (its own row, a collapsed parent, a tabular "X Total" row),
 * or a grand-total row.
 */
export type PivotGridRow =
  | { kind: 'header' }
  | { kind: 'item'; depth: number }
  | { kind: 'subtotal'; depth: number }
  | { kind: 'total' };

/** What a column of the pivot grid is: a row label column, a metric's values, a column subtotal or a grand total. */
export type PivotGridColumn = 'label' | 'value' | 'subtotal' | 'total';

/**
 * A group's toggle: the cell at header or body row `row`, column `col` holding the group's label;
 * `key` is its expansion key (rowKey for a row group, columnPathKey for a column group) and `open`
 * whether its members are shown.
 */
export interface PivotGridGroup {
  row: number;
  col: number;
  key: string;
  open: boolean;
}

/** The pivot's visual layout: its cells, what each row and column of them is, and its row and column groups. */
export interface PivotGrid {
  cells: CsvCell[][];
  rows: PivotGridRow[];
  columns: PivotGridColumn[];
  rowGroups: PivotGridGroup[];
  columnGroups: PivotGridGroup[];
}

const leafKind = (leaf): PivotGridColumn => leaf.isGrandTotal ? 'total' : leaf.isSubtotal ? 'subtotal' : 'value';

/** A visible parent while its descendants are written: tabular places its label on the first of their rows. */
interface Ancestor {
  depth: number;
  label: string;
  key: string;
  placed: boolean;
}

/**
 * The pivot's visual layout as rows of cells: what the "Visual Layout" CSV writes and sheet mode shows.
 * Without `expanded` every member is shown; with it, a member's children only when expanded[rowKey(member)],
 * as the table shows them. Column groups are as `data` was built: a collapsed group is one leaf per metric.
 */
export const buildPivotGrid = (data, leafCols, rowFields, showRowSubtotals, showGrandTotal, config = null, dtypes: Dtypes = {}, dialect: SQLDialect | null = null, expanded?: Record<string, boolean>, layout: RowLayout = DEFAULT_ROW_LAYOUT): PivotGrid => {
  if (!data || !data.rowGroups) {
    return { cells: [], rows: [], columns: [], rowGroups: [], columnGroups: [] };
  }

  const getMetricName = (metricId) => metricId && fieldDisplayName(metricId, config || {});
  // A dimension member as the table shows it: the dialect renders a typed value (a date's epoch ms as 2024-01-01), an empty one is "(Blank)".
  const member = createFormatRowLabel(null, null, dtypes, dialect);

  const fields: string[] = rowFields || [];
  const leaves = leafCols || [];
  const lines: CsvCell[][] = [];
  const rows: PivotGridRow[] = [];
  const rowGroups: PivotGridGroup[] = [];
  const columnGroups: PivotGridGroup[] = [];
  const valuesIndex = fields.indexOf(SIGMA_VALUES_ID);
  const colFields = data.columnConfig.colFields || [];
  const hasColFields = colFields.length > 0;

  const fieldName = (field: string) => field === SIGMA_VALUES_ID ? 'Values' : fieldDisplayName(field, config || {});
  const labelHeads = fields.length === 0
    ? ['Row Labels']
    : layout.form === 'compact' ? [fields.map(fieldName).join(' / ')] : fields.map(fieldName);
  const labelCount = labelHeads.length;
  const blankLabels = (): CsvCell[] => Array(labelCount).fill('');

  // With Σ Values in rows the metric names label rows, so the header has no metric line. In columns the
  // metric line sits where Σ Values does, as in the table (ColumnHeaders): column fields after it one line lower.
  const valuesInRows = valuesIndex >= 0;
  const colValuesIndex = data.columnConfig.valuesIndex ?? -1;
  const metricLine = valuesInRows ? -1 : colValuesIndex >= 0 ? colValuesIndex : colFields.length;
  const lineOfField = (d: number) => (valuesInRows || d < metricLine ? d : d + 1);
  const header = (line: number, cells: CsvCell[]) => {
    lines.push([...(line === 0 ? labelHeads : blankLabels()), ...cells]);
    rows.push({ kind: 'header' });
  };

  if (hasColFields && leaves.length > 0) {
    const numLines = valuesInRows ? colFields.length : colFields.length + 1;

    for (let line = 0; line < numLines; line++) {
      const d = valuesInRows || line < metricLine ? line : line - 1;
      header(line, leaves.map(leaf => {
        // A hierarchy leaf's path may hold its metric too; columnPath, and an outline column's path, hold only members
        const path = leaf.columnPath ?? leaf.path ?? [];
        // As the table heads it: "Grand Total" above, its metric on the last line
        if (leaf.isGrandTotal) return !valuesInRows && line === numLines - 1 ? getMetricName(leaf.metric) || '' : line === 0 ? 'Grand Total' : '';
        if (line === metricLine) return getMetricName(leaf.metric) || '';
        if (d < path.length) return member(path[d], colFields[d]);
        return leaf.isSubtotal && d === path.length ? 'Subtotal' : '';
      }));
    }

    // Column field `level`'s members are on line lineOfField(level); a group starts where its key first appears.
    const collapsible = new Set((data.columnConfig.groups || []).map(columnPathKey));
    for (let level = 0; level < colFields.length - 1; level++) {
      let previous: string | null = null;
      leaves.forEach((leaf, i) => {
        const path = leaf.isGrandTotal ? [] : leaf.columnPath ?? leaf.path ?? [];
        const key = path.length > level ? columnPathKey(path.slice(0, level + 1)) : null;
        if (key && key !== previous && collapsible.has(key)) {
          columnGroups.push({ row: lineOfField(level), col: labelCount + i, key, open: !(leaf.isCollapsed && path.length === level + 1) });
        }
        previous = key;
      });
    }
  } else if (valuesInRows) {
    header(0, leaves.map(leaf => leaf.isGrandTotal ? 'Grand Total' : leaf.label));
  } else {
    header(0, (data.columnConfig.valueFields || []).map(getMetricName));
  }

  const write = (labels: CsvCell[], kind: PivotGridRow, values, metric, toggles: Array<Omit<PivotGridGroup, 'row'>> = []) => {
    toggles.forEach(t => rowGroups.push({ ...t, row: lines.length }));
    lines.push([...labels, ...leaves.map(leaf => metricCell(config, values?.[leaf.valueIndex], metric || leaf.metric, dtypes, dialect))]);
    rows.push(kind);
  };

  const tabular = layout.form === 'tabular';
  const repeat = layout.form !== 'compact' && layout.repeatLabels;
  // Compact writes every level into the one label column, indented; the others each level into its own.
  const labelCells = (depth: number, label: string, ancestors: Ancestor[]): CsvCell[] => {
    if (layout.form === 'compact') return ['    '.repeat(depth) + label];
    const cells = blankLabels();
    ancestors.forEach(a => { if (repeat || (tabular && !a.placed)) cells[a.depth] = a.label; });
    cells[depth] = label;
    return cells;
  };
  // Tabular: the ancestors not yet written get their label, and an open parent its toggle, on this row.
  const placeAncestors = (ancestors: Ancestor[]) => ancestors.flatMap(a => {
    if (!tabular || a.placed) return [];
    a.placed = true;
    return [{ col: a.depth, key: a.key, open: true }];
  });

  const writeNode = (node, depth: number, ancestors: Ancestor[]) => {
    // Skip null rows if explicitly configured to hide them (default: show as "(Blank)")
    if (config?.showNullGroups === false && (node.groupLabel === '(null)' || node.groupLabel === null)) return;

    const label = depth === valuesIndex ? member(node.groupLabel, undefined) : member(node.label, fields[depth]);
    const metric = valuesIndex >= 0 ? node.path?.[valuesIndex] : null;
    const col = layout.form === 'compact' ? 0 : depth;
    const hasKids = node.children && node.children.length > 0;

    if (!hasKids) {
      // The labels first: placeAncestors marks the ancestors written.
      const labels = labelCells(depth, label, ancestors);
      write(labels, { kind: 'item', depth }, node.values, metric, placeAncestors(ancestors));
      return;
    }

    const key = rowKey(node);
    const open = !expanded || !!expanded[key];
    // A parent's own row: always in compact and outline, in tabular only while it is collapsed.
    if (!open || !tabular) {
      const labels = labelCells(depth, label, ancestors);
      write(labels, { kind: 'subtotal', depth }, showRowSubtotals ? node.subtotals : null, metric, [...placeAncestors(ancestors), { col, key, open }]);
    }
    if (!open) return;

    const self: Ancestor = { depth, label, key, placed: false };
    node.children.forEach(child => writeNode(child, depth + 1, [...ancestors, self]));
    if (tabular && showRowSubtotals) {
      write(labelCells(depth, `${label} Total`, ancestors), { kind: 'subtotal', depth }, node.subtotals, metric);
    }
  };

  data.rowGroups.forEach(group => writeNode(group, 0, []));

  if (showGrandTotal && data.grandTotal) {
    const grandLabels = (label: string) => [label, ...blankLabels().slice(1)];
    if (valuesInRows) {
      // One grand-total row per metric: data.grandTotal holds {metric, metricLabel, values}
      data.grandTotal.forEach(gt => write(grandLabels(`Grand Total - ${gt.metricLabel}`), { kind: 'total' }, gt.values, gt.metric));
    } else {
      write(grandLabels('Grand Total'), { kind: 'total' }, data.grandTotal, null);
    }
  }

  return { cells: lines, rows, columns: [...Array(labelCount).fill('label'), ...leaves.map(leafKind)], rowGroups, columnGroups };
};

/**
 * The "Visual Layout" CSV: the pivot with the table's totals (displayTotals) and column groups, every row group open.
 * It is the whole result as laid out in the sheet's report layout, not the part of the rows the view shows open.
 */
export const layoutCSV = (data, config, locale?: string, dtypes: Dtypes = {}, dialect: SQLDialect | null = null, layout: RowLayout = DEFAULT_ROW_LAYOUT): string => {
  const rowFields = (config?.rows || []).map(f => typeof f === 'string' ? f : f.id);
  const totals = displayTotals(config);
  const leafCols = computeLeafColumns(data, totals.grandTotalCol, totals.colSubtotals);
  return buildPivotCSV(data, leafCols, rowFields, totals.rowSubtotals, totals.grandTotalRow, config, locale, dtypes, dialect, layout);
};

/** Download the "Visual Layout" CSV (see layoutCSV). */
export const exportPivotCSV = (data, config, locale?: string, dtypes: Dtypes = {}, dialect: SQLDialect | null = null, layout: RowLayout = DEFAULT_ROW_LAYOUT) => {
  return profiler.profile('exportPivotCSV', () => {
  const csv = layoutCSV(data, config, locale, dtypes, dialect, layout);

  if (!csv) {
    alert('No pivot data to export');
    return;
  }

  downloadCSV(csv, `pivot_visual_${today()}.csv`);
  });
};
