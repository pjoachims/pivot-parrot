import { it, expect } from 'vitest';
import { buildPivotDisplayData } from '../index';

const sqlRows: any[] = [
  { region: 'North', sum_sales: 1000, count_orders: 80, _grouping_region: 0 },
  { region: 'South', sum_sales: 2000, count_orders: 75, _grouping_region: 0 },
  { region: null, sum_sales: 3000, count_orders: 155, _grouping_region: 1 }
];
const values = [
  { field: 'sales', aggregation: 'sum' },
  { field: 'orders', aggregation: 'count' }
];
const bySalesDesc = { valueKey: 'sum_sales', direction: 'desc' };

it('sorts members by the chosen value when Σ Values sits below them in rows', () => {
  const r = buildPivotDisplayData(sqlRows, ['region', 'Σ Values'], [], values, bySalesDesc);
  expect(r.rowGroups.map((g: any) => [g.label, g.children.map((c: any) => c.label)])).toEqual([
    ['South', ['sum_sales', 'count_orders']],
    ['North', ['sum_sales', 'count_orders']]
  ]);
});

it('sorts members under each metric when Σ Values sits above them in rows', () => {
  const r = buildPivotDisplayData(sqlRows, ['Σ Values', 'region'], [], values, bySalesDesc);
  expect(r.rowGroups.map((g: any) => [g.label, g.children.map((c: any) => c.label)])).toEqual([
    ['sum_sales', ['South', 'North']],
    ['count_orders', ['South', 'North']]
  ]);
});

it('still sorts by value when Values are columns', () => {
  const r = buildPivotDisplayData(sqlRows, ['region'], ['Σ Values'], values, { valueKey: 'count_orders', direction: 'desc' });
  expect(r.rowGroups.map((g: any) => g.label)).toEqual(['North', 'South']);
});
