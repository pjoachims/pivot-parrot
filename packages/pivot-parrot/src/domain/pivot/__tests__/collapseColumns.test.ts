import { it, expect } from 'vitest';
import { buildPivotDisplayData } from '../index';
import { columnPathKey } from '../../../application/utils/cubeIndex';

type Fact = Record<string, string | number>;

/** Every grouping set of `dims` over `facts`, shaped like the engine's CUBE rows. */
function cube(facts: Fact[], dims: string[], withPrefixes = true): any[] {
  const rows = new Map<string, any>();
  const masks = withPrefixes ? Array.from({ length: 1 << dims.length }, (_, m) => m) : [0];
  for (const mask of masks) {
    for (const fact of facts) {
      const row: any = {};
      dims.forEach((d, i) => {
        const grouped = (mask >> i) & 1;
        row[d] = grouped ? null : fact[d];
        row[`_grouping_${d}`] = grouped;
      });
      const key = JSON.stringify(row);
      const acc = rows.get(key) ?? { ...row, sum_sales: 0, count_orders: 0 };
      acc.sum_sales += fact.sales as number;
      acc.count_orders += 1;
      rows.set(key, acc);
    }
  }
  return [...rows.values()];
}

const facts: Fact[] = [
  { region: 'East', category: 'Furniture', year: 2023, sales: 700 },
  { region: 'East', category: 'Furniture', year: 2024, sales: 400 },
  { region: 'West', category: 'Furniture', year: 2024, sales: 1200 },
  { region: 'East', category: 'Office', year: 2023, sales: 30 },
  { region: 'West', category: 'Office', year: 2024, sales: 70 },
  { region: 'West', category: 'Tech', year: 2023, sales: 900 }
];
const values = [{ field: 'sales', aggregation: 'sum' }, { field: 'orders', aggregation: 'count' }];
const furniture = [columnPathKey(['Furniture'])];

const columnsAt = (display: any, path: unknown[]) =>
  display._columnOutline
    .map((col: any, i: number) => ({ col, i }))
    .filter(({ col }: any) => col.path[0] === path[0] && col.path.length >= path.length);

it('a collapsed group is one column per metric holding the group total', () => {
  const display = buildPivotDisplayData(cube(facts, ['year', 'category', 'region']), ['year'], ['category', 'region'], values, null, {}, furniture);

  const cols = columnsAt(display, ['Furniture']);
  expect(cols.map(({ col }: any) => [col.path, col.metric, col.isCollapsed, col.isSubtotal])).toEqual([
    [['Furniture'], 'sum_sales', true, false],
    [['Furniture'], 'count_orders', true, false]
  ]);
  const [sales, orders] = cols.map(({ i }: any) => i);
  expect(display.grandTotal[sales]).toBe(2300);
  expect(display.grandTotal[orders]).toBe(3);
  const y2023 = display.rowGroups.find((r: any) => String(r.label) === '2023');
  expect(y2023.values[sales]).toBe(700);

  expect(columnsAt(display, ['Office']).length).toBeGreaterThan(2);
});

it('collapses a group below the first column field: its subtotal and members become one column', () => {
  const dims = ['category', 'region', 'year'];
  const open = buildPivotDisplayData(cube(facts, dims), [], dims, [values[0]], null, {});
  expect(open._columnOutline.filter((c: any) => c.path[0] === 'Furniture' && c.path[1] === 'East')).toHaveLength(3);
  expect(open._columnOutline.find((c: any) => columnPathKey(c.path) === columnPathKey(['Furniture', 'East']))).toMatchObject({ isSubtotal: true });

  const display = buildPivotDisplayData(cube(facts, dims), [], dims, [values[0]], null, {}, [columnPathKey(['Furniture', 'East'])]);
  const at = display._columnOutline.findIndex((c: any) => columnPathKey(c.path) === columnPathKey(['Furniture', 'East']));
  expect(display._columnOutline[at]).toMatchObject({ path: ['Furniture', 'East'], isCollapsed: true, isSubtotal: false });
  expect(display.grandTotal[at]).toBe(1100);
  expect(display._columnOutline.filter((c: any) => c.path[0] === 'Furniture' && c.path[1] === 'East')).toHaveLength(1);
});

it('with Σ Values in rows a collapsed group is one column', () => {
  const display = buildPivotDisplayData(cube(facts, ['year', 'category', 'region']), ['year', 'Σ Values'], ['category', 'region'], values, null, {}, furniture);
  const cols = columnsAt(display, ['Furniture']);
  expect(cols.map(({ col }: any) => col.path)).toEqual([['Furniture']]);
  const salesTotal = display.grandTotal.find((r: any) => r.metric === 'sum_sales');
  expect(salesTotal.values[cols[0].i]).toBe(2300);
});

it('lists the groups that can collapse: those the cube aggregated', () => {
  const dims = ['category', 'region'];
  const display = buildPivotDisplayData(cube(facts, dims), [], dims, [values[0]], null, {});
  expect(display.columnConfig.groups).toEqual([['Furniture'], ['Office'], ['Tech']]);

  const noCube = buildPivotDisplayData(cube(facts, dims, false), [], dims, [values[0]], null, {});
  expect(noCube.columnConfig.groups).toEqual([]);
});

it('sorts rows by a collapsed column', () => {
  const display = buildPivotDisplayData(cube(facts, ['year', 'category', 'region']), ['year'], ['category', 'region'], values, { valueKey: 'sum_sales', direction: 'desc', columnPath: ['Furniture'] }, {}, furniture);
  expect(display.rowGroups.map((r: any) => String(r.label))).toEqual(['2024', '2023']);
  const asc = buildPivotDisplayData(cube(facts, ['year', 'category', 'region']), ['year'], ['category', 'region'], values, { valueKey: 'sum_sales', direction: 'asc', columnPath: ['Furniture'] }, {}, furniture);
  expect(asc.rowGroups.map((r: any) => String(r.label))).toEqual(['2023', '2024']);
});
