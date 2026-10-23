import { describe, it, expect } from 'vitest';
import { buildPivotDisplayData } from '../../../domain/pivot/index';
import { buildPivotGrid } from '../export';
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
    expect(g.rows.map(r => r.kind)).toEqual(['header', 'header', 'header', 'group', 'item', 'item', 'group', 'item', 'total']);
    expect(g.rows[3]).toEqual({ kind: 'group', depth: 0, key: nord, open: true });
    expect(g.rows[4]).toEqual({ kind: 'item', depth: 1 });
    expect(g.columns).toEqual(['label', 'value', 'value', 'subtotal', 'total']);
    expect(g.cells.every(row => row.length === g.columns.length)).toBe(true);
  });

  it('with the open rows of the table, a closed group shows no children, and the CSV export (no state) shows all', () => {
    const closed = grid({});
    expect(closed.cells.map(r => String(r[0]).trim())).toEqual(['Row Labels', '', '', 'Nord', 'Süd', 'Grand Total']);
    expect(closed.rows.slice(3).map(r => r.kind === 'group' && r.open)).toEqual([false, false, false]);

    const nordOpen = grid({ [nord]: true });
    expect(nordOpen.cells.map(r => String(r[0]).trim())).toEqual(['Row Labels', '', '', 'Nord', 'Kiel', 'Hamburg', 'Süd', 'Grand Total']);
    expect(nordOpen.rows[3]).toMatchObject({ kind: 'group', open: true });
    expect(nordOpen.cells[3].slice(1)).toEqual([5, 2, 7, 7]);
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
