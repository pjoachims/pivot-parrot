import { useCallback, useEffect, useState } from 'react';
import JSZip from 'jszip';
import { usePivotStore, type ChartConfig } from '../state/store';
import type { useSnapshots } from './useSnapshots';
import type { PivotDisplayResult } from './usePivotDisplay';
import { DEFAULT_ROW_LAYOUT, layoutCSV } from '../../application/utils/export';
import { dataToCSV } from '../../domain/query/utils/csv';
import type { SQLDialect } from '../../domain/query/dialects/SQLDialect';
import { FieldKind } from '../../domain/models/types';
import type { DimensionFilters, PivotView } from '../../domain/models/types';
import { fromPlainJSON } from '../../domain/snapshot/json';

interface UsePivotHandlersProps {
  calculation: any;
  displayData: PivotDisplayResult | null;
  dialect?: SQLDialect | null;
  snapshots: ReturnType<typeof useSnapshots>;
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
  displayData,
  dialect = null,
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
  const sortConfig = usePivotStore((s) => s.sortConfig);
  const setSort = usePivotStore((s) => s.setSort);
  const setAvailableFields = usePivotStore((s) => s.setAvailableFields);
  const mainView = usePivotStore((s) => s.mainView);
  const sheetCells = usePivotStore((s) => s.sheetCells);
  const setMainView = usePivotStore((s) => s.setMainView);
  const setSheetCells = usePivotStore((s) => s.setSheetCells);
  const sheetLayout = usePivotStore((s) => s.sheetLayout);
  const setSheetLayout = usePivotStore((s) => s.setSheetLayout);

  // ==================== SNAPSHOT HANDLERS ====================
  /** The screen as a saved view; null before the first query has been committed. */
  const buildView = useCallback((): PivotView | null => {
    if (!executionConfig) return null;
    return {
      v: 1,
      config: executionConfig,
      derivedFields: availableFields.filter(f => f.kind === FieldKind.DERIVED_FIELD),
      sortConfig,
      activeView,
      secondaryDisplayMode,
      chartConfig: chartConfig ?? null,
      splitPosition: splitPane.splitPosition,
      drilldownFilters: drilldown.drilldownFilters ?? null,
      ...(mainView === 'sheet' || Object.keys(sheetCells).length > 0 || sheetLayout.form !== 'compact'
        ? { sheet: { show: mainView === 'sheet', cells: sheetCells, ...(sheetLayout.form !== 'compact' ? { layout: sheetLayout } : {}) } }
        : {})
    };
  }, [executionConfig, availableFields, sortConfig, activeView, secondaryDisplayMode, chartConfig, splitPane, drilldown, mainView, sheetCells, sheetLayout]);

  const handleCreateSnapshot = useCallback((name?: string) => {
    const view = buildView();
    if (!view) return;
    void snapshots.createSnapshot(name || `Snapshot ${snapshots.snapshots.length + 1}`, view);
  }, [buildView, snapshots]);

  // The drilldown must query with the restored view's fields and groupings,
  // which reach useDrilldown only on the render after the restore.
  const [pendingDrilldown, setPendingDrilldown] = useState<DimensionFilters | null>(null);
  useEffect(() => {
    if (!pendingDrilldown) return;
    setPendingDrilldown(null);
    drilldown.executeDrilldown(pendingDrilldown).catch((err: any) => calculation.setError(err.message));
  }, [pendingDrilldown]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyView = useCallback((stored: PivotView) => {
    // A fresh copy every time, so the committed config is a new object and re-queries.
    const view = fromPlainJSON<PivotView>(stored);

    const knownIds = new Set(availableFields.map(f => f.id));
    const missing = view.derivedFields.filter(f => !knownIds.has(f.id));
    if (missing.length > 0) setAvailableFields([...availableFields, ...missing]);

    setConfig(view.config);
    commitConfig();
    setActiveView(view.activeView);
    setSecondaryDisplayMode(view.secondaryDisplayMode);
    setChartConfig(view.chartConfig as ChartConfig | null);
    setSort(view.sortConfig);
    splitPane.setSplitPosition(view.splitPosition);
    setMainView(view.sheet?.show ? 'sheet' : 'table');
    setSheetCells(view.sheet?.cells ?? {});
    setSheetLayout(view.sheet?.layout ?? DEFAULT_ROW_LAYOUT);

    drilldown.clearDrilldown();
    setPendingDrilldown(view.drilldownFilters);
  }, [availableFields, setAvailableFields, setConfig, commitConfig, setActiveView, setSecondaryDisplayMode, setChartConfig, setSort, drilldown, splitPane, setMainView, setSheetCells, setSheetLayout]);

  const handleLoadSnapshot = useCallback((snapshotId: string) => {
    const saved = snapshots.snapshots.find(s => s.id === snapshotId);
    if (saved) applyView(saved.view);
  }, [snapshots, applyView]);

  const handleDeleteSnapshot = useCallback((snapshotId: string) => {
    void snapshots.deleteSnapshot(snapshotId);
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
        zip.file('cube_results.csv', dataToCSV(calculation.cubeResults));
      }

      // 3. Add expected_output.csv
      if (displayData && !('error' in displayData)) {
        const expectedOutputCSV = layoutCSV(displayData, config, undefined, calculation.dtypes, dialect);
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
  }, [config, availableFields, detectedTypes, calculation, displayData, dialect]);

  return {
    buildView,
    applyView,
    handleCreateSnapshot,
    handleLoadSnapshot,
    handleDeleteSnapshot,
    handleDrilldown,
    handleSecondaryDisplayModeChange,
    handleOpenSQL,
    handleExecuteSQL,
    handleDownloadTestFixtureZip
  };
}
