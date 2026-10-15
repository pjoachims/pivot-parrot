import { it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePivotDisplay } from '../usePivotDisplay';

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

  expect(result.current.error).toBeUndefined();
  expect(result.current.rowGroups[0].children).toHaveLength(27);
});
