import { describe, it, expect } from 'vitest';
import { buildPivotDisplayData } from '../../../domain/pivot/index';
import { buildPivotGrid, type RowLayout } from '../export';
import { computeLeafColumns } from '../columnHelpers';
import { rowKey } from '../treeOperations';
import { pivotCellStyle, pivotRange } from '../../../domain/sheet/sheet';

// Region > Stadt in rows, Jahr > Monat in columns, with every subtotal, as the CUBE returns it.
const facts = [
  { Region: 'Nord', Stadt: 'Kiel', Jahr: 2024, Monat: 1, sales: 1 },
  { Region: 'Nord', Stadt: 'Kiel', Jahr: 2024, Monat: 2, sales: 2 },
  { Region: 'Nord', Stadt: 'Hamburg', Jahr: 2024, Monat: 1, sales: 4 },
  { Region: 'Süd', Stadt: 'München', Jahr: 2024, Monat: 2, sales: 8 }
];
const dims = ['Region', 'Stadt', 'Jahr', 'Monat'];
const cube: any[] = [];
for (let mask = 0; mask < 16; mask++) {
  const rolled = dims.map((_, i) => (mask >> i) & 1);
  // Only the grouping sets a hierarchy has: a child is rolled up whenever its parent is.
  if ((rolled[0] && !rolled[1]) || (rolled[2] && !rolled[3])) continue;
  const groups = new Map<string, any>();
  for (const f of facts) {
    const row: any = Object.fromEntries(dims.map((d, i) => [d, rolled[i] ? null : (f as any)[d]]));
    const key = JSON.stringify(row);
    const acc = groups.get(key) ?? { ...row, sum_sales: 0, ...Object.fromEntries(dims.map((d, i) => [`_grouping_${d}`, rolled[i]])) };
    acc.sum_sales += f.sales;
    groups.set(key, acc);
  }
  cube.push(...groups.values());
}
const values = [{ field: 'sales', aggregation: 'sum' }];
const rowFields = ['Region', 'Stadt'];
const data = buildPivotDisplayData(cube, rowFields, ['Jahr', 'Monat', 'Σ Values'], values);
const grid = (expanded?: Record<string, boolean>) => buildPivotGrid(data, computeLeafColumns(data), rowFields, true, true, { values }, {}, null, expanded);
const nord = rowKey(data.rowGroups.find((g: any) => g.label === 'Nord'));

describe('buildPivotGrid rows and columns', () => {
  it('names every row and column: headers, groups with their key, members, subtotal and grand-total columns', () => {
    const g = grid();
    expect(g.rows.map(r => r.kind)).toEqual(['header', 'header', 'header', 'subtotal', 'item', 'item', 'subtotal', 'item', 'total']);
    expect(g.rows[3]).toEqual({ kind: 'subtotal', depth: 0 });
    expect(g.rowGroups[0]).toEqual({ row: 3, col: 0, key: nord, open: true });
    expect(g.rows[4]).toEqual({ kind: 'item', depth: 1 });
    expect(g.columns).toEqual(['label', 'value', 'value', 'subtotal', 'total']);
    expect(g.cells.every(row => row.length === g.columns.length)).toBe(true);
  });

  it('with the open rows of the table, a closed group shows no children, and the CSV export (no state) shows all', () => {
    const closed = grid({});
    expect(closed.cells.map(r => String(r[0]).trim())).toEqual(['Region / Stadt', '', '', 'Nord', 'Süd', 'Grand Total']);
    expect(closed.rowGroups.map(g => [g.row, g.open])).toEqual([[3, false], [4, false]]);

    const nordOpen = grid({ [nord]: true });
    expect(nordOpen.cells.map(r => String(r[0]).trim())).toEqual(['Region / Stadt', '', '', 'Nord', 'Kiel', 'Hamburg', 'Süd', 'Grand Total']);
    expect(nordOpen.rowGroups.map(g => [g.row, g.open])).toEqual([[3, true], [6, false]]);
    expect(nordOpen.cells[3].slice(1)).toEqual([5, 2, 7, 7]);
  });
});

describe('buildPivotGrid report layouts', () => {
  // Region > Stadt, one metric in columns: Nord (Kiel 3, Hamburg 4) = 7, Süd (München 8) = 8, total 15.
  const flatCube = [[0, 0], [0, 1], [1, 1]].flatMap(([r, s]) => {
    const groups = new Map<string, any>();
    for (const f of facts) {
      const row: any = { Region: r ? null : f.Region, Stadt: s ? null : f.Stadt };
      const acc = groups.get(JSON.stringify(row)) ?? { ...row, sum_sales: 0, _grouping_Region: r, _grouping_Stadt: s };
      acc.sum_sales += f.sales;
      groups.set(JSON.stringify(row), acc);
    }
    return [...groups.values()];
  });
  const layoutGrid = (rows: string[], layout: RowLayout, subtotals = true) => {
    const d = buildPivotDisplayData(flatCube, rows, rows.includes('Σ Values') ? [] : ['Σ Values'], values);
    const keyOf = (label: string) => rowKey(d.rowGroups.find((g: any) => g.label === label));
    // Nord open, Süd collapsed
    return buildPivotGrid(d, computeLeafColumns(d), rows, subtotals, true, { values }, {}, null, { [keyOf('Nord')]: true }, layout);
  };
  const toggles = (g: ReturnType<typeof layoutGrid>) => g.rowGroups.map(t => [t.col, t.row, t.open]);
  const outline: RowLayout = { form: 'outline', repeatLabels: false };
  const tabular: RowLayout = { form: 'tabular', repeatLabels: false };

  it('compact: one label column headed by the row fields, each level indented, a parent above its children', () => {
    const g = layoutGrid(rowFields, { form: 'compact' });
    expect(g.cells).toEqual([
      ['Region / Stadt', 'sum_sales'],
      ['Nord', 7],
      ['    Kiel', 3],
      ['    Hamburg', 4],
      ['Süd', 8],
      ['Grand Total', 15]
    ]);
    expect(g.columns).toEqual(['label', 'value']);
    expect(g.rows.slice(1).map(r => r.kind)).toEqual(['subtotal', 'item', 'item', 'subtotal', 'total']);
    expect(toggles(g)).toEqual([[0, 1, true], [0, 4, false]]);
  });

  it('outline: one column per row field, a parent on its own row with its subtotals, or none without subtotals', () => {
    expect(layoutGrid(rowFields, outline).cells).toEqual([
      ['Region', 'Stadt', 'sum_sales'],
      ['Nord', '', 7],
      ['', 'Kiel', 3],
      ['', 'Hamburg', 4],
      ['Süd', '', 8],
      ['Grand Total', '', 15]
    ]);
    const bare = layoutGrid(rowFields, outline, false);
    expect(bare.cells.map(r => r[2])).toEqual(['sum_sales', undefined, 3, 4, undefined, 15]);
    expect(bare.columns).toEqual(['label', 'label', 'value']);
    expect(toggles(bare)).toEqual([[0, 1, true], [0, 4, false]]);
  });

  it('outline with repeated labels: every member row carries its parent', () => {
    expect(layoutGrid(rowFields, { form: 'outline', repeatLabels: true }).cells.slice(1, 4).map(r => r.slice(0, 2))).toEqual([
      ['Nord', ''],
      ['Nord', 'Kiel'],
      ['Nord', 'Hamburg']
    ]);
  });

  it('tabular: a parent on its first child\'s row, its subtotals on a Total row after them, a collapsed parent as one row', () => {
    const g = layoutGrid(rowFields, tabular);
    expect(g.cells).toEqual([
      ['Region', 'Stadt', 'sum_sales'],
      ['Nord', 'Kiel', 3],
      ['', 'Hamburg', 4],
      ['Nord Total', '', 7],
      ['Süd', '', 8],
      ['Grand Total', '', 15]
    ]);
    expect(g.rows.slice(1)).toEqual([
      { kind: 'item', depth: 1 },
      { kind: 'item', depth: 1 },
      { kind: 'subtotal', depth: 0 },
      { kind: 'subtotal', depth: 0 },
      { kind: 'total' }
    ]);
    // Nord's toggle on Kiel's row, where its label is
    expect(toggles(g)).toEqual([[0, 1, true], [0, 4, false]]);
  });

  it('tabular without subtotals has no Total rows', () => {
    const g = layoutGrid(rowFields, tabular, false);
    expect(g.cells.map(r => r.slice(0, 2))).toEqual([['Region', 'Stadt'], ['Nord', 'Kiel'], ['', 'Hamburg'], ['Süd', ''], ['Grand Total', '']]);
    expect(toggles(g)).toEqual([[0, 1, true], [0, 3, false]]);
  });

  it('tabular with repeated labels: every member row carries its parent, the Total row only its own label', () => {
    expect(layoutGrid(rowFields, { form: 'tabular', repeatLabels: true }).cells.slice(1, 4).map(r => r.slice(0, 2))).toEqual([
      ['Nord', 'Kiel'],
      ['Nord', 'Hamburg'],
      ['Nord Total', '']
    ]);
  });

  it('Σ Values in rows is a level with its own "Values" column; the grand totals stay in the first column', () => {
    const rows = ['Region', 'Σ Values', 'Stadt'];
    expect(layoutGrid(rows, { form: 'compact' }).cells[0][0]).toBe('Region / Values / Stadt');
    const g = layoutGrid(rows, tabular);
    expect(g.cells).toEqual([
      ['Region', 'Values', 'Stadt', 'Grand Total'],
      ['Nord', 'sum_sales', '', 7],
      ['Nord Total', '', '', undefined],
      ['Süd', '', '', undefined],
      ['Grand Total - sum_sales', '', '', 15]
    ]);
    // Nord's toggle and its collapsed metric row's share row 1, each in its own column
    expect(toggles(g)).toEqual([[0, 1, true], [1, 1, false], [0, 3, false]]);
  });

  it('shifts the column headers and their group toggles right by the label columns', () => {
    const compact = buildPivotGrid(data, computeLeafColumns(data), rowFields, true, true, { values });
    const wide = buildPivotGrid(data, computeLeafColumns(data), rowFields, true, true, { values }, {}, null, undefined, tabular);
    expect(wide.cells.slice(0, 3).map(r => r.slice(2))).toEqual(compact.cells.slice(0, 3).map(r => r.slice(1)));
    expect(wide.cells[0].slice(0, 2)).toEqual(['Region', 'Stadt']);
    expect(wide.columnGroups.map(g => g.col)).toEqual(compact.columnGroups.map(g => g.col + 1));
  });
});

describe('pivotCellStyle', () => {
  const range = pivotRange(grid({ [nord]: true }));
  const role = (x: number, y: number) => pivotCellStyle(range, x, y)?.role ?? null;

  it('gives each pivot area its role and the user cells none', () => {
    expect([role(0, 0), role(1, 2), role(4, 0)]).toEqual(['header', 'header', 'header']);
    expect([role(0, 4), role(1, 4)]).toEqual(['rowLabel', 'value']);
    expect([role(0, 3), role(1, 3), role(3, 4)]).toEqual(['subtotal', 'subtotal', 'subtotal']);
    expect([role(0, 7), role(2, 7), role(4, 4)]).toEqual(['grandTotal', 'grandTotal', 'grandTotal']);
    expect([role(5, 4), role(0, 8)]).toEqual([null, null]);
  });

  it('rules the grand total off: above its row and left of its column', () => {
    expect(pivotCellStyle(range, 1, 7)).toEqual({ role: 'grandTotal', ruleTop: true, ruleLeft: false });
    expect(pivotCellStyle(range, 4, 7)).toEqual({ role: 'grandTotal', ruleTop: true, ruleLeft: true });
    expect(pivotCellStyle(range, 4, 0)).toEqual({ role: 'header', ruleTop: false, ruleLeft: true });
    expect(pivotCellStyle(range, 1, 4)).toEqual({ role: 'value', ruleTop: false, ruleLeft: false });
  });
});
