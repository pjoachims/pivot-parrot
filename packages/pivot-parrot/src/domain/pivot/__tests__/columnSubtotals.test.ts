import { it, expect } from 'vitest';
import { buildPivotDisplayData } from '../index';

type Fact = Record<string, string | number>;

/** Every grouping set of `dims` over `facts`, shaped like the engine's CUBE rows. */
function cube(facts: Fact[], dims: string[]): any[] {
  const rows = new Map<string, any>();
  for (let mask = 0; mask < 1 << dims.length; mask++) {
    for (const fact of facts) {
      const row: any = {};
      dims.forEach((d, i) => {
        const grouped = (mask >> i) & 1;
        row[d] = grouped ? null : fact[d];
        row[`_grouping_${d}`] = grouped;
      });
      const key = JSON.stringify(row);
      const acc = rows.get(key) ?? { ...row, sum_sales: 0 };
      acc.sum_sales += fact.sales as number;
      rows.set(key, acc);
    }
  }
  return [...rows.values()];
}

const facts: Fact[] = [
  { year: 2023, category: 'Furniture', region: 'East', segment: 'Home', sales: 700 },
  { year: 2024, category: 'Furniture', region: 'East', segment: 'Corp', sales: 400 },
  { year: 2024, category: 'Furniture', region: 'West', segment: 'Home', sales: 1200 },
  { year: 2023, category: 'Office', region: 'East', segment: 'Corp', sales: 30 },
  { year: 2024, category: 'Office', region: 'West', segment: 'Home', sales: 70 }
];
const sales = [{ field: 'sales', aggregation: 'sum' }];
const columns = ['category', 'region', 'segment'];
const sqlRows = cube(facts, ['year', ...columns]);

it('has a subtotal column for every group above the last column field, after its members', () => {
  const display = buildPivotDisplayData(sqlRows, ['year'], columns, sales);
  const outline = display._columnOutline.map((c: any) => [c.path.join('/'), c.isSubtotal]);
  expect(outline).toEqual([
    ['Furniture/East/Corp', false],
    ['Furniture/East/Home', false],
    ['Furniture/East', true],
    ['Furniture/West/Home', false],
    ['Furniture/West', true],
    ['Furniture', true],
    ['Office/East/Corp', false],
    ['Office/East', true],
    ['Office/West/Home', false],
    ['Office/West', true],
    ['Office', true],
    ['', true]
  ]);
});

it('a subtotal column holds what the same members hold as a leaf column of a shallower pivot', () => {
  const deep = buildPivotDisplayData(sqlRows, ['year'], columns, sales);
  const shallow = buildPivotDisplayData(cube(facts, ['year', 'category', 'region']), ['year'], ['category', 'region'], sales);
  const column = (display: any, path: string) => display._columnOutline.findIndex((c: any) => c.path.join('/') === path);
  const byYear = (display: any, path: string) =>
    [...display.rowGroups.map((r: any) => r.values[column(display, path)]), display.grandTotal[column(display, path)]];

  expect(byYear(deep, 'Furniture/East')).toEqual([700, 400, 1100]);
  expect(byYear(deep, 'Furniture/East')).toEqual(byYear(shallow, 'Furniture/East'));
  expect(byYear(deep, 'Office/West')).toEqual(byYear(shallow, 'Office/West'));
  expect(byYear(deep, 'Furniture')).toEqual([700, 1600, 2300]);
});

it.each([
  ['values first', ['Σ Values', ...columns], []],
  ['values between the columns', ['category', 'Σ Values', 'region', 'segment'], []],
  ['values in rows', columns, ['Σ Values']]
])('subtotal columns at each depth with %s', (_, cols, extraRows) => {
  const display = buildPivotDisplayData(sqlRows, ['year', ...extraRows], cols, sales);
  const subtotals = display._columnOutline.filter((c: any) => c.isSubtotal).map((c: any) => c.path.join('/'));
  expect(new Set(subtotals)).toEqual(new Set(['Furniture/East', 'Furniture/West', 'Furniture', 'Office/East', 'Office/West', 'Office', '']));
});
