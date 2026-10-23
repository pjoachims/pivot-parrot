import { describe, it, expect } from 'vitest';
import { buildPivotDisplayData } from '../../../domain/pivot/index';
import { cube } from '../../../domain/pivot/__tests__/cubeFixture';
import { computeLeafColumns } from '../columnHelpers';
import { columnPathKey } from '../cubeIndex';
import { buildPivotGrid } from '../export';
import { pivotCellStyle, pivotRange } from '../../../domain/sheet/sheet';

const facts = [
  { region: 'Nord', category: 'Home', brand: 'Ikea', product: 'Lamp', sales: 5 },
  { region: 'Nord', category: 'Tech', brand: 'Acme', product: 'Phone', sales: 10 },
  { region: 'Nord', category: 'Tech', brand: 'Acme', product: 'Phone', sales: 30 },
  { region: 'Nord', category: 'Tech', brand: 'Bolt', product: 'Laptop', sales: 200 },
  { region: 'Süd', category: 'Home', brand: 'Ikea', product: 'Sofa', sales: 900 },
  { region: 'Süd', category: 'Tech', brand: 'Acme', product: 'Phone', sales: 20 },
  { region: 'Süd', category: 'Tech', brand: 'Bolt', product: 'Laptop', sales: 100 },
  { region: 'Süd', category: 'Tech', brand: 'Bolt', product: 'Laptop', sales: 300 },
  { region: 'Süd', category: 'Tech', brand: 'Bolt', product: 'Laptop', sales: 300 }
];
const values = [{ field: 'sales', aggregation: 'sum' }, { field: 'sales', aggregation: 'avg' }];
const TECH = columnPathKey(['Tech']);
const HOME = columnPathKey(['Home']);

const twoLevels = (collapsed: string[]) =>
  buildPivotDisplayData(cube(facts, ['region', 'category', 'product']), ['region'], ['category', 'product', 'Σ Values'], values, null, {}, collapsed);

function gridOf(data: any, colSubtotals: boolean) {
  const leaves = computeLeafColumns(data, true, colSubtotals);
  const grid = buildPivotGrid(data, leaves, ['region'], true, true, { values });
  const row = (label: string) => grid.cells.find(r => String(r[0]).trim() === label)!;
  return { grid, row };
}

describe('buildPivotGrid with a collapsed column group', () => {
  it('heads Tech\'s columns with Tech and the metric, and they are value columns as in the table', () => {
    const { grid } = gridOf(twoLevels([TECH]), false);
    expect(grid.cells.slice(0, 3).map(r => r.slice(5, 7))).toEqual([['Tech', 'Tech'], ['', ''], ['sum_sales', 'avg_sales']]);
    expect(grid.columns).toEqual(['label', 'value', 'value', 'value', 'value', 'value', 'value', 'total', 'total']);
  });

  it('puts a toggle on the first column of each group, closed for the collapsed one', () => {
    const { grid } = gridOf(twoLevels([TECH]), false);
    expect(grid.columnGroups).toEqual([
      { row: 0, col: 1, key: HOME, open: true },
      { row: 0, col: 5, key: TECH, open: false }
    ]);
    const range = pivotRange(grid);
    expect(range.columnGroups.get('F1')).toEqual({ key: TECH, open: false });
    expect(pivotCellStyle(range, 5, 0)?.role).toBe('header');
  });

  it('shows the CUBE\'s value at the group\'s level: the sum, and the average over all of Tech\'s rows', () => {
    const { row } = gridOf(twoLevels([TECH]), false);
    // Süd: Phone 20 (1 row), Laptop 100, 300, 300 (3 rows). All of Tech: 720 over 4 rows.
    expect(row('Süd').slice(5, 7)).toEqual([720, 180]);
    expect(row('Grand Total').slice(5, 7)).toEqual([960, 960 / 7]);
  });

  it('keeps each column\'s own value when subtotal columns are hidden', () => {
    const { row } = gridOf(twoLevels([TECH]), false);
    expect(row('Nord').slice(1, 5)).toEqual([5, 5, null, null]);
    expect(row('Süd').slice(1, 5)).toEqual([null, null, 900, 900]);
  });

  it('with column subtotals on, an open group\'s toggle sits on its first member, its subtotal after its members', () => {
    const { grid } = gridOf(twoLevels([TECH]), true);
    expect(grid.columnGroups.map(g => [g.col, g.key, g.open])).toEqual([[1, HOME, true], [7, TECH, false]]);
    expect(grid.columns.slice(5, 7)).toEqual(['subtotal', 'subtotal']);
  });

  it('three column levels: an inner group collapses on its own and gets its toggle on the second header row', () => {
    const acme = columnPathKey(['Tech', 'Acme']);
    const data = buildPivotDisplayData(
      cube(facts, ['region', 'category', 'brand', 'product']), ['region'], ['category', 'brand', 'product', 'Σ Values'], values, null, {}, [acme]
    );
    const { grid } = gridOf(data, false);
    const inner = grid.columnGroups.filter(g => g.row === 1);
    expect(inner.find(g => g.key === acme)?.open).toBe(false);
    expect(inner.find(g => g.key === columnPathKey(['Tech', 'Bolt']))?.open).toBe(true);
    expect(grid.columnGroups.find(g => g.key === TECH)?.open).toBe(true);
    const acmeCol = inner.find(g => g.key === acme)!.col;
    expect(grid.cells[1][acmeCol]).toBe('Acme');
  });

  it('the CSV and the sheet name nothing collapsed when nothing is', () => {
    const { grid } = gridOf(twoLevels([]), true);
    expect(grid.columnGroups.every(g => g.open)).toBe(true);
    expect(grid.columnGroups.map(g => g.key)).toEqual([HOME, TECH]);
  });
});
