import { describe, it, expect } from 'vitest';
import { buildHandleApplyFilter } from '../actions';

const base = { rows: [], columns: [], values: [] };

describe('applying a filter', () => {
  it('replaces the previous values, so a relative filter keeps no frozen dates', () => {
    const config = { ...base, filters: [{ field: 'order_date', type: 'between', betweenStart: '2026-01-01', betweenEnd: '2026-01-31' }] };
    const next = buildHandleApplyFilter(config as any, { field: 'order_date', type: 'relative_date', relative: { mode: 'last', n: 7, unit: 'day' }, isNot: false } as any);
    expect(next.filters).toEqual([{ field: 'order_date', type: 'relative_date', relative: { mode: 'last', n: 7, unit: 'day' }, isNot: false }]);
  });

  it('keeps the metadata the drop put on the filter', () => {
    const config = { ...base, filters: [{ field: 'SUM_sales', filterType: 'having', aggregation: 'Sum', sourceField: 'sales', type: 'greater', value: 5 }] };
    const next = buildHandleApplyFilter(config as any, { field: 'SUM_sales', type: 'less', value: 10, isNot: false } as any);
    expect(next.filters).toEqual([{ field: 'SUM_sales', filterType: 'having', aggregation: 'Sum', sourceField: 'sales', type: 'less', value: 10, isNot: false }]);
  });
});
