import React from 'react';
import { it, expect, vi } from 'vitest';
import { renderHook, render, screen, act, waitFor } from '@testing-library/react';
import { createPivotStore, PivotStoreContext, usePivotStore } from '../../state/store';
import { useSnapshots } from '../useSnapshots';
import { useDrilldown } from '../useDrilldown';
import { useSplitPane } from '../useSplitPane';
import { usePivotCalculation } from '../usePivotCalculation';
import { usePivotHandlers } from '../usePivotHandlers';
import { SnapshotsPanel } from '../../../presentation/sidebar/snapshots/SnapshotsPanel';
import { RemoteDataEngine } from '../../../infrastructure/data-engines/RemoteDataEngine';
import type { PivotView, SavedView, SnapshotStore } from '../../../domain/models/types';

const region = { id: 'region', name: 'region', dtype: 'string', kind: 'base_field' };
const sales = { id: 'sales', name: 'sales', dtype: 'double', kind: 'base_field' };
const orderYear = { id: 'order_date_year', name: 'order_date (Year)', dtype: 'int64', kind: 'derived_field', sourceField: 'order_date', formula: 'year(order_date)' };
const byRegion = { rows: ['region'], columns: [], values: [{ field: 'sales', aggregation: 'sum' }], filters: [] };

const savedQ2: SavedView = {
  id: 'srv-q2',
  name: 'Saved Q2',
  createdAt: '2026-10-01T08:00:00.000Z',
  view: {
    v: 1,
    config: {
      rows: ['order_date_year'],
      columns: [],
      values: [{ field: 'sales', aggregation: 'sum' }],
      filters: [],
      customGroupings: [{ id: 'grp_coast', name: 'Coast', expr: "CASE WHEN region = 'Nord' THEN 'coast' END" } as any]
    } as any,
    derivedFields: [orderYear as any],
    sortConfig: { valueKey: 'sum_sales', direction: 'asc' },
    activeView: 'drilldown',
    secondaryDisplayMode: 'split-below',
    chartConfig: null,
    splitPosition: 70,
    drilldownFilters: { order_date_year: 2024 }
  }
};

function fakeStore(initial: SavedView[] = []) {
  let views = [...initial];
  let n = 0;
  const store = {
    list: vi.fn(async () => views),
    save: vi.fn(async (input: any) => {
      const saved: SavedView = { id: input.id ?? `srv-${++n}`, name: input.name, createdAt: '2026-10-15T10:00:00.000Z', view: input.view };
      views = [...views, saved];
      return saved;
    }),
    remove: vi.fn(async (id: string) => { views = views.filter(v => v.id !== id); })
  };
  return store;
}

function setup(snapshotStore?: SnapshotStore) {
  const key = `snapshot-store-${Math.random()}`;
  const store = createPivotStore(key);
  store.setState({ dataHash: 'data-1', availableFields: [region, sales] as any, detectedTypes: { region: 'string', sales: 'double' } });
  const backend = vi.fn(async () => ({ rows: [{ region: 'Nord', sum_sales: 1, _grouping_region: 0 }], schema: null }));
  const engine = new RemoteDataEngine({ dialect: 'duckdb', executeQuery: backend } as any);
  const drilldownEngine = {
    init: vi.fn(async () => true),
    executeDrilldown: vi.fn(async () => ({ data: [{ region: 'Nord', sales: 1 }], sql: 'SELECT * FROM pivot_data', dtypes: {} }))
  };
  const wrapper = ({ children }: any) => (
    <PivotStoreContext.Provider value={{ store, instanceKey: key }}>{children}</PivotStoreContext.Provider>
  );
  const hook = renderHook(({ snapshotStore }) => {
    const config = usePivotStore(s => s.config);
    const executionConfig = usePivotStore(s => s.executionConfig);
    const availableFields = usePivotStore(s => s.availableFields);
    const activeView = usePivotStore(s => s.activeView);
    const secondaryDisplayMode = usePivotStore(s => s.secondaryDisplayMode);
    const chartConfig = usePivotStore(s => s.chartConfig);
    const sortConfig = usePivotStore(s => s.sortConfig);
    const calculation = usePivotCalculation({ executionConfig, engine });
    const snapshots = useSnapshots(snapshotStore);
    const drilldown = useDrilldown(drilldownEngine as any, null, {}, undefined, availableFields, config.customGroupings || [], config.customFilters || []);
    const splitPane = useSplitPane(activeView, secondaryDisplayMode);
    const handlers = usePivotHandlers({
      calculation, displayData: null, snapshots, drilldown, sqlPlayground: {}, splitPane,
      config, executionConfig, activeView, secondaryDisplayMode, chartConfig, availableFields, detectedTypes: {}
    });
    return { calculation, snapshots, drilldown, splitPane, handlers, sortConfig, chartConfig, availableFields };
  }, { wrapper, initialProps: { snapshotStore } });
  return { store, hook, backend, drilldownEngine };
}

async function showPivot(store: ReturnType<typeof createPivotStore>, backend: any) {
  await act(async () => {
    store.getState().setConfig(byRegion as any);
    store.getState().commitConfig();
  });
  await waitFor(() => expect(backend).toHaveBeenCalled());
}

it('creating a snapshot saves a view of the screen, without its data, to the store', async () => {
  const snapshotStore = fakeStore();
  const { store, hook, backend } = setup(snapshotStore);
  await showPivot(store, backend);
  await act(async () => store.getState().setSort({ valueKey: 'sum_sales', direction: 'asc' }));
  await act(() => hook.result.current.handlers.handleDrilldown({ region: 'Nord', year: 2024n }));
  await waitFor(() => expect(hook.result.current.drilldown.drilldownData).not.toBeNull());

  await act(async () => hook.result.current.handlers.handleCreateSnapshot('Q3'));

  expect(snapshotStore.save).toHaveBeenCalledTimes(1);
  const { name, view } = snapshotStore.save.mock.calls[0][0];
  expect(name).toBe('Q3');
  expect(Object.keys(view).sort()).toEqual(
    ['activeView', 'chartConfig', 'config', 'derivedFields', 'drilldownFilters', 'secondaryDisplayMode', 'sortConfig', 'splitPosition', 'v']
  );
  expect(view).toMatchObject({ v: 1, config: byRegion, sortConfig: { valueKey: 'sum_sales', direction: 'asc' }, activeView: 'drilldown', drilldownFilters: { region: 'Nord', year: 2024 } });
  const json = JSON.stringify(view);
  for (const leak of ['cubeResults', 'dtypes', 'SELECT', 'sum_sales":1']) expect(json).not.toContain(leak);
  expect(hook.result.current.snapshots.snapshots.map(s => s.id)).toEqual(['srv-1']);
});

it('the panel lists the stored snapshots on mount, once', async () => {
  const snapshotStore = fakeStore([savedQ2]);
  const key = 'snapshot-panel';
  const store = createPivotStore(key);
  store.setState({ showSnapshots: true });
  function Panel({ snapshotStore }: { snapshotStore: SnapshotStore }) {
    const snapshots = useSnapshots(snapshotStore);
    return <SnapshotsPanel snapshots={snapshots.snapshots} error={snapshots.error} onCreateSnapshot={() => {}} />;
  }
  const ui = (s: SnapshotStore) => <PivotStoreContext.Provider value={{ store, instanceKey: key }}><Panel snapshotStore={s} /></PivotStoreContext.Provider>;
  const { rerender } = render(ui(snapshotStore));

  expect(await screen.findByText('Saved Q2')).toBeTruthy();
  rerender(ui({ ...snapshotStore }));
  expect(snapshotStore.list).toHaveBeenCalledTimes(1);
});

it('a store that announces changes is listed again, so a view saved outside the panel shows up', async () => {
  const base = fakeStore([savedQ2]);
  const listeners = new Set<() => void>();
  const unsubscribed = vi.fn();
  const snapshotStore: SnapshotStore = {
    ...base,
    subscribe: (onChange: () => void) => {
      listeners.add(onChange);
      return () => { listeners.delete(onChange); unsubscribed(); };
    },
  };
  const key = 'snapshot-panel-subscribe';
  const store = createPivotStore(key);
  store.setState({ showSnapshots: true });
  function Panel() {
    const snapshots = useSnapshots(snapshotStore);
    return <SnapshotsPanel snapshots={snapshots.snapshots} error={snapshots.error} onCreateSnapshot={() => {}} />;
  }
  const { unmount } = render(<PivotStoreContext.Provider value={{ store, instanceKey: key }}><Panel /></PivotStoreContext.Provider>);
  expect(await screen.findByText('Saved Q2')).toBeTruthy();

  await base.save({ name: 'From the top bar', view: savedQ2.view });
  act(() => listeners.forEach(l => l()));
  expect(await screen.findByText('From the top bar')).toBeTruthy();
  expect(base.list).toHaveBeenCalledTimes(2);

  await base.remove(savedQ2.id);
  act(() => listeners.forEach(l => l()));
  await waitFor(() => expect(screen.queryByText('Saved Q2')).toBeNull());

  unmount();
  expect(unsubscribed).toHaveBeenCalledTimes(1);
});

it('restoring a snapshot applies its config and sort, re-queries, and reopens its drilldown', async () => {
  const { store, hook, backend, drilldownEngine } = setup(fakeStore([savedQ2]));
  await showPivot(store, backend);
  await waitFor(() => expect(hook.result.current.snapshots.snapshots).toHaveLength(1));
  const queriesBefore = backend.mock.calls.length;

  await act(async () => hook.result.current.handlers.handleLoadSnapshot('srv-q2'));

  expect(store.getState().executionConfig).toEqual(savedQ2.view.config);
  expect(hook.result.current.sortConfig).toEqual({ valueKey: 'sum_sales', direction: 'asc' });
  expect(store.getState().activeView).toBe('drilldown');
  expect(hook.result.current.availableFields.map(f => f.id)).toContain('order_date_year');
  await waitFor(() => expect(backend.mock.calls.length).toBeGreaterThan(queriesBefore));
  await waitFor(() => expect(drilldownEngine.executeDrilldown).toHaveBeenCalledTimes(1));
  const [filters, , , , , fields, groupings] = drilldownEngine.executeDrilldown.mock.calls[0] as any[];
  expect(filters).toEqual({ order_date_year: 2024 });
  expect(groupings).toEqual(savedQ2.view.config.customGroupings);
  expect(fields.map((f: any) => f.id)).toContain('order_date_year');
});

it('loading a snapshot without drilldown or chart clears the ones on screen', async () => {
  const { store, hook, backend } = setup();
  await showPivot(store, backend);
  await act(async () => hook.result.current.handlers.handleCreateSnapshot('plain'));
  await act(() => hook.result.current.handlers.handleDrilldown({ region: 'Nord' }));
  await act(async () => store.getState().setChartConfig({ type: 'bar' } as any));
  expect(hook.result.current.drilldown.drilldownData).not.toBeNull();

  await act(async () => hook.result.current.handlers.handleLoadSnapshot(hook.result.current.snapshots.snapshots[0].id));

  expect(hook.result.current.drilldown.drilldownData).toBeNull();
  expect(hook.result.current.drilldown.drilldownFilters).toBeNull();
  expect(hook.result.current.chartConfig).toBeNull();
});

it('deleting a snapshot removes it from the store and the list', async () => {
  const snapshotStore = fakeStore([savedQ2]);
  const { hook } = setup(snapshotStore);
  await waitFor(() => expect(hook.result.current.snapshots.snapshots).toHaveLength(1));

  await act(async () => hook.result.current.handlers.handleDeleteSnapshot('srv-q2'));

  expect(snapshotStore.remove).toHaveBeenCalledWith('srv-q2');
  expect(hook.result.current.snapshots.snapshots).toEqual([]);
});

it('a failing store shows its error in the panel and leaves the pivot working', async () => {
  const broken: SnapshotStore = {
    list: vi.fn(async () => { throw new Error('backend down'); }),
    save: vi.fn(async () => { throw new Error('quota exceeded'); }),
    remove: vi.fn(async () => { throw new Error('backend down'); })
  };
  const key = 'snapshot-panel-error';
  const panelStore = createPivotStore(key);
  panelStore.setState({ showSnapshots: true });
  function Panel() {
    const snapshots = useSnapshots(broken);
    return <SnapshotsPanel snapshots={snapshots.snapshots} error={snapshots.error} onCreateSnapshot={() => {}} />;
  }
  render(<PivotStoreContext.Provider value={{ store: panelStore, instanceKey: key }}><Panel /></PivotStoreContext.Provider>);
  expect((await screen.findByRole('alert')).textContent).toContain('backend down');

  const { store, hook, backend } = setup(broken);
  await showPivot(store, backend);
  await act(async () => hook.result.current.handlers.handleCreateSnapshot('Q3'));

  expect(hook.result.current.snapshots.error).toContain('quota exceeded');
  expect(hook.result.current.snapshots.snapshots).toEqual([]);
  const queriesBefore = backend.mock.calls.length;
  await act(async () => {
    store.getState().setConfig({ ...byRegion, rows: [] } as any);
    store.getState().commitConfig();
  });
  await waitFor(() => expect(backend.mock.calls.length).toBeGreaterThan(queriesBefore));
  expect(hook.result.current.calculation.error).toBeNull();
});

it('without a store, snapshots are kept in memory and restore as before', async () => {
  const { store, hook, backend } = setup();
  await showPivot(store, backend);
  const sorted = { valueKey: 'sum_sales', direction: 'asc' as const };
  await act(async () => store.getState().setSort(sorted));
  await act(async () => hook.result.current.handlers.handleCreateSnapshot());
  await act(async () => store.getState().setSort({ valueKey: null, direction: 'desc' }));

  expect(hook.result.current.snapshots.snapshots.map(s => s.name)).toEqual(['Snapshot 1']);
  await act(async () => hook.result.current.handlers.handleLoadSnapshot(hook.result.current.snapshots.snapshots[0].id));
  expect(hook.result.current.sortConfig).toEqual(sorted);

  await act(async () => hook.result.current.handlers.handleDeleteSnapshot(hook.result.current.snapshots.snapshots[0].id));
  expect(hook.result.current.snapshots.snapshots).toEqual([]);
});

it('imported snapshots are saved to the store under new ids', async () => {
  const snapshotStore = fakeStore();
  const { hook } = setup(snapshotStore);
  await waitFor(() => expect(snapshotStore.list).toHaveBeenCalled());

  await act(() => hook.result.current.snapshots.importSnapshots([savedQ2]));

  expect(snapshotStore.save).toHaveBeenCalledWith({ name: 'Saved Q2', view: savedQ2.view as PivotView });
  expect(hook.result.current.snapshots.snapshots.map(s => s.id)).toEqual(['srv-1']);
});

it('an import that fails part-way reports how many snapshots were not saved', async () => {
  const snapshotStore = fakeStore();
  const realSave = snapshotStore.save.getMockImplementation()!;
  snapshotStore.save.mockImplementation(async (input: any) => {
    if (input.name === 'second') throw new Error('quota exceeded');
    return realSave(input);
  });
  const { hook } = setup(snapshotStore);
  await waitFor(() => expect(snapshotStore.list).toHaveBeenCalled());

  await act(() => hook.result.current.snapshots.importSnapshots(
    ['first', 'second', 'third'].map(name => ({ ...savedQ2, name }))
  ));

  expect(hook.result.current.snapshots.snapshots.map(s => s.name)).toEqual(['first', 'third']);
  expect(hook.result.current.snapshots.error).toBe('Could not import 1 of 3 snapshots: second: quota exceeded');
});

it('a snapshot keeps sheet mode and the cells typed next to the pivot, and restoring brings them back', async () => {
  const snapshotStore = fakeStore();
  const { store, hook, backend } = setup(snapshotStore);
  await showPivot(store, backend);
  await act(async () => {
    store.getState().setMainView('sheet');
    store.getState().setSheetCells({ D2: '=B2*2', E1: 'note' });
  });
  await act(async () => hook.result.current.handlers.handleCreateSnapshot('with sheet'));
  expect(snapshotStore.save.mock.calls[0][0].view.sheet).toEqual({ show: true, cells: { D2: '=B2*2', E1: 'note' } });

  await act(async () => {
    store.getState().setMainView('table');
    store.getState().setSheetCells({});
  });
  await act(async () => hook.result.current.handlers.handleLoadSnapshot('srv-1'));
  expect(store.getState().mainView).toBe('sheet');
  expect(store.getState().sheetCells).toEqual({ D2: '=B2*2', E1: 'note' });

  await act(async () => hook.result.current.handlers.applyView(savedQ2.view));
  expect(store.getState().mainView).toBe('table');
  expect(store.getState().sheetCells).toEqual({});
});

it('a snapshot keeps the sheet\'s report layout; a view saved without one restores compact', async () => {
  const snapshotStore = fakeStore();
  const { store, hook, backend } = setup(snapshotStore);
  await showPivot(store, backend);
  await act(async () => store.getState().setSheetLayout({ form: 'tabular', repeatLabels: true }));
  await act(async () => hook.result.current.handlers.handleCreateSnapshot('tabular'));
  expect(snapshotStore.save.mock.calls[0][0].view.sheet).toEqual({ show: false, cells: {}, layout: { form: 'tabular', repeatLabels: true } });

  await act(async () => store.getState().setSheetLayout({ form: 'compact' }));
  await act(async () => hook.result.current.handlers.handleLoadSnapshot('srv-1'));
  expect(store.getState().sheetLayout).toEqual({ form: 'tabular', repeatLabels: true });

  await act(async () => hook.result.current.handlers.applyView(savedQ2.view));
  expect(store.getState().sheetLayout).toEqual({ form: 'compact' });
});
