import { describe, it, expect } from 'vitest';
import { buildPivotDisplayData } from '../index';

const sqlRows: any[] = [
  { region: 'North', sum_sales: 1000, count_orders: 50, _grouping_region: 0 },
  { region: 'South', sum_sales: 2000, count_orders: 75, _grouping_region: 0 },
  { region: null, sum_sales: 3000, count_orders: 125, _grouping_region: 1 }
];
const values = [
  { field: 'sales', aggregation: 'sum' },
  { field: 'orders', aggregation: 'count' }
];

const cells = (nodes: any[]) => nodes.map(n => [n.label, n.values, n.subtotals ?? null]);

describe('Σ Values in rows', () => {
  it('below the dimension: every metric row shows its value', () => {
    const r = buildPivotDisplayData(sqlRows, ['region', 'Σ Values'], [], values);
    expect(r.rowGroups.map((g: any) => [g.label, g.subtotals ?? null, cells(g.children)])).toEqual([
      ['North', null, [['sum_sales', [1000], null], ['count_orders', [50], null]]],
      ['South', null, [['sum_sales', [2000], null], ['count_orders', [75], null]]]
    ]);
  });

  it('above the dimension: metric rows carry the total, members their value', () => {
    const r = buildPivotDisplayData(sqlRows, ['Σ Values', 'region'], [], values);
    expect(r.rowGroups.map((g: any) => [g.label, g.subtotals, cells(g.children)])).toEqual([
      ['sum_sales', [3000], [['North', [1000], null], ['South', [2000], null]]],
      ['count_orders', [125], [['North', [50], null], ['South', [75], null]]]
    ]);
  });
});
