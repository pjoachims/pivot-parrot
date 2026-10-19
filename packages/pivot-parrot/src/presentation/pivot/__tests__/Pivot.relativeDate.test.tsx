import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { Pivot } from '../Pivot';
import { RemoteDataEngine } from '../../../infrastructure/data-engines/RemoteDataEngine';

const schema = [{ name: 'date', type: 'DATE' }, { name: 'sales', type: 'INTEGER' }];
const last30Days = { field: 'date', type: 'relative_date', relative: { mode: 'last', n: 30, unit: 'day' } };
const total = (filters: any[]) => ({ rows: [], columns: [], values: [{ field: 'sales', aggregation: 'sum' }], filters });

function mount(key: string, initialConfig: any) {
  const executeQuery = vi.fn(async () => ({ rows: [{ sum_sales: 1 }], schema: null }));
  const engine: any = new RemoteDataEngine({ dialect: 'duckdb', schema, executeQuery } as any);
  const ui = (config: any) => <Pivot config={{ instanceKey: key, mode: 'remote', dataEngine: engine, settings: { autoUpdate: true }, initialConfig: config }} />;
  const view = render(ui(initialConfig));
  return { executeQuery, change: (config: any) => view.rerender(ui(config)) };
}

const sqlOf = (executeQuery: any) => executeQuery.mock.calls.map((c: any[]) => c[0].sql as string);

it('a relative date filter set on a running pivot sends a filtered query', async () => {
  const { executeQuery, change } = mount('relative-date-set', total([]));
  await waitFor(() => expect(executeQuery).toHaveBeenCalledTimes(1));
  expect(sqlOf(executeQuery)[0]).not.toContain('current_date');

  await act(async () => change(total([last30Days])));

  await waitFor(() => expect(executeQuery).toHaveBeenCalledTimes(2));
  expect(sqlOf(executeQuery)[1]).toContain(`date_trunc('day', current_date) + INTERVAL (-29) DAY`);
});

it('a view opened with a relative date filter runs filtered', async () => {
  const { executeQuery } = mount('relative-date-open', total([last30Days]));
  await waitFor(() => expect(executeQuery).toHaveBeenCalled());
  expect(sqlOf(executeQuery)[0]).toContain(`date_trunc('day', current_date) + INTERVAL (1) DAY`);
});
