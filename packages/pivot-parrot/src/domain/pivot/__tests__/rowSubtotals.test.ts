import { it, expect } from 'vitest';
import { buildPivotDisplayData } from '../index';
import { cube, type Fact } from './cubeFixture';

const facts: Fact[] = [
  { year: 2023, category: 'Furniture', region: 'East', segment: 'Home', channel: 'Web', sales: 700 },
  { year: 2024, category: 'Furniture', region: 'East', segment: 'Home', channel: 'Shop', sales: 50 },
  { year: 2024, category: 'Furniture', region: 'East', segment: 'Corp', channel: 'Web', sales: 400 },
  { year: 2024, category: 'Furniture', region: 'West', segment: 'Home', channel: 'Web', sales: 1200 },
  { year: 2023, category: 'Office', region: 'East', segment: 'Corp', channel: 'Shop', sales: 30 },
  { year: 2024, category: 'Office', region: 'West', segment: 'Home', channel: 'Web', sales: 70 }
];
const rows = ['category', 'region', 'segment', 'year'];
const sales = [{ field: 'sales', aggregation: 'sum' }];

/** Row path ("Furniture/East/Home") → the row's cells, its subtotals for a parent row. */
function rowCells(display: any): Map<string, unknown[]> {
  const cells = new Map<string, unknown[]>();
  const visit = (node: any) => {
    cells.set(node.path.join('/'), node.children?.length ? node.subtotals : node.values);
    node.children?.forEach(visit);
  };
  display.rowGroups.forEach(visit);
  return cells;
}

it.each([
  ['no column fields', []],
  ['a column field', ['channel']]
])('every parent row level holds subtotals, the cells of a pivot where that level is the leaf (%s)', (_, cols) => {
  const deep = rowCells(buildPivotDisplayData(cube(facts, [...rows, ...cols]), rows, cols, sales));

  for (let depth = 1; depth < rows.length; depth++) {
    const leafRows = rows.slice(0, depth);
    const shallow = rowCells(buildPivotDisplayData(cube(facts, [...leafRows, ...cols]), leafRows, cols, sales));
    for (const [path, cells] of shallow) {
      expect(deep.get(path), path).toEqual(cells);
    }
  }
  expect(deep.get('Furniture/East/Home')).toEqual(cols.length ? [50, 700, 750] : [750]);
});

it('every parent row level below Σ Values holds that metric\'s subtotals', () => {
  const display = buildPivotDisplayData(cube(facts, rows), ['category', 'Σ Values', 'region', 'segment', 'year'], [], sales);
  expect(rowCells(display).get('Furniture/sum_sales/East/Home')).toEqual([750]);
});
