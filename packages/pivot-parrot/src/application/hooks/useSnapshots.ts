import { useState } from 'react';
import { buildDataCSV, downloadCSV } from '../utils/export';
import { usePivotLocale } from '../state/store';
import type { PivotTableConfig } from '../../domain/models/types';
import type { Snapshot, CubeRow, DimensionFilters } from '../../domain/models/types';

// Type aliases for better semantic meaning (kept for backwards compatibility)
type CubeResults = CubeRow[];
type Dtypes = Record<string, string>;

/**
 * Custom hook to manage pivot snapshots (session storage only)
 */
export function useSnapshots() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const locale = usePivotLocale();

  function createSnapshot(
    executionConfig: PivotTableConfig,
    cubeResults: CubeResults,
    dtypes: Dtypes,
    viewState: {
      activeView: 'chart' | 'drilldown' | 'sql' | null;
      secondaryDisplayMode: 'hidden' | 'full' | 'split-below' | 'split-right';
      chartConfig?: unknown;
      sortConfig?: Snapshot['sortConfig'];
      drilldownState?: { data: CubeRow[]; filters: DimensionFilters; sql: string };
      sqlQuery?: string;
      splitPosition?: number;
    },
    customName?: string
  ): Snapshot {
    const timestamp = new Date().toISOString();
    const snapshot: Snapshot = {
      id: `snapshot_${Date.now()}`,
      name: customName || `Snapshot ${snapshots.length + 1}`,
      config: executionConfig,
      timestamp,
      cubeResults,
      dtypes,
      activeView: viewState.activeView,
      secondaryDisplayMode: viewState.secondaryDisplayMode,
      chartConfig: viewState.chartConfig,
      sortConfig: viewState.sortConfig,
      drilldownState: viewState.drilldownState,
      sqlQuery: viewState.sqlQuery,
      splitPosition: viewState.splitPosition
    };

    setSnapshots(prev => [...prev, snapshot]);
    return snapshot;
  }

  function loadSnapshot(snapshotId: string): Snapshot | null {
    const snapshot = snapshots.find(s => s.id === snapshotId);
    return snapshot || null;
  }

  function deleteSnapshot(snapshotId: string): void {
    setSnapshots(prev => prev.filter(s => s.id !== snapshotId));
  }

  function downloadAllSnapshots(): void {
    if (snapshots.length === 0) {
      return;
    }

    snapshots.forEach((snapshot) => {
      const csv = buildDataCSV(snapshot.cubeResults, snapshot.config, locale);
      downloadCSV(csv, `${(snapshot.name || snapshot.id).replace(/\s+/g, '_')}.csv`);
    });
  }

  function importSnapshots(newSnapshots: Snapshot[]): void {
    setSnapshots(prev => [...prev, ...newSnapshots]);
  }

  return {
    snapshots,
    createSnapshot,
    loadSnapshot,
    deleteSnapshot,
    downloadAllSnapshots,
    importSnapshots
  };
}
