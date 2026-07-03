import { useCallback } from 'react';
import JSZip from 'jszip';
import { usePivotStore } from '../state/store';
import { computeLeafColumns } from '../utils/columnHelpers';
import { buildPivotCSV } from '../../application/utils/export';
import { toRows } from '../utils/columnarResult';

interface UsePivotHandlersProps {
  calculation: any;
  snapshots: any;
  drilldown: any;
  sqlPlayground: any;
  splitPane: any;
  config: any;
  executionConfig: any;
  activeView: any;
  secondaryDisplayMode: any;
  chartConfig: any;
  availableFields: any[];
  detectedTypes: Record<string, string | number>;
}

export function usePivotHandlers({
  calculation,
  snapshots,
  drilldown,
  sqlPlayground,
  splitPane,
  config,
  executionConfig,
  activeView,
  secondaryDisplayMode,
  chartConfig,
  availableFields,
  detectedTypes
}: UsePivotHandlersProps) {
  // Get store actions only (state comes from props)
  const setConfig = usePivotStore((s) => s.setConfig);
  const commitConfig = usePivotStore((s) => s.commitConfig);
  const setActiveView = usePivotStore((s) => s.setActiveView);
  const setSecondaryDisplayMode = usePivotStore((s) => s.setSecondaryDisplayMode);
  const setChartConfig = usePivotStore((s) => s.setChartConfig);

  // ==================== SNAPSHOT HANDLERS ====================
  const handleCreateSnapshot = useCallback((customName?: string) => {
    if (!executionConfig || !calculation.cubeResults) {
      return;
    }

    const viewState = {
      activeView,
      secondaryDisplayMode,
      chartConfig,
      splitPosition: splitPane.splitPosition,
      // Snapshots are serializable, so materialize the columnar drilldown
      // result into a plain rows array here (snapshot creation is an
      // explicit, infrequent user action - not the hot render path).
      drilldownState: drilldown.drilldownData ? {
        data: toRows(drilldown.drilldownData),
        filters: drilldown.drilldownFilters,
        sql: drilldown.drilldownSQL
      } : undefined,
      sqlQuery: sqlPlayground.sqlQuery
    };

    snapshots.createSnapshot(
      executionConfig,
      calculation.cubeResults,
      calculation.dtypes,
      viewState,
      customName
    );
  }, [executionConfig, calculation.cubeResults, calculation.dtypes, activeView, secondaryDisplayMode, chartConfig, splitPane, drilldown, sqlPlayground, snapshots]);

  const handleLoadSnapshot = useCallback((snapshotId: string) => {
    const snapshot = snapshots.loadSnapshot(snapshotId);
    if (snapshot) {
      setConfig(snapshot.config);
      commitConfig();
      calculation.restoreFromCache(snapshot.config, snapshot.cubeResults, snapshot.dtypes);
      setActiveView(snapshot.activeView);
      setSecondaryDisplayMode(snapshot.secondaryDisplayMode);

      if (snapshot.chartConfig) {
        setChartConfig(snapshot.chartConfig);
      }

      if (snapshot.drilldownState) {
        drilldown.restoreDrilldown(
          snapshot.drilldownState.data,
          snapshot.drilldownState.filters,
          snapshot.drilldownState.sql,
          snapshot.dtypes
        );
      }

      if (snapshot.sqlQuery) {
        sqlPlayground.setSQLQuery(snapshot.sqlQuery);
      }

      if (snapshot.splitPosition !== undefined) {
        splitPane.setSplitPosition(snapshot.splitPosition);
      }
    }
  }, [snapshots, setConfig, commitConfig, calculation, setActiveView, setSecondaryDisplayMode, setChartConfig, drilldown, sqlPlayground, splitPane]);

  const handleDeleteSnapshot = useCallback((snapshotId: string) => {
    snapshots.deleteSnapshot(snapshotId);
  }, [snapshots]);

  const handleDownloadAllSnapshots = useCallback(async () => {
    snapshots.downloadAllSnapshots();
  }, [snapshots]);

  // ==================== DRILLDOWN HANDLER ====================
  const handleDrilldown = useCallback(async (dimensionFilters: any) => {
    const saved = splitPane.savedViewStates.drilldown;
    setActiveView('drilldown');
    setSecondaryDisplayMode(saved.mode);
    splitPane.setSplitPosition(saved.position);

    try {
      await drilldown.executeDrilldown(dimensionFilters);
      // Clear any previous error on success
      calculation.setError(null);
    } catch (err: any) {
      calculation.setError(err.message);
    }
  }, [splitPane, setActiveView, setSecondaryDisplayMode, drilldown, calculation]);

  // ==================== SECONDARY VIEW HANDLERS ====================
  const handleSecondaryDisplayModeChange = useCallback((mode: 'hidden' | 'full' | 'split-below' | 'split-right') => {
    if (activeView && mode !== 'hidden') {
      splitPane.setSavedViewStates((prev: any) => ({
        ...prev,
        [activeView]: { mode, position: splitPane.splitPosition }
      }));
    }

    setSecondaryDisplayMode(mode);

    if (mode === 'hidden' && activeView) {
      splitPane.setSavedViewStates((prev: any) => ({
        ...prev,
        [activeView]: { mode: secondaryDisplayMode, position: splitPane.splitPosition }
      }));
      setActiveView(null);
    }
  }, [activeView, splitPane, setSecondaryDisplayMode, secondaryDisplayMode, setActiveView]);

  // ==================== SQL PLAYGROUND HANDLERS ====================
  const handleOpenSQL = useCallback(() => {
    const saved = splitPane.savedViewStates.sql;
    setActiveView('sql');
    setSecondaryDisplayMode(saved.mode);
    splitPane.setSplitPosition(saved.position);
  }, [splitPane, setActiveView, setSecondaryDisplayMode]);

  const handleExecuteSQL = useCallback(async (sql: string) => {
    return await sqlPlayground.executeSQL(sql);
  }, [sqlPlayground]);

  // ==================== EXPORT HANDLER ====================
  const handleDownloadTestFixtureZip = useCallback(async () => {
    try {
      const zip = new JSZip();

      // 1. Add config.json
      const configExport = {
        config: config,
        availableFields,
        detectedTypes
      };
      zip.file('config.json', JSON.stringify(configExport, null, 2));

      // 2. Add cube_results.csv
      if (calculation.cubeResults && calculation.cubeResults.length > 0) {
        const headers = Object.keys(calculation.cubeResults[0]);
        let cubeCSV = headers.join(',') + '\n';
        calculation.cubeResults.forEach((row: any) => {
          const values = headers.map(h => {
            const val = row[h];
            if (val === null || val === undefined) return '';
            const str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          });
          cubeCSV += values.join(',') + '\n';
        });
        zip.file('cube_results.csv', cubeCSV);
      }

      // 3. Add expected_output.csv
      if (calculation.displayData) {
        const rowFieldNames = config.rows.map((f: any) => typeof f === 'string' ? f : f.id);
        const leafCols = computeLeafColumns(calculation.displayData, true, true);
        const expectedOutputCSV = buildPivotCSV(
          calculation.displayData,
          leafCols,
          rowFieldNames,
          true,
          config.showGrandTotal !== false,
          config
        );
        zip.file('expected_output.csv', expectedOutputCSV);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `pivot_test_fixture_${new Date().toISOString().slice(0, 10)}.zip`;
      link.click();
    } catch (error: any) {
      console.error('Error creating test fixture zip:', error);
      alert('Error creating test fixture: ' + error.message);
    }
  }, [config, availableFields, detectedTypes, calculation]);

  return {
    handleCreateSnapshot,
    handleLoadSnapshot,
    handleDeleteSnapshot,
    handleDownloadAllSnapshots,
    handleDrilldown,
    handleSecondaryDisplayModeChange,
    handleOpenSQL,
    handleExecuteSQL,
    handleDownloadTestFixtureZip
  };
}
