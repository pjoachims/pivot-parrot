import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSnapshots } from '../useSnapshots';

// Helper to create minimal viewState for testing
const createViewState = (overrides = {}) => ({
  activeView: null,
  secondaryDisplayMode: 'hidden',
  ...overrides
});

describe('useSnapshots', () => {
  describe('createSnapshot', () => {
    it('should create a snapshot with executed config and cube results', () => {
      const { result } = renderHook(() => useSnapshots());

      const executedConfig = {
        rows: ['category'],
        columns: ['region'],
        values: [{ field: 'sales', aggregation: 'sum' }],
        filters: []
      };
      const cubeResults = [
        { category: 'A', region: 'North', sum_sales: 100 },
        { category: 'B', region: 'South', sum_sales: 200 }
      ];
      const dtypes = { sum_sales: 'DOUBLE' };
      const viewState = createViewState();

      act(() => {
        result.current.createSnapshot(executedConfig, cubeResults, dtypes, viewState, 'Test Snapshot');
      });

      expect(result.current.snapshots).toHaveLength(1);
      expect(result.current.snapshots[0]).toMatchObject({
        name: 'Test Snapshot',
        config: executedConfig,
        cubeResults: cubeResults,
        dtypes: dtypes,
        activeView: null,
        secondaryDisplayMode: 'hidden'
      });
      expect(result.current.snapshots[0].id).toBeDefined();
      expect(result.current.snapshots[0].timestamp).toBeDefined();
    });

    it('should auto-generate name if not provided', () => {
      const { result } = renderHook(() => useSnapshots());
      const config = { rows: [], columns: [], values: [] };
      const results = [];
      const dtypes = {};
      const viewState = createViewState();

      act(() => {
        result.current.createSnapshot(config, results, dtypes, viewState);
      });

      expect(result.current.snapshots[0].name).toBe('Snapshot 1');

      act(() => {
        result.current.createSnapshot(config, results, dtypes, viewState);
      });

      expect(result.current.snapshots[1].name).toBe('Snapshot 2');
    });

    it('should not include displayData in snapshot', () => {
      const { result } = renderHook(() => useSnapshots());
      const config = { rows: [], columns: [], values: [] };
      const results = [];
      const dtypes = {};
      const viewState = createViewState();

      act(() => {
        result.current.createSnapshot(config, results, dtypes, viewState);
      });

      expect(result.current.snapshots[0]).not.toHaveProperty('displayData');
    });

    it('should store config, cubeResults, dtypes, and view state', () => {
      const { result } = renderHook(() => useSnapshots());
      const config = { rows: ['field1'], columns: [], values: [] };
      const results = [{ field1: 'value1' }];
      const dtypes = { field1: 'VARCHAR' };
      const viewState = createViewState({ activeView: 'chart', chartConfig: { type: 'bar' } });

      act(() => {
        result.current.createSnapshot(config, results, dtypes, viewState);
      });

      const snapshot = result.current.snapshots[0];
      expect(snapshot).toHaveProperty('id');
      expect(snapshot).toHaveProperty('name');
      expect(snapshot).toHaveProperty('config');
      expect(snapshot).toHaveProperty('timestamp');
      expect(snapshot).toHaveProperty('cubeResults');
      expect(snapshot).toHaveProperty('dtypes');
      expect(snapshot).toHaveProperty('activeView');
      expect(snapshot).toHaveProperty('secondaryDisplayMode');
      expect(snapshot.activeView).toBe('chart');
      expect(snapshot.chartConfig).toEqual({ type: 'bar' });
    });

    it('should capture drilldown state', () => {
      const { result } = renderHook(() => useSnapshots());
      const config = { rows: [], columns: [], values: [] };
      const results = [];
      const dtypes = {};
      const viewState = createViewState({
        activeView: 'drilldown',
        drilldownState: {
          data: [{ id: 1 }, { id: 2 }],
          filters: { category: 'A' },
          sql: 'SELECT * FROM pivot_data WHERE category = "A"'
        }
      });

      act(() => {
        result.current.createSnapshot(config, results, dtypes, viewState);
      });

      const snapshot = result.current.snapshots[0];
      expect(snapshot.activeView).toBe('drilldown');
      expect(snapshot.drilldownState).toEqual({
        data: [{ id: 1 }, { id: 2 }],
        filters: { category: 'A' },
        sql: 'SELECT * FROM pivot_data WHERE category = "A"'
      });
    });
  });

  describe('loadSnapshot', () => {
    it('should load a snapshot by id', () => {
      const { result } = renderHook(() => useSnapshots());
      const config = { rows: ['test'], columns: [], values: [] };
      const results = [{ test: 1 }];
      const dtypes = { test: 'INTEGER' };
      const viewState = createViewState();
      let snapshotId;

      act(() => {
        const snapshot = result.current.createSnapshot(config, results, dtypes, viewState, 'Load Test');
        snapshotId = snapshot.id;
      });

      const loaded = result.current.loadSnapshot(snapshotId);

      expect(loaded).toBeDefined();
      expect(loaded.name).toBe('Load Test');
      expect(loaded.config).toEqual(config);
      expect(loaded.cubeResults).toEqual(results);
      expect(loaded.dtypes).toEqual(dtypes);
    });

    it('should return null for non-existent snapshot', () => {
      const { result } = renderHook(() => useSnapshots());
      const loaded = result.current.loadSnapshot('non-existent-id');
      expect(loaded).toBeNull();
    });
  });

  describe('deleteSnapshot', () => {
    it('should delete a snapshot by id', () => {
      const { result } = renderHook(() => useSnapshots());
      const config = { rows: [], columns: [], values: [] };
      const results = [];
      const dtypes = {};
      const viewState = createViewState();
      let snapshotId;

      act(() => {
        const snapshot = result.current.createSnapshot(config, results, dtypes, viewState, 'Delete Test');
        snapshotId = snapshot.id;
      });

      expect(result.current.snapshots).toHaveLength(1);

      act(() => {
        result.current.deleteSnapshot(snapshotId);
      });

      expect(result.current.snapshots).toHaveLength(0);
    });

    it('should not affect other snapshots when deleting one', async () => {
      const { result } = renderHook(() => useSnapshots());
      const config = { rows: [], columns: [], values: [] };
      const results = [];
      const dtypes = {};
      const viewState = createViewState();
      let id1, id2;

      // Create first snapshot
      act(() => {
        const s1 = result.current.createSnapshot(config, results, dtypes, viewState, 'Snapshot 1');
        id1 = s1.id;
      });

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      // Create second snapshot
      act(() => {
        const s2 = result.current.createSnapshot(config, results, dtypes, viewState, 'Snapshot 2');
        id2 = s2.id;
      });

      expect(result.current.snapshots).toHaveLength(2);
      expect(id1).not.toBe(id2); // Verify IDs are different

      act(() => {
        result.current.deleteSnapshot(id1);
      });

      expect(result.current.snapshots).toHaveLength(1);
      expect(result.current.snapshots[0].id).toBe(id2);
      expect(result.current.snapshots[0].name).toBe('Snapshot 2');
    });
  });

  describe('multiple snapshots', () => {
    it('should maintain multiple snapshots independently', async () => {
      const { result } = renderHook(() => useSnapshots());
      const config1 = { rows: ['field1'], columns: [], values: [] };
      const config2 = { rows: ['field2'], columns: [], values: [] };
      const results1 = [{ field1: 'A' }];
      const results2 = [{ field2: 'B' }];
      const dtypes1 = { field1: 'VARCHAR' };
      const dtypes2 = { field2: 'VARCHAR' };
      const viewState = createViewState();

      act(() => {
        result.current.createSnapshot(config1, results1, dtypes1, viewState, 'First');
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      act(() => {
        result.current.createSnapshot(config2, results2, dtypes2, viewState, 'Second');
      });

      expect(result.current.snapshots).toHaveLength(2);
      expect(result.current.snapshots[0].name).toBe('First');
      expect(result.current.snapshots[0].config).toEqual(config1);
      expect(result.current.snapshots[1].name).toBe('Second');
      expect(result.current.snapshots[1].config).toEqual(config2);
    });
  });

  describe('snapshot immutability', () => {
    it('should store config as-is without modification', () => {
      const { result } = renderHook(() => useSnapshots());
      const config = {
        rows: ['category'],
        columns: ['region'],
        values: [{ field: 'sales', aggregation: 'sum' }],
        customMetrics: [{ id: 'cm1', expr: 'sales * 2' }],
        filters: [{ field: 'status', value: 'active' }]
      };
      const results = [];
      const dtypes = {};
      const viewState = createViewState();

      act(() => {
        result.current.createSnapshot(config, results, dtypes, viewState);
      });

      const storedConfig = result.current.snapshots[0].config;
      expect(storedConfig).toEqual(config);
      expect(storedConfig.customMetrics).toEqual(config.customMetrics);
      expect(storedConfig.filters).toEqual(config.filters);
    });
  });
});
