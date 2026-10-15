import React, { useState, useEffect, useMemo, useImperativeHandle, forwardRef, useRef, useContext } from 'react';
import { DuckDBWASMEngine } from '../../infrastructure/data-engines/DuckDBWASMEngine';
import { hashData } from '../../domain/query/utils/cache';
import { dataToCSV } from '../../domain/query/utils/csv';
import { FieldItem } from '../../domain/field/FieldItem';
import ErrorBoundary from '../shared/ErrorBoundary';
import { ProgressIndicator } from '../shared/ProgressIndicator';
import { useSplitPane } from '../../application/hooks/useSplitPane';
import { useSnapshots } from '../../application/hooks/useSnapshots';
import { useDrilldown } from '../../application/hooks/useDrilldown';
import { useSQLPlayground } from '../../application/hooks/useSQLPlayground';
import { usePivotCalculation } from '../../application/hooks/usePivotCalculation';
import { usePivotDisplay } from '../../application/hooks/usePivotDisplay';
import { useQueryProgress } from '../../application/hooks/useQueryProgress';
import { useDevMode } from '../../application/hooks/useDevMode';
import { profiler } from '../../domain/query/utils/profiler';
import { computeLeafColumns } from '../../application/utils/columnHelpers';
import JSZip from 'jszip';
import type { PivotConfig, PivotTableConfig } from '../../domain/models/types';
import { FieldKind } from '../../domain/models/types';
import { NormalizedPivotConfig } from '../../domain/models/NormalizedPivotConfig';
import { usePivotStore, usePivotInstanceKey, PivotStoreContext, createPivotStore } from '../../application/state/store';
import { usePivotHandlers } from '../../application/hooks/usePivotHandlers';
import { PivotQueryProgress } from './PivotQueryProgress';
import FieldOptionsContainer from '../sidebar/field-options/FieldOptionsContainer';
import { PivotMainPanel } from './PivotMainPanel';
import { createLogger } from '../../application/utils/logger';

const logger = createLogger('Pivot');

// Notification levels with consistent colors
const notificationLevels = {
  info: { background: '#6b7280', color: '#ffffff' },      // grey
  warning: { background: '#f5a623', color: '#1a1a1a' },   // yellow
  error: { background: '#ef4444', color: '#ffffff' },     // red
  success: { background: '#10b981', color: '#ffffff' }    // green
};

const getNotificationStyle = (level = 'info') => ({
  position: 'absolute',
  top: '20px',
  left: '50%',
  transform: 'translateX(-50%)',
  ...notificationLevels[level],
  padding: '12px 24px',
  borderRadius: 'var(--radius-md)',
  fontWeight: 500,
  fontSize: '14px',
  zIndex: 'var(--z-dropdown)',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  pointerEvents: 'none'
});

/**
 * PivotInner - Internal component with all pivot logic
 * Must be wrapped with PivotStoreContext.Provider
 * Contains all hooks, effects, and rendering logic
 */
const PivotInner = forwardRef(({ config: pivotConfig = {} }: { config?: PivotConfig }, ref) => {
  // Normalize config with defaults (useMemo because it's derived from props, not internal state)
  const cfg = useMemo(() => new NormalizedPivotConfig(pivotConfig), [pivotConfig]);
  // Hosts often pass an inline config object, so `cfg` changes on every parent
  // render. Effects that must not re-run then (init, callbacks) read it from here.
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  // initialConfig is applied when its content differs from the last one applied,
  // so an equal object re-created on every render leaves the user's edits alone.
  const appliedInitialConfigRef = useRef<string | null>(null);
  const initialConfigKey = useMemo(() => JSON.stringify(cfg.getPivotTableConfig()), [pivotConfig.initialConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  // ==================== ZUSTAND STATE ====================
  // Get instance key from context
  const instanceKey = usePivotInstanceKey();
  const storeApi = useContext(PivotStoreContext)!.store;

  // Get state from store
  const config = usePivotStore((s) => s.config);
  const executionConfig = usePivotStore((s) => s.executionConfig);
  const availableFields = usePivotStore((s) => s.availableFields);
  const detectedTypes = usePivotStore((s) => s.detectedTypes);
  const dataHash = usePivotStore((s) => s.dataHash);

  const dataLoading = usePivotStore((s) => s.dataLoading);
  const initComplete = usePivotStore((s) => s.initComplete);
  const sidebarCollapsed = usePivotStore((s) => s.sidebarCollapsed);
  const activeView = usePivotStore((s) => s.activeView);
  const secondaryDisplayMode = usePivotStore((s) => s.secondaryDisplayMode);
  const showChartDialog = usePivotStore((s) => s.showChartDialog);
  const chartConfig = usePivotStore((s) => s.chartConfig);
  const sortConfig = usePivotStore((s) => s.sortConfig);
  const sqlHistory = usePivotStore((s) => s.sqlHistory);

  // Get state from store (UI preferences)
  const autoUpdate = usePivotStore((s) => s.autoUpdate);

  // Get actions from store
  const setConfig = usePivotStore((s) => s.setConfig);
  const updateConfig = usePivotStore((s) => s.updateConfig);
  const commitConfig = usePivotStore((s) => s.commitConfig);
  const setAvailableFields = usePivotStore((s) => s.setAvailableFields);
  const setDetectedTypes = usePivotStore((s) => s.setDetectedTypes);
  const setDialect = usePivotStore((s) => s.setDialect);
  const setInitComplete = usePivotStore((s) => s.setInitComplete);
  const setDataLoading = usePivotStore((s) => s.setDataLoading);
  const setSidebarCollapsed = usePivotStore((s) => s.setSidebarCollapsed);
  const setActiveView = usePivotStore((s) => s.setActiveView);
  const setSecondaryDisplayMode = usePivotStore((s) => s.setSecondaryDisplayMode);
  const setShowChartDialog = usePivotStore((s) => s.showChartDialog ? s.closeChartDialog : s.openChartDialog);
  const openChartDialog = usePivotStore((s) => s.openChartDialog);
  const closeChartDialog = usePivotStore((s) => s.closeChartDialog);
  const setChartConfig = usePivotStore((s) => s.setChartConfig);
  const setSortConfig = usePivotStore((s) => s.setSort);
  const setAutoUpdate = usePivotStore((s) => s.setAutoUpdate);
  const toggleSidebar = usePivotStore((s) => s.toggleSidebar);

  // Step 0: Component renders immediately with empty field options
  // No early config loading - let skeleton render first

  // Initialize autoUpdate from config (only once on mount)
  useEffect(() => {
    setAutoUpdate(cfg.autoUpdate);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Data engine instances
  // queryEngine: Used for CUBE queries (can be RemoteDataEngine)
  // dataEngine: Used for loading sample data (DuckDB for Arrow bytes)
  // Use useMemo so engines update when config changes
  const queryEngine = useMemo(() => cfg.dataEngine, [cfg.dataEngine]);
  const dataEngine = useMemo(() => {
    if (cfg.duckdb) return new DuckDBWASMEngine(cfg.duckdb);
    return cfg.dataEngine;
  }, [cfg.duckdb, cfg.dataEngine]);

  // Dispose of engines constructed by this component (cfg.duckdb was
  // provided, so the memo above built a fresh DuckDBWASMEngine) when
  // superseded by a new engine or on unmount. An externally-supplied
  // cfg.dataEngine is owned by the caller and must not be closed here.
  useEffect(() => {
    const engineToDispose = dataEngine;
    const ownsEngine = !!cfg.duckdb;
    return () => {
      if (ownsEngine && engineToDispose && typeof engineToDispose.close === 'function') {
        engineToDispose.close().catch(() => {});
      }
    };
  }, [dataEngine, cfg.duckdb]);

  // Subscribe to query execution from engine
  const queryProgress = useQueryProgress(queryEngine || dataEngine);

  // Detect if using remote connection (use cfg.mode, not class name which is minified in prod)
  const isRemoteConnection = cfg.mode === 'remote';

  // Custom hooks
  const splitPane = useSplitPane(activeView, secondaryDisplayMode);
  const snapshots = useSnapshots(cfg.snapshotStore);
  // Pivot calculation - executes queries
  const dataVersion = usePivotStore((s) => s.dataVersion);
  // The engine and dataset of the last completed init: a new one re-runs the committed config.
  const readyDataRef = useRef<{ engine: unknown; dataHash: string | null } | null>(null);
  const calculation = usePivotCalculation({
    executionConfig,
    dataVersion,
    engine: queryEngine || dataEngine,
    isRemoteMode: isRemoteConnection,
    onExecutionComplete: (executedCfg, cubeResults) => {
      commitConfig();
    }
  });

  // Pivot display - transforms queryResult into pivot table
  const displayData = usePivotDisplay(
    calculation.queryResult,
    executionConfig,
    calculation.enrichedValues,
    sortConfig
  );

  const drilldown = useDrilldown(
    queryEngine,
    dataEngine,
    detectedTypes,
    cfg.drilldownTimeout,
    availableFields,
    config.customGroupings || [],
    config.customFilters || []
  );
  const sqlPlayground = useSQLPlayground(dataEngine);

  // Pivot handlers - extracted into custom hook
  const handlers = usePivotHandlers({
    calculation,
    displayData,
    dialect: dataEngine?.getDialect() ?? null,
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
  });

  // Dev mode - expose debugging utilities
  useDevMode({
    enabled: cfg.devMode || false,
    dataEngine: queryEngine || dataEngine,
    config: config,
    cubeResults: calculation.queryResult?.cubeResults,
    dtypes: calculation.queryResult?.dtypes,
    sqlHistory: sqlHistory,
    displayData: displayData,
    chartConfig: chartConfig
  });

  // Initialize profiler based on settings
  useEffect(() => {
    const shouldProfile = cfg.enableProfiling ?? cfg.devMode ?? false;
    if (shouldProfile) {
      profiler.enable();
    } else {
      profiler.disable();
    }

    if (cfg.verboseProfiling) {
      profiler.setVerbose(true);
    } else {
      profiler.setVerbose(false);
    }
  }, [cfg.enableProfiling, cfg.devMode, cfg.verboseProfiling]);

  // Notify parent of config changes
  useEffect(() => {
    cfgRef.current.onConfigChange?.(config);
  }, [config]);

  // Auto-commit config to executionConfig when autoUpdate is enabled
  // Only commit if initialization is complete (guards execution boundary)
  useEffect(() => {
    logger.debug('Auto-commit check', { autoUpdate, initComplete, hasConfig: !!config });
    if (!autoUpdate) {
      logger.debug('Auto-commit skipped: autoUpdate is false');
      return;
    }
    if (!initComplete) {
      logger.debug('Auto-commit skipped: initComplete is false');
      return;
    }
    if (!config) {
      logger.debug('Auto-commit skipped: config is null');
      return;
    }

    // Check if any filter is incomplete (no value selected yet)
    // This prevents triggering a query while user is still configuring a filter
    // Custom filters (isCustom: true) are always complete - their formula IS the filter
    const hasIncompleteFilter = (config.filters || []).some(f => {
      // Custom filters are always complete
      if (f.isCustom || f.type === 'custom_filter') return false;

      const hasValue = f.value !== undefined && f.value !== null && f.value !== '';
      const hasSelectedValues = f.selectedValues && f.selectedValues.length > 0;
      const hasBetweenValues = f.betweenStart !== undefined || f.betweenEnd !== undefined;
      return !hasValue && !hasSelectedValues && !hasBetweenValues;
    });

    if (hasIncompleteFilter) {
      logger.debug('Auto-commit skipped: incomplete filter (awaiting user selection)');
      return;
    }

    logger.debug('Auto-committing config to executionConfig', config);
    commitConfig();
  }, [config, autoUpdate, initComplete, commitConfig]);

  // Debug information available via React DevTools

  // Get loadData action from store
  const loadDataAction = usePivotStore((s) => s.loadData);

  // Extract setError from calculation to avoid dependency on entire calculation object
  const setCalculationError = calculation.setError;

  function applyInitialConfig() {
    const initialConfig = cfgRef.current.getPivotTableConfig();
    const key = JSON.stringify(initialConfig);
    if (!initialConfig || key === appliedInitialConfigRef.current) return;
    appliedInitialConfigRef.current = key;
    setConfig(initialConfig);
  }

  // A new initialConfig after init loads that view.
  useEffect(() => {
    if (initComplete) applyInitialConfig();
  }, [initialConfigKey, initComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize engine based on mode
  // Initialization sequence:
  // 0) Display empty app skeleton (component already rendered)
  // 1) Load data (local) or connect to remote
  // 2) Get base fields from schema
  // 3) Apply config (custom metrics validated against base fields)
  // 4) Set initComplete = true → queries can execute
  useEffect(() => {
    const cfg = cfgRef.current;

    function markReady() {
      const ready = { engine: queryEngine || dataEngine, dataHash: storeApi.getState().dataHash };
      const dataChanged = ready.engine !== readyDataRef.current?.engine || ready.dataHash !== readyDataRef.current?.dataHash;
      readyDataRef.current = ready;
      setInitComplete(true, dataChanged);
    }

    async function _initLocalMode() {
      logger.debug('Starting local mode initialization', {
        hasData: !!cfg.data,
        hasDataEngine: !!dataEngine,
        dataSize: (cfg.data && typeof cfg.data === 'object' && 'length' in cfg.data) ? (cfg.data as { length: number }).length : 0,
        instanceKey
      });

      try {
        // Step 1-2: loadData handles:
        // - Loads data into DuckDB (creates table)
        // - Gets schema and detects types
        // - Sets availableFields, detectedTypes, derivedFieldsMap
        // - Does NOT set initComplete (we do that after config is applied)
        logger.debug('Loading data into DuckDB');
        await loadDataAction(cfg.data, dataEngine);
        logger.debug('Data loaded successfully');

        // Step 3: Apply config now that base fields are available
        applyInitialConfig();

        // Step 4: Ready to execute queries (fields + config loaded)
        markReady();
      } catch (err: any) {
        logger.error('Error during initialization', { error: err.message });
        setCalculationError?.(err.message);
        setInitComplete(false);
      }
    }

    async function _initRemoteMode() {
      logger.debug('Starting remote mode initialization', {
        hasQueryEngine: !!queryEngine,
        queryEngineType: queryEngine?.constructor?.name,
        instanceKey
      });

      try {
        // Step 1-2: Get fields and types from remote engine
        let fields = await Promise.resolve(queryEngine.getAvailableFields?.());
        let types = await Promise.resolve(queryEngine.getDetectedTypes?.());

        if ((!fields || !types) && typeof queryEngine.getSchema === 'function') {
          await queryEngine.getSchema('pivot_data');
          fields = await Promise.resolve(queryEngine.getAvailableFields?.());
          types = await Promise.resolve(queryEngine.getDetectedTypes?.());
        }

        logger.debug('Retrieved schema from engine', {
          fieldsCount: fields?.length,
          typesCount: types ? Object.keys(types).length : 0,
          hasFields: !!fields,
          hasTypes: !!types,
          fields: fields?.map(f => f.name),
          types
        });

        if (fields && types) {
          logger.debug('Schema valid, setting up fields');
          setAvailableFields(fields);
          setDetectedTypes(types);
          // Set dialect from queryEngine for remote mode
          const dialect = queryEngine.getDialect?.();
          if (dialect) {
            setDialect(dialect);
          }
          setDataLoading(false);

          // derivedFieldsMap is now computed automatically from availableFields via useMemo

          // Step 3: Apply config now that base fields are available
          applyInitialConfig();

          // Step 4: Ready to execute queries
          markReady();
        } else {
          logger.warn('Missing fields or types - NOT setting initComplete', {
            hasFields: !!fields,
            hasTypes: !!types
          });
        }
      } catch (err: any) {
        logger.error('Error during initialization', { error: err.message });
        setCalculationError?.(err.message);
        setInitComplete(false);
      }
    }

    logger.debug('Initialization effect triggered', {
      hasData: !!cfg.data,
      hasDataEngine: !!dataEngine,
      hasQueryEngine: !!queryEngine,
      mode: cfg.data ? 'local' : 'remote'
    });

    if (cfg.data && dataEngine) {
      _initLocalMode();
    } else if (queryEngine) {
      void _initRemoteMode();
    } else {
      logger.warn('No initialization path - missing engines');
    }
  }, [cfg.data, dataEngine, queryEngine, storeApi, loadDataAction, setAvailableFields, setDetectedTypes, setDialect, setDataLoading, setInitComplete, setCalculationError, setConfig]);


  // Chart gracefully handles config changes via error handling in ChartView

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    exportConfig: () => ({
      config,
      availableFields,
      detectedTypes
    }),

    calculatePivot: calculation.calculatePivot,

    getDataEngine: () => queryEngine || dataEngine,

    downloadTestFixture: handlers.handleDownloadTestFixtureZip
  }));

  return (
    <ErrorBoundary>
    <div className="pp-root" style={styles.container}>
      {/* Global Query Progress Overlay */}
      <PivotQueryProgress
        queryProgress={queryProgress}
        pivotTimeout={cfg.pivotTimeout}
        uniqueValuesTimeout={cfg.uniqueValuesTimeout}
        drilldownTimeout={cfg.drilldownTimeout}
        canCancel={!!(queryEngine && typeof queryEngine.canCancel === 'function' && queryEngine.canCancel())}
        onCancel={() => {
          if (queryEngine && typeof queryEngine.cancelCurrentQuery === 'function') {
            queryEngine.cancelCurrentQuery();
          }
        }}
      />

      {/* Sidebar */}
      <FieldOptionsContainer
        sqlHistory={sqlHistory}
        dataEngine={queryEngine || dataEngine}
        isRemoteConnection={isRemoteConnection}
        snapshots={snapshots.snapshots}
        snapshotsError={snapshots.error}
        onManualUpdate={(previewMode) => {
          if (previewMode) {
            // Preview mode: generate SQL from current config without executing
            return calculation.calculatePivot(true, config);
          }
          commitConfig();
          return Promise.resolve();
        }}
        onFieldsChanged={setAvailableFields}
        onAutoUpdateChange={setAutoUpdate}
        onToggleCollapse={toggleSidebar}
        onCreateSnapshot={handlers.handleCreateSnapshot}
        onLoadSnapshot={handlers.handleLoadSnapshot}
        onDeleteSnapshot={handlers.handleDeleteSnapshot}
        onSnapshotsImported={snapshots.importSnapshots}
      />

      {/* Main Panel */}
      <PivotMainPanel
        calculation={calculation}
        displayData={displayData}
        executionConfig={executionConfig}
        drilldown={drilldown}
        sqlPlayground={sqlPlayground}
        splitPane={splitPane}
        dataEngine={dataEngine}
        locale={cfg.locale}
        enableSQLPlayground={cfg.enableSQLPlayground}
        isRemoteConnection={isRemoteConnection}
        handlers={handlers}
      />
    </div>
    </ErrorBoundary>
  );
});

PivotInner.displayName = 'PivotInner';

/**
 * Pivot - Wrapper component that provides store context
 *
 * Creates an isolated store instance for this pivot and provides it via context.
 * This enables multiple pivot instances to coexist without state conflicts.
 *
 * @example
 * ```tsx
 * <Pivot config={{
 *   instanceKey: 'sales_pivot',  // Unique key for this instance
 *   dataEngine: myEngine,
 *   data: myData,
 *   initialConfig: { rows: ['Category'], columns: ['Year'], values: [...] },
 *   settings: { autoUpdate: true, locale: 'en-US' },
 *   callbacks: { onConfigChange: (cfg) => console.log(cfg) }
 * }} />
 * ```
 */
const Pivot = forwardRef(({ config: pivotConfig = {}, children }: { config?: PivotConfig; children?: React.ReactNode }, ref) => {
  const instanceKey = pivotConfig.instanceKey || 'default';

  // Create store once on mount - each Pivot instance gets its own independent store
  // useRef ensures the store persists across re-renders
  // instanceKey is used for localStorage, query locks, and DevTools naming
  const storeRef = useRef<ReturnType<typeof createPivotStore>>();
  const instanceKeyRef = useRef<string>(instanceKey);

  // Create store on first render or if instanceKey changes
  if (!storeRef.current || instanceKeyRef.current !== instanceKey) {
    if (storeRef.current && instanceKeyRef.current !== instanceKey) {
      logger.warn(
        `instanceKey changed from '${instanceKeyRef.current}' to '${instanceKey}'. ` +
        `Creating new store. Consider using React's key prop to force remount instead.`
      );
    }
    logger.info('Creating Zustand store', { instanceKey });
    storeRef.current = createPivotStore(instanceKey);
    instanceKeyRef.current = instanceKey;
  }

  return (
    <PivotStoreContext.Provider value={{ store: storeRef.current, instanceKey, locale: pivotConfig.settings?.locale }}>
      <PivotInner config={pivotConfig} ref={ref} />
      {children}
    </PivotStoreContext.Provider>
  );
});

Pivot.displayName = 'Pivot';

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    height: '100%',
    width: '100%',
    background: 'var(--surface-bg, #ffffff)',
    overflow: 'hidden',
    border: 'var(--border-width, 1px) solid var(--border-color-light, #e5e7eb)'
  },
  sidebar: {
    background: '#ffffff',
    borderRight: 'var(--border-width, 1px) solid var(--border-color-medium, #d1d5db)',
    display: 'flex',
    flexDirection: 'column'
  },
  mainPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
    background: '#ffffff'
  },
  toggleButton: {
    position: 'absolute',
    top: '8px',
    left: '8px',
    zIndex: 100,
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#6b7280',
    transition: 'all 0.2s',
    padding: 0
  },
  displayPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: '#ffffff',
    overflow: 'auto'
  },
  error: {
    background: '#fee2e2',
    border: '1px solid #fecaca',
    borderRadius: '8px',
    padding: '0.75rem',
    fontSize: '0.9rem',
    color: '#b91c1c'
  },
  loading: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6b7280',
    fontSize: '1rem'
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6b7280',
    textAlign: 'center'
  },
  emptyIcon: {
    fontSize: '3rem',
    marginBottom: '1rem',
    opacity: 0.5
  },
  emptyText: {
    fontSize: '1rem',
    fontWeight: 500
  },
  divider: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
    userSelect: 'none',
    position: 'relative'
  },
  dividerHandle: {
    backgroundColor: '#9ca3af',
    borderRadius: '2px',
    position: 'absolute'
  }
};

export { Pivot };
export type { PivotConfig, PivotTableConfig, PivotUISettings, PivotEngineSettings, PivotCallbacks } from '../../domain/models/types';
