import { useState } from 'react';
import { dataToCSV } from '../../domain/query/utils/csv';
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

  function createSnapshot(
    executionConfig: PivotTableConfig,
    cubeResults: CubeResults,
    dtypes: Dtypes,
    viewState: {
      activeView: 'chart' | 'drilldown' | 'sql' | null;
      secondaryDisplayMode: 'hidden' | 'full' | 'split-below' | 'split-right';
      chartConfig?: unknown;
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
      const csv = dataToCSV(snapshot.cubeResults || []);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(snapshot.name || snapshot.id).replace(/\s+/g, '_')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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
