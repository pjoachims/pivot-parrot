import { it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePivotDisplay } from '../usePivotDisplay';
import { columnPathKey } from '../../utils/cubeIndex';

it('does not multiply column members by the metric count when Σ Values sits in rows', () => {
  const values = Array.from({ length: 27 }, (_, i) => ({ field: `m${i}`, aggregation: 'sum' }));
  const cubeResults: any[] = [];
  for (const month of [1, 2, 3, 4, 5]) {
    const row: any = { month, region: 'North', _grouping_month: 0, _grouping_region: 0 };
    values.forEach(v => { row[`sum_${v.field}`] = month; });
    cubeResults.push(row);
  }
  const queryResult = { cubeResults, dtypes: {}, fieldsHash: 'month,region' };
  const config = { rows: ['region', 'Σ Values'], columns: ['month'] };

  const { result } = renderHook(() => usePivotDisplay(queryResult, config, values, null));

  const display = result.current!;
  if ('error' in display) throw new Error(display.error);
  expect(display.rowGroups[0].children).toHaveLength(27);
});

/** CUBE rows for `regionsPer` regions in each of `categories`, every grouping set of category and region. */
function wideCube(categories: string[], regionsPer: number) {
  const rows: any[] = [{ category: null, region: null, _grouping_category: 1, _grouping_region: 1, sum_sales: 1 }];
  categories.forEach(category => {
    rows.push({ category, region: null, _grouping_category: 0, _grouping_region: 1, sum_sales: 1 });
    for (let r = 0; r < regionsPer; r++) {
      const region = `r${r}`;
      rows.push({ category, region, _grouping_category: 0, _grouping_region: 0, sum_sales: 1 });
      rows.push({ category: null, region, _grouping_category: 1, _grouping_region: 0, sum_sales: 1 });
    }
  });
  return { cubeResults: rows, dtypes: {}, fieldsHash: 'category,region' };
}
const sales = [{ field: 'sales', aggregation: 'sum' }];
const byColumns = { rows: [], columns: ['category', 'region'] };

it('a table over the column limit renders once a collapsed group brings it under', () => {
  // 3 × 40 member columns, 3 subtotals and the grand total: 124
  const queryResult = wideCube(['A', 'B', 'C'], 40);
  const { result, rerender } = renderHook(
    ({ collapsed }) => usePivotDisplay(queryResult, byColumns, sales, null, collapsed),
    { initialProps: { collapsed: [] as string[] } }
  );
  expect(result.current).toEqual({ error: expect.stringContaining('(124)') });

  // A as one column: 1 + 2 × (40 + 1) + 1 = 84
  rerender({ collapsed: [columnPathKey(['A'])] });
  const display = result.current!;
  expect('error' in display).toBe(false);
});

it('counts subtotal and grand total columns only when the table shows them', () => {
  // 2 × 49 member columns, 2 subtotals and the grand total: 101
  const queryResult = wideCube(['A', 'B'], 49);
  const shown = renderHook(() => usePivotDisplay(queryResult, byColumns, sales, null));
  expect(shown.result.current).toEqual({ error: expect.stringContaining('(101)') });

  const hidden = renderHook(() => usePivotDisplay(queryResult, { ...byColumns, subtotals: 'row' }, sales, null));
  expect('error' in hidden.result.current!).toBe(false);
});
