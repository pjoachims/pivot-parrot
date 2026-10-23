import type { PivotGrid, PivotGridColumn, PivotGridGroup, PivotGridRow } from '../../application/utils/export';

/**
 * Sheet mode: the pivot result is written read-only from A1, and the user's own
 * cells (values and formulas) sit around it. Only the user's cells are state;
 * the pivot range is rewritten from every new result.
 */

/** What a sheet cell holds: a number, or text (a label, or a formula starting with "="). */
export type SheetValue = string | number;

/** The user's cells by A1 address, as typed ("12", "=B2/B5"). */
export type SheetCells = Record<string, string>;

/**
 * The pivot written as a range from A1. `percent` lists the addresses whose number is a fraction shown as %.
 * `rowKinds` and `colKinds` say what each row and column of the range is (see PivotGrid);
 * `rowGroups` and `columnGroups` hold, by address, the label cells that open and close a row or column group.
 */
export interface PivotRange {
  values: SheetValue[][];
  rows: number;
  cols: number;
  percent: Set<string>;
  rowKinds: PivotGridRow[];
  colKinds: PivotGridColumn[];
  rowGroups: Map<string, GroupToggle>;
  columnGroups: Map<string, GroupToggle>;
}

/** A group's toggle: its expansion key and whether its members are shown. */
export interface GroupToggle {
  key: string;
  open: boolean;
}

const byAddress = (groups: PivotGridGroup[]) => new Map(groups.map(g => [cellAddress(g.col, g.row), { key: g.key, open: g.open }]));

/** The area of the pivot a cell belongs to, styled apart like an Excel PivotTable style. */
export type PivotCellRole = 'header' | 'rowLabel' | 'value' | 'subtotal' | 'grandTotal';

/** A pivot cell's role, and whether it starts the grand total: a rule above (total row) or to its left (total column). */
export interface PivotCellStyle {
  role: PivotCellRole;
  ruleTop: boolean;
  ruleLeft: boolean;
}

export function columnLabel(x: number): string {
  let label = '';
  for (let n = x + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    label = String.fromCharCode(65 + ((n - 1) % 26)) + label;
  }
  return label;
}

export function cellAddress(x: number, y: number): string {
  return `${columnLabel(x)}${y + 1}`;
}

export function parseAddress(address: string): { x: number; y: number } | null {
  const m = /^([A-Z]+)([1-9][0-9]*)$/.exec(address);
  if (!m) return null;
  const x = [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return { x, y: Number(m[2]) - 1 };
}

export function inPivot(range: Pick<PivotRange, 'rows' | 'cols'>, x: number, y: number): boolean {
  return x < range.cols && y < range.rows;
}

/** The pivot's visual layout (the "Visual Layout" CSV rows) as a sheet range. */
export function pivotRange(grid: PivotGrid): PivotRange {
  const percent = new Set<string>();
  const values = grid.cells.map((row, y) => row.map((cell, x): SheetValue => {
    if (cell == null) return '';
    if (typeof cell === 'number') return Number.isFinite(cell) ? cell : '';
    if (typeof cell === 'bigint') return Number(cell);
    if (typeof cell === 'boolean') return String(cell);
    if (cell instanceof Date) return isNaN(cell.getTime()) ? '' : cell.toISOString().slice(0, 10);
    if (typeof cell === 'object') {
      if (!Number.isFinite(cell.percent)) return '';
      percent.add(cellAddress(x, y));
      return cell.percent;
    }
    // A label that looks like a formula must stay text.
    return cell.startsWith('=') ? `'${cell}` : cell;
  }));
  return {
    values,
    rows: values.length,
    cols: Math.max(0, ...values.map(r => r.length)),
    percent,
    rowKinds: grid.rows,
    colKinds: grid.columns,
    rowGroups: byAddress(grid.rowGroups),
    columnGroups: byAddress(grid.columnGroups)
  };
}

/** The style of the pivot cell at x, y; null outside the pivot (the user's cells). */
export function pivotCellStyle(range: PivotRange, x: number, y: number): PivotCellStyle | null {
  if (!inPivot(range, x, y)) return null;
  const row = range.rowKinds[y]?.kind;
  const col = range.colKinds[x];
  const role: PivotCellRole =
    row === 'header' ? 'header'
    : row === 'total' || col === 'total' ? 'grandTotal'
    : row === 'subtotal' || col === 'subtotal' ? 'subtotal'
    : col === 'label' ? 'rowLabel'
    : 'value';
  return {
    role,
    ruleTop: row === 'total' && range.rowKinds[y - 1]?.kind !== 'total',
    ruleLeft: col === 'total' && range.colKinds[x - 1] !== 'total'
  };
}

/**
 * The full sheet: the pivot range, then the user's cells. A user cell the pivot
 * now covers is not shown (the pivot wins) but stays in `cells`, so it is back
 * once the pivot shrinks again; it is listed in `covered`.
 */
export function composeSheet(range: PivotRange, cells: SheetCells, minCols = 0, minRows = 0): { data: SheetValue[][]; covered: string[] } {
  const own = Object.entries(cells).flatMap(([address, raw]) => {
    const at = parseAddress(address);
    return at ? [{ address, raw, ...at }] : [];
  });
  const cols = Math.max(minCols, range.cols, ...own.map(c => c.x + 1));
  const rows = Math.max(minRows, range.rows, ...own.map(c => c.y + 1));
  const data: SheetValue[][] = Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x) => range.values[y]?.[x] ?? '')
  );
  const covered: string[] = [];
  for (const c of own) {
    if (inPivot(range, c.x, c.y)) covered.push(c.address);
    else data[c.y][c.x] = c.raw;
  }
  return { data, covered };
}

/** The user's cells after typing `raw` into `address`; a pivot cell is read-only and an empty input removes the cell. */
export function editCell(range: Pick<PivotRange, 'rows' | 'cols'>, cells: SheetCells, address: string, raw: string): SheetCells {
  const at = parseAddress(address);
  if (!at || inPivot(range, at.x, at.y)) return cells;
  if (raw === '') {
    if (!(address in cells)) return cells;
    const { [address]: _removed, ...rest } = cells;
    return rest;
  }
  return cells[address] === raw ? cells : { ...cells, [address]: raw };
}

export interface SelectionSummary {
  /** Non-empty cells, like Excel's "Count". */
  count: number;
  /** Numeric cells. */
  numbers: number;
  sum: number;
  average: number | null;
}

/** Excel's status bar over the selected cells' shown values. */
export function summarize(values: unknown[]): SelectionSummary {
  let count = 0;
  let numbers = 0;
  let sum = 0;
  for (const v of values) {
    if (v == null || v === '') continue;
    count++;
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (Number.isFinite(n)) {
      numbers++;
      sum += n;
    }
  }
  return { count, numbers, sum, average: numbers ? sum / numbers : null };
}
