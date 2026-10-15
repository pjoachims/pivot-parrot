import React, { createRef } from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { Pivot } from '../Pivot';
import type { PivotHandle } from '../Pivot';
import { RemoteDataEngine } from '../../../infrastructure/data-engines/RemoteDataEngine';
import type { PivotView, SnapshotStore } from '../../../domain/models/types';

const schema = [{ name: 'region', type: 'VARCHAR' }, { name: 'sales', type: 'INTEGER' }];
const byRegion = { rows: ['region'], columns: [], values: [{ field: 'sales', aggregation: 'sum' }], filters: [] };
const bySales = { rows: [], columns: [], values: [{ field: 'sales', aggregation: 'sum' }], filters: [] };

const view = (config: any, valueKey: string | null = 'sum_sales'): PivotView => ({
  v: 1, config, derivedFields: [], sortConfig: { valueKey, direction: 'asc' }, activeView: null,
  secondaryDisplayMode: 'hidden', chartConfig: null, splitPosition: 50, drilldownFilters: null
});

/** A remote engine whose schema is held back until `open()`, so init completes when the test says. */
function engine() {
  const executeQuery = vi.fn(async () => ({ rows: [{ region: 'Nord', _grouping_region: 0, sum_sales: 1 }], schema: null }));
  const remote: any = new RemoteDataEngine({ dialect: 'duckdb', schema, executeQuery } as any);
  let open!: () => void;
  const gate = new Promise<void>(res => { open = res; });
  const fields = remote.getAvailableFields.bind(remote);
  remote.getAvailableFields = async () => { await gate; return fields(); };
  return { engine: remote, executeQuery, open };
}

function mount(key: string, extra: any = {}) {
  const e = engine();
  const ref = createRef<PivotHandle>();
  const ui = (more: any) => <Pivot ref={ref} config={{ instanceKey: key, mode: 'remote', dataEngine: e.engine, settings: { autoUpdate: true }, ...extra, ...more }} />;
  const { rerender } = render(ui({}));
  return { ...e, ref, change: (more: any) => rerender(ui(more)) };
}

const sqlOf = (executeQuery: any) => executeQuery.mock.calls.map((c: any[]) => c[0].sql as string);

it('getView returns the committed config and sort as a snapshot would hold them, without result data', async () => {
  const { ref, open, executeQuery, change } = mount('view-api-get', { initialConfig: bySales });
  expect(ref.current!.getView()).toBeNull();
  await act(async () => open());
  await waitFor(() => expect(executeQuery).toHaveBeenCalledTimes(1));

  change({ initialConfig: byRegion });
  await waitFor(() => expect(executeQuery).toHaveBeenCalledTimes(2));

  const got = ref.current!.getView()!;
  expect(got).toMatchObject({ v: 1, config: byRegion, sortConfig: { valueKey: null, direction: 'desc' } });
  const json = JSON.stringify(got);
  for (const leak of ['cubeResults', 'dtypes', 'SELECT', 'Nord']) expect(json).not.toContain(leak);
});

it('loadView applies the config and sort and runs its query', async () => {
  const { ref, open, executeQuery } = mount('view-api-load', { initialConfig: bySales });
  await act(async () => open());
  await waitFor(() => expect(executeQuery).toHaveBeenCalledTimes(1));
  expect(sqlOf(executeQuery)[0]).not.toContain('region');

  await act(async () => ref.current!.loadView(view(byRegion)));

  await waitFor(() => expect(executeQuery).toHaveBeenCalledTimes(2));
  expect(sqlOf(executeQuery)[1]).toContain('region');
  expect(ref.current!.getView()!.sortConfig).toEqual({ valueKey: 'sum_sales', direction: 'asc' });
});

it('loadView before init is applied once init completes, and only the last early call', async () => {
  const { ref, open, executeQuery } = mount('view-api-early', { initialConfig: bySales });

  act(() => {
    ref.current!.loadView(view(bySales, 'first'));
    ref.current!.loadView(view(byRegion, 'last'));
  });
  expect(executeQuery).not.toHaveBeenCalled();
  await act(async () => open());

  await waitFor(() => expect(ref.current!.getView()?.config).toEqual(byRegion));
  expect(ref.current!.getView()!.sortConfig.valueKey).toBe('last');
  await waitFor(() => expect(sqlOf(executeQuery).at(-1)).toContain('region'));
});

it('loadView rejects a view of an unknown version', () => {
  const { ref } = mount('view-api-version');
  expect(() => ref.current!.loadView({ ...view(byRegion), v: 2 } as any)).toThrow(/version 2/);
});

it('showSnapshots: false renders no Snapshots panel and never lists the host store', async () => {
  const snapshotStore: SnapshotStore = { list: vi.fn(async () => []), save: vi.fn(), remove: vi.fn() };
  const { open, executeQuery } = mount('view-api-hidden', { initialConfig: byRegion, snapshotStore, settings: { autoUpdate: true, showSnapshots: false } });
  await act(async () => open());
  await waitFor(() => expect(executeQuery).toHaveBeenCalled());

  expect(screen.queryByText(/^Snapshots \(/)).toBeNull();
  expect(snapshotStore.list).not.toHaveBeenCalled();
});
