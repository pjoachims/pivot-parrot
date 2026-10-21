import { describe, it, expect } from 'vitest';
import { buildDeleteCustomExpression } from '../actions';
import { SIGMA_VALUES_ID } from '../../../domain/models/types';

function config(over: any = {}): any {
  return { rows: [], columns: [], values: [], filters: [], ...over };
}

describe('deleting a custom expression removes it everywhere', () => {
  it('removes a custom filter from the list and from Filters, keeping other filters', () => {
    const other = { field: 'region', type: 'in', values: ['North'] };
    const base = config({
      customFilters: [{ id: 'cf_1', name: 'Big orders' }],
      filters: [{ field: 'cf_1', type: 'custom_filter', isCustom: true }, other]
    });
    const c = buildDeleteCustomExpression(base, 'cf_1', 'filter');
    expect(c.customFilters).toEqual([]);
    expect(c.filters).toEqual([other]);
  });

  it('removes a custom metric from Values and drops the Σ Values field it no longer needs', () => {
    const base = config({
      customMetrics: [{ id: 'cm_1', name: 'Margin' }],
      values: [{ field: 'sales', aggregation: 'Sum' }, { field: 'cm_1', aggregation: 'custom', isCustom: true }],
      columns: [SIGMA_VALUES_ID]
    });
    const c = buildDeleteCustomExpression(base, 'cm_1', 'metric');
    expect(c.customMetrics).toEqual([]);
    expect(c.values).toEqual([{ field: 'sales', aggregation: 'Sum' }]);
    expect(c.columns).toEqual([]);
  });

  it('removes a custom grouping from Rows, Columns and Filters', () => {
    const base = config({
      customGroupings: [{ id: 'cg_1', name: 'Size band' }],
      rows: ['cg_1', 'city'],
      filters: [{ field: 'cg_1', type: 'equal' }]
    });
    const c = buildDeleteCustomExpression(base, 'cg_1', 'grouping');
    expect(c.customGroupings).toEqual([]);
    expect(c.rows).toEqual(['city']);
    expect(c.filters).toEqual([]);
  });
});
