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

function table(result: { current: ReturnType<typeof usePivotDisplay> }) {
  const display = result.current!;
  if ('error' in display) throw new Error(display.error);
  return display;
}

it('folds the deepest column group level when the table is over the column limit', () => {
  // 3 × 40 member columns, 3 subtotals and the grand total: 124. Categories folded: 4.
  const queryResult = wideCube(['A', 'B', 'C'], 40);
  const { result } = renderHook(() => usePivotDisplay(queryResult, byColumns, sales, null));
  const display = table(result);
  expect(display._columnOutline).toHaveLength(4);
  expect(display.columnFit!.autoCollapsed).toEqual(['A', 'B', 'C'].map(c => columnPathKey([c])));
});

it('folds nothing to fit once the user\'s own collapsed group brings the table under the limit', () => {
  // A as one column: 1 + 2 × (40 + 1) + 1 = 84
  const queryResult = wideCube(['A', 'B', 'C'], 40);
  const { result } = renderHook(() => usePivotDisplay(queryResult, byColumns, sales, null, [columnPathKey(['A'])]));
  const display = table(result);
  expect(display._columnOutline).toHaveLength(84);
  expect(display.columnFit!.autoCollapsed).toEqual([]);
});

it('opens folded groups one at a time while the table fits, and keeps them open', () => {
  const queryResult = wideCube(['A', 'B', 'C'], 40);
  const { result, rerender } = renderHook(
    ({ collapsed, expanded }) => usePivotDisplay(queryResult, byColumns, sales, null, collapsed, expanded),
    { initialProps: { collapsed: [] as string[], expanded: [] as string[] } }
  );

  const openA = table(result).columnFit!.expand(['A'])!;
  expect(openA).toEqual({ collapsed: [], expanded: [columnPathKey(['A'])] });
  rerender(openA);
  // A open: 40 + 1, B and C folded, the grand total: 44
  expect(table(result)._columnOutline).toHaveLength(44);

  const openB = table(result).columnFit!.expand(['B'])!;
  rerender(openB);
  expect(table(result)._columnOutline).toHaveLength(84);
  // C open too would make 124
  expect(table(result).columnFit!.expand(['C'])).toBeNull();
});

it('is too wide only when every column group folded is still over the limit, and says what helps', () => {
  // 120 categories folded, and the grand total: 121
  const queryResult = wideCube(Array.from({ length: 120 }, (_, i) => `c${i}`), 1);
  const { result } = renderHook(() => usePivotDisplay(queryResult, byColumns, sales, null));
  expect(result.current).toEqual({
    error: 'Too many columns to display: 121 with every column group collapsed. Maximum is 100. Add a filter, move a column field to Rows or remove a value.'
  });
});

it('counts subtotal and grand total columns only when the table shows them', () => {
  // 2 × 49 member columns, 2 subtotals and the grand total: 101
  const queryResult = wideCube(['A', 'B'], 49);
  const shown = renderHook(() => usePivotDisplay(queryResult, byColumns, sales, null));
  expect(table(shown.result).columnFit!.autoCollapsed).toHaveLength(2);

  const hidden = renderHook(() => usePivotDisplay(queryResult, { ...byColumns, subtotals: 'row' }, sales, null));
  expect(table(hidden.result).columnFit!.autoCollapsed).toEqual([]);
});
