import React from 'react';
import { it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createPivotStore, PivotStoreContext, usePivotStore } from '../../state/store';
import { useSnapshots } from '../useSnapshots';
import { useDrilldown } from '../useDrilldown';
import { usePivotHandlers } from '../usePivotHandlers';
import { serializeSnapshot, deserializeSnapshot } from '../../../domain/snapshot/serialize';

const executionConfig = { rows: ['region'], columns: [], values: [{ field: 'sales', aggregation: 'sum' }], filters: [] };
const cubeResults = [{ region: 'Nord', sum_sales: 1, _grouping_region: 0 }];

function setup() {
  const store = createPivotStore('snapshot-restore-test');
  const wrapper = ({ children }: any) => (
    <PivotStoreContext.Provider value={{ store, instanceKey: 'snapshot-restore-test' }}>{children}</PivotStoreContext.Provider>
  );
  const hook = renderHook(() => {
    const snapshots = useSnapshots();
    const drilldown = useDrilldown(null, null);
    const chartConfig = usePivotStore(s => s.chartConfig);
    const sortConfig = usePivotStore(s => s.sortConfig);
    const handlers = usePivotHandlers({
      calculation: { cubeResults, dtypes: {}, restoreFromCache: vi.fn() },
      snapshots,
      drilldown,
      sqlPlayground: { sqlQuery: '', setSQLQuery: vi.fn() },
      splitPane: { splitPosition: 50, setSplitPosition: vi.fn() },
      config: executionConfig,
      executionConfig,
      activeView: null,
      secondaryDisplayMode: 'hidden',
      chartConfig,
      availableFields: [],
      detectedTypes: {}
    });
    return { snapshots, drilldown, chartConfig, sortConfig, handlers };
  }, { wrapper });
  return { store, hook };
}

it('loading a snapshot without drilldown or chart clears the ones on screen', () => {
  const { store, hook } = setup();
  act(() => hook.result.current.handlers.handleCreateSnapshot('plain'));
  act(() => {
    hook.result.current.drilldown.restoreDrilldown([{ region: 'Nord' }], { region: 'Nord' } as any, 'SELECT 1');
    store.getState().setChartConfig({ type: 'bar' } as any);
  });
  expect(hook.result.current.drilldown.drilldownData).not.toBeNull();
  expect(hook.result.current.chartConfig).not.toBeNull();

  act(() => hook.result.current.handlers.handleLoadSnapshot(hook.result.current.snapshots.snapshots[0].id));

  expect(hook.result.current.drilldown.drilldownData).toBeNull();
  expect(hook.result.current.drilldown.drilldownSQL).toBeNull();
  expect(hook.result.current.chartConfig).toBeNull();
});

it('a snapshot keeps and restores the sort order', () => {
  const { store, hook } = setup();
  const sorted = { valueKey: 'sum_sales', direction: 'asc' as const };
  act(() => store.getState().setSort(sorted));
  act(() => hook.result.current.handlers.handleCreateSnapshot('sorted'));
  act(() => store.getState().setSort({ valueKey: null, direction: 'desc' }));

  act(() => hook.result.current.handlers.handleLoadSnapshot(hook.result.current.snapshots.snapshots[0].id));

  expect(hook.result.current.sortConfig).toEqual(sorted);
});

it('the sort order survives download and import', async () => {
  const { store, hook } = setup();
  act(() => store.getState().setSort({ valueKey: 'sum_sales', direction: 'asc' }));
  act(() => hook.result.current.handlers.handleCreateSnapshot('sorted'));

  const restored = await deserializeSnapshot(await serializeSnapshot(hook.result.current.snapshots.snapshots[0]));

  expect(restored.sortConfig).toEqual({ valueKey: 'sum_sales', direction: 'asc' });
});
