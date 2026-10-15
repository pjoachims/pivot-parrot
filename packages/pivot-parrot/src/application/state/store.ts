import { createContext, useContext } from 'react';
import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import type { PivotTableConfig, Filter, CustomMetric, CustomFilter, CustomGrouping, PrimitiveValue, DrilldownRow, DimensionFilters, SavedViewStates, DerivedField } from '../../domain/models/types';
import { FieldKind } from '../../domain/models/types';
import type { FieldItem } from '../../domain/field/FieldItem';
import type { DataEngine } from '../../infrastructure/data-engines/DataEngine';
import { hashData } from '../../domain/query/utils/cache';
import {
  buildHandleDrop,
  buildHandleApplyFilter,
  buildHandleRemoveFilter,
  buildHandleCreateExpression,
  buildChangeAggregation,
  buildHandleAddDerivedFields,
  buildDeleteCustomExpression,
  buildRemoveFieldFromAllZones
} from './actions';
import { autoManageValuesField } from '../../application/utils/fieldUtils';
import { getFieldById } from '../../application/utils/getFieldById';

export interface SortConfig {
  valueKey: string | null;
  direction: 'asc' | 'desc';
}

export interface ChartConfig {
  type: 'bar' | 'line' | 'scatter' | 'treemap' | 'bar-line';
  xAxis?: string;
  yAxis?: string;
  groupBy?: string;
  _updateKey?: number;
  // ... other chart properties
}

interface PivotStore {
  // ==================== Config State ====================
  config: PivotTableConfig;
  executionConfig: PivotTableConfig | null;

  // ==================== Data State ====================
  dataHash: string | null;
  dataLoading: boolean;
  initComplete: boolean;
  availableFields: FieldItem[];
  detectedTypes: Record<string, string | number>;
  uniqueValuesCache: Record<string, (string | number | boolean | null)[]>;
  dialect: any | null;

  // ==================== Display State ====================
  sortConfig: SortConfig;
  chartConfig: ChartConfig | null;

  // ==================== UI State ====================
  sidebarCollapsed: boolean;
  activeView: 'chart' | 'drilldown' | 'sql' | null;
  secondaryDisplayMode: 'hidden' | 'full' | 'split-below' | 'split-right';
  showChartDialog: boolean;
  showSQLTooltip: boolean;
  autoUpdate: boolean;

  // Field Options UI State
  searchQuery: string;
  dragOverZone: string | null;
  insertionIndex: number | null;
  showSnapshots: boolean;
  showSqlDialog: boolean;

  // Dialog States
  expressionDialog: {
    type: 'metric' | 'filter' | 'grouping';
    editing: CustomMetric | CustomFilter | CustomGrouping | null;
  } | null;
  derivedFieldDialog: {
    fieldName: string;
    fieldType: string;
    existingDerivedFields: string[];
    position?: { x: number; y: number };
  } | null;
  filterDialog: {
    field: FieldItem;
    existingFilter: Filter | null;
    anchorEl: HTMLElement;
  } | null;
  havingFilterDialog: {
    field: { name: string };
    existingFilter: Filter | null;
    anchorEl: HTMLElement;
  } | null;
  pendingFilterOpen: { fieldName: string; type: 'filter' | 'having' } | null;
  snapshotNameDialog: boolean;

  // ==================== Split Pane State ====================
  splitPosition: number;
  isDragging: boolean;
  savedViewStates: SavedViewStates;

  // ==================== SQL Playground State ====================
  sqlQuery: string;

  // ==================== Drilldown State ====================
  drilldownData: DrilldownRow[] | null;
  drilldownFilters: DimensionFilters | null;
  drilldownSQL: string | null;
  drilldownSelectedColumns: Record<string, boolean>;

  // ==================== Query Progress State ====================
  queryProgress: {
    sql?: string;
    elapsed: number;
    type: 'pivot' | 'uniqueValues' | 'drilldown' | 'query';
  } | null;

  // ==================== SQL History State ====================
  sqlHistory: Array<{
    timestamp: string;
    sql: string;
    queryType?: string;
    sampleRows?: Record<string, PrimitiveValue>[];
    dtypes?: Record<string, string>;
    rowCount?: number;
  }>;

  // ==================== Config Actions ====================
  setConfig: (config: PivotTableConfig) => void;
  updateConfig: (partial: Partial<PivotTableConfig>) => void;
  commitConfig: () => void;
  resetConfig: () => void;

  // ==================== Data Actions ====================
  setDataLoading: (loading: boolean) => void;
  setInitComplete: (complete: boolean) => void;
  setDataLoaded: (data: {
    hash: string;
    fields: FieldItem[];
    types: Record<string, string | number>;
  }) => void;
  setAvailableFields: (fields: FieldItem[]) => void;
  setDetectedTypes: (types: Record<string, string | number>) => void;
  setDialect: (dialect: any) => void;
  cacheUniqueValues: (field: string, values: (string | number | boolean | null)[]) => void;
  clearUniqueValuesCache: () => void;

  // ==================== Display Actions ====================
  setSort: (sort: SortConfig) => void;
  setChartConfig: (config: ChartConfig | null) => void;

  // ==================== UI Actions ====================
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setActiveView: (view: 'chart' | 'drilldown' | 'sql' | null) => void;
  setSecondaryDisplayMode: (mode: 'hidden' | 'full' | 'split-below' | 'split-right') => void;
  openChartDialog: () => void;
  closeChartDialog: () => void;
  setAutoUpdate: (autoUpdate: boolean) => void;
  setShowSQLTooltip: (show: boolean) => void;

  // Field Options UI Actions
  setSearchQuery: (query: string) => void;
  setDragOverZone: (zone: string | null) => void;
  setInsertionIndex: (index: number | null) => void;
  setShowSnapshots: (show: boolean) => void;
  setShowSqlDialog: (show: boolean) => void;

  // Dialog Actions
  setExpressionDialog: (dialog: PivotStore['expressionDialog']) => void;
  setDerivedFieldDialog: (dialog: PivotStore['derivedFieldDialog']) => void;
  setFilterDialog: (dialog: PivotStore['filterDialog']) => void;
  setHavingFilterDialog: (dialog: PivotStore['havingFilterDialog']) => void;
  setPendingFilterOpen: (pending: PivotStore['pendingFilterOpen']) => void;
  setSnapshotNameDialog: (show: boolean) => void;

  // ==================== Split Pane Actions ====================
  setSplitPosition: (position: number) => void;
  setIsDragging: (isDragging: boolean) => void;
  setSavedViewStates: (states: SavedViewStates) => void;
  updateSavedViewState: (view: 'chart' | 'drilldown' | 'sql', state: { mode: 'hidden' | 'full' | 'split-below' | 'split-right'; position: number }) => void;

  // ==================== SQL Playground Actions ====================
  setSQLQuery: (query: string) => void;

  // ==================== Drilldown Actions ====================
  setDrilldownData: (data: DrilldownRow[] | null) => void;
  setDrilldownFilters: (filters: DimensionFilters | null) => void;
  setDrilldownSQL: (sql: string | null) => void;
  setDrilldownSelectedColumns: (columns: Record<string, boolean>) => void;
  clearDrilldown: () => void;

  // ==================== Query Progress Actions ====================
  setQueryProgress: (progress: { sql?: string; elapsed: number; type: 'pivot' | 'uniqueValues' | 'drilldown' | 'query' } | null) => void;

  // ==================== SQL History Actions ====================
  addToSqlHistory: (sql: string, queryType?: string, sampleRows?: Record<string, PrimitiveValue>[], dtypes?: Record<string, string>, rowCount?: number) => void;
  clearSqlHistory: () => void;

  // ==================== Field Options Actions ====================
  handleDrop: (fieldName: string, sourceZone: string, targetZone: string | null, index?: number | null, sourceIndex?: number | null) => void;
  handleApplyFilter: (filter: any) => void;
  handleRemoveFilter: (fieldName: string) => void;
  handleCreateExpression: (data: { name: string; formula: string; format?: string }, type: string, editingId?: string) => string | null;
  changeAggregation: (index: number, aggregation: string) => void;
  handleAddDerivedFields: (sourceField: string, fields: any[]) => void;
  deleteCustomExpression: (expressionId: string, type: 'metric' | 'filter' | 'grouping') => void;
  removeFieldFromAllZones: (fieldId: string) => void;

  // Query-like actions (REST-style GETs)
  getFieldById: (fieldId: string, config?: PivotTableConfig) => FieldItem | null;

  // ==================== Complex Actions ====================
  loadData: (data: unknown, dataEngine: DataEngine) => Promise<void>;
  reset: () => void;
}

const defaultConfig: PivotTableConfig = {
  filters: [],
  rows: [],
  columns: [],
  values: [],
  customMetrics: [],
  customFilters: [],
  customGroupings: []
};

const initialState = {
  // Config
  config: defaultConfig,
  executionConfig: null,

  // Data
  dataHash: null,
  dataLoading: false,
  initComplete: false,
  availableFields: [],
  detectedTypes: {},
  uniqueValuesCache: {},
  dialect: null,

  // Display
  sortConfig: { valueKey: null, direction: 'desc' as const },
  chartConfig: null,

  // UI
  sidebarCollapsed: false,
  activeView: null,
  secondaryDisplayMode: 'split-below' as const,
  showChartDialog: false,
  showSQLTooltip: false,
  autoUpdate: true,

  // Field Options UI
  searchQuery: '',
  dragOverZone: null,
  insertionIndex: null,
  showSnapshots: false,
  showSqlDialog: false,

  // Dialogs
  expressionDialog: null,
  derivedFieldDialog: null,
  filterDialog: null,
  havingFilterDialog: null,
  pendingFilterOpen: null,
  snapshotNameDialog: false,

  // Split Pane
  splitPosition: 50,
  isDragging: false,
  savedViewStates: {
    chart: { mode: 'split-right' as const, position: 50 },
    drilldown: { mode: 'split-below' as const, position: 60 },
    sql: { mode: 'split-below' as const, position: 60 }
  },

  // SQL Playground
  sqlQuery: '',

  // Drilldown
  drilldownData: null,
  drilldownFilters: null,
  drilldownSQL: null,
  drilldownSelectedColumns: {},

  // Query Progress
  queryProgress: null,

  // SQL History
  sqlHistory: []
};

// ==================== MULTI-INSTANCE SUPPORT ====================

/**
 * Context value holds both the store instance and the instanceKey
 * This allows components to access both the store and the key for other operations
 */
type PivotContextValue = {
  store: {
    <T>(selector: (state: PivotStore) => T): T;
    (): PivotStore;
    getState: () => PivotStore;
    setState: (partial: Partial<PivotStore> | ((state: PivotStore) => Partial<PivotStore>)) => void;
    subscribe: (listener: (state: PivotStore) => void) => () => void;
  };
  instanceKey: string;
  locale?: string;
};

/**
 * React Context to provide store instance and instanceKey to all components
 * Standard Zustand pattern for multi-instance support
 */
export const PivotStoreContext = createContext<PivotContextValue | null>(null);

/**
 * Factory function to create a new pivot store instance
 * Each Pivot component gets its own independent store
 * @param instanceKey - Unique key for this instance (used for localStorage, query locks, and DevTools naming)
 */
export function createPivotStore(instanceKey: string = 'default') {
  const isDev = typeof process !== 'undefined' && process.env.NODE_ENV === 'development';

  return create<PivotStore>()(
    devtools(
      persist(
        (set, get) => ({
      ...initialState,

      // ==================== Config Actions ====================
      setConfig: (config) =>
        set({ config: autoManageValuesField(config) }, false, 'setConfig'),

      updateConfig: (partial) =>
        set(
          (state) => ({
            config: autoManageValuesField({ ...state.config, ...partial })
          }),
          false,
          'updateConfig'
        ),

      commitConfig: () =>
        set(
          (state) => ({ executionConfig: state.config }),
          false,
          'commitConfig'
        ),

      resetConfig: () =>
        set({ config: defaultConfig, executionConfig: null }, false, 'resetConfig'),

      // ==================== Data Actions ====================
      setDataLoading: (loading) =>
        set({ dataLoading: loading }, false, 'setDataLoading'),

      setInitComplete: (complete) =>
        set({ initComplete: complete }, false, 'setInitComplete'),

      setDataLoaded: ({ hash, fields, types }) =>
        set(
          {
            dataHash: hash,
            dataLoading: false,
            availableFields: fields,
            detectedTypes: types
          },
          false,
          'setDataLoaded'
        ),

      setAvailableFields: (fields) =>
        set({ availableFields: fields }, false, 'setAvailableFields'),

      setDetectedTypes: (types) =>
        set({ detectedTypes: types }, false, 'setDetectedTypes'),

      setDialect: (dialect) =>
        set({ dialect }, false, 'setDialect'),

      cacheUniqueValues: (field, values) =>
        set(
          (state) => ({
            uniqueValuesCache: {
              ...state.uniqueValuesCache,
              [field]: values
            }
          }),
          false,
          'cacheUniqueValues'
        ),

      clearUniqueValuesCache: () =>
        set({ uniqueValuesCache: {} }, false, 'clearUniqueValuesCache'),

      // ==================== Display Actions ====================
      setSort: (sortConfig) =>
        set({ sortConfig }, false, 'setSort'),

      setChartConfig: (chartConfig) =>
        set({ chartConfig }, false, 'setChartConfig'),

      // ==================== UI Actions ====================
      toggleSidebar: () =>
        set(
          (state) => ({ sidebarCollapsed: !state.sidebarCollapsed }),
          false,
          'toggleSidebar'
        ),

      setSidebarCollapsed: (collapsed) =>
        set({ sidebarCollapsed: collapsed }, false, 'setSidebarCollapsed'),

      setActiveView: (view) =>
        set({ activeView: view }, false, 'setActiveView'),

      setSecondaryDisplayMode: (mode) =>
        set({ secondaryDisplayMode: mode }, false, 'setSecondaryDisplayMode'),

      openChartDialog: () =>
        set({ showChartDialog: true }, false, 'openChartDialog'),

      closeChartDialog: () =>
        set({ showChartDialog: false }, false, 'closeChartDialog'),

      setShowSQLTooltip: (show) =>
        set({ showSQLTooltip: show }, false, 'setShowSQLTooltip'),

      setAutoUpdate: (autoUpdate) =>
        set({ autoUpdate }, false, 'setAutoUpdate'),

      // Field Options UI Actions
      setSearchQuery: (query) =>
        set({ searchQuery: query }, false, 'setSearchQuery'),

      setDragOverZone: (zone) =>
        set({ dragOverZone: zone }, false, 'setDragOverZone'),

      setInsertionIndex: (index) =>
        set({ insertionIndex: index }, false, 'setInsertionIndex'),

      setShowSnapshots: (show) =>
        set({ showSnapshots: show }, false, 'setShowSnapshots'),

      setShowSqlDialog: (show) =>
        set({ showSqlDialog: show }, false, 'setShowSqlDialog'),

      // Dialog Actions
      setExpressionDialog: (dialog) =>
        set({ expressionDialog: dialog }, false, 'setExpressionDialog'),

      setDerivedFieldDialog: (dialog) =>
        set({ derivedFieldDialog: dialog }, false, 'setDerivedFieldDialog'),

      setFilterDialog: (dialog) =>
        set({ filterDialog: dialog }, false, 'setFilterDialog'),

      setHavingFilterDialog: (dialog) =>
        set({ havingFilterDialog: dialog }, false, 'setHavingFilterDialog'),

      setPendingFilterOpen: (pending) =>
        set({ pendingFilterOpen: pending }, false, 'setPendingFilterOpen'),

      setSnapshotNameDialog: (show) =>
        set({ snapshotNameDialog: show }, false, 'setSnapshotNameDialog'),

      // ==================== Split Pane Actions ====================
      setSplitPosition: (position) =>
        set({ splitPosition: position }, false, 'setSplitPosition'),

      setIsDragging: (isDragging) =>
        set({ isDragging }, false, 'setIsDragging'),

      setSavedViewStates: (states) =>
        set({ savedViewStates: states }, false, 'setSavedViewStates'),

      updateSavedViewState: (view, state) =>
        set(
          (s) => ({
            savedViewStates: {
              ...s.savedViewStates,
              [view]: state
            }
          }),
          false,
          'updateSavedViewState'
        ),

      // ==================== SQL Playground Actions ====================
      setSQLQuery: (query) =>
        set({ sqlQuery: query }, false, 'setSQLQuery'),

      // ==================== Drilldown Actions ====================
      setDrilldownData: (data) =>
        set({ drilldownData: data }, false, 'setDrilldownData'),

      setDrilldownFilters: (filters) =>
        set({ drilldownFilters: filters }, false, 'setDrilldownFilters'),

      setDrilldownSQL: (sql) =>
        set({ drilldownSQL: sql }, false, 'setDrilldownSQL'),

      setDrilldownSelectedColumns: (columns) =>
        set({ drilldownSelectedColumns: columns }, false, 'setDrilldownSelectedColumns'),

      clearDrilldown: () =>
        set(
          { drilldownData: null, drilldownFilters: null, drilldownSQL: null },
          false,
          'clearDrilldown'
        ),

      // ==================== Query Progress Actions ====================
      setQueryProgress: (progress) =>
        set({ queryProgress: progress }, false, 'setQueryProgress'),

      // ==================== SQL History Actions ====================
      addToSqlHistory: (sql, queryType = 'query', sampleRows, dtypes, rowCount) =>
        set(
          (state) => ({
            sqlHistory: [
              {
                timestamp: new Date().toISOString(),
                sql,
                queryType,
                sampleRows,
                dtypes,
                rowCount
              },
              ...state.sqlHistory
            ].slice(0, 20) // Keep last 20 entries
          }),
          false,
          'addToSqlHistory'
        ),

      clearSqlHistory: () =>
        set({ sqlHistory: [] }, false, 'clearSqlHistory'),

      // ==================== Field Options Actions ====================
      handleDrop: (fieldName, sourceZone, targetZone, index = null, sourceIndex = null) => {
        const state = get();
        const dropHandler = buildHandleDrop(state.config, state.availableFields, state.detectedTypes);
        const result = dropHandler(fieldName, sourceZone, targetZone, index, sourceIndex);

        const updates: Partial<PivotStore> = { config: result.config };

        // Signal the component layer to open the filter dialog after render
        if ((result.shouldOpenFilterDialog || result.shouldOpenHavingDialog) && result.fieldName) {
          updates.pendingFilterOpen = {
            fieldName: result.fieldName,
            type: result.shouldOpenHavingDialog ? 'having' : 'filter'
          };
        }

        set(updates, false, 'handleDrop');
      },

      handleApplyFilter: (filter) => {
        const state = get();
        const newConfig = buildHandleApplyFilter(state.config, filter);
        set({ config: newConfig }, false, 'handleApplyFilter');
      },

      handleRemoveFilter: (fieldName) => {
        const state = get();
        const newConfig = buildHandleRemoveFilter(state.config, fieldName);
        set({ config: newConfig }, false, 'handleRemoveFilter');
      },

      handleCreateExpression: (data, type, editingId) => {
        const state = get();
        // derivedFieldsMap is empty since derived fields are already included in availableFields
        const result = buildHandleCreateExpression(
          state.config,
          state.availableFields,
          {},  // derivedFieldsMap - not needed as derived fields are in availableFields
          data,
          type,
          editingId
        );

        if (editingId) {
          set({ config: result }, false, 'handleCreateExpression:update');
          return null;
        } else {
          set({ config: result.config }, false, 'handleCreateExpression:create');
          return result.newExpressionId;
        }
      },

      changeAggregation: (index, aggregation) => {
        const state = get();
        const newConfig = buildChangeAggregation(state.config, index, aggregation);
        set({ config: newConfig }, false, 'changeAggregation');
      },

      handleAddDerivedFields: (sourceField, fields) => {
        const state = get();

        // Create FieldItems for the new derived fields
        const newFieldItems = fields.map(field => ({
          id: field.id,
          name: field.label || field.id,
          dtype: field.derivation_type === 'time_bucket' ? 'timestamp' : 'int64',
          originalType: null,
          kind: FieldKind.DERIVED_FIELD,
          sourceField: sourceField,
          aggregation: null,
          formula: field.sql,
          format: null,
          derivation_type: field.derivation_type
        }));

        // Add to availableFields (avoid duplicates)
        const existingIds = new Set(state.availableFields.map(f => f.id));
        const fieldsToAdd = newFieldItems.filter(f => !existingIds.has(f.id));
        const newAvailableFields = [...state.availableFields, ...fieldsToAdd];

        set({
          availableFields: newAvailableFields
        }, false, 'handleAddDerivedFields');
      },

      deleteCustomExpression: (expressionId, type) => {
        const state = get();
        const newConfig = buildDeleteCustomExpression(state.config, expressionId, type);
        set({ config: newConfig }, false, 'deleteCustomExpression');
      },

      removeFieldFromAllZones: (fieldId) => {
        const state = get();
        const newConfig = buildRemoveFieldFromAllZones(state.config, fieldId);
        set({ config: newConfig }, false, 'removeFieldFromAllZones');
      },

      // Query-like actions (REST-style GETs)
      getFieldById: (fieldId, config) => {
        const state = get();
        // Use provided config or fall back to store's config
        const configToUse = config || state.config;
        return getFieldById(fieldId, state.availableFields, configToUse);
      },

      // ==================== Complex Actions ====================
      loadData: async (data: unknown, dataEngine: DataEngine) => {
        set({ dataLoading: true, initComplete: false }, false, 'loadData:start');

        try {
          // Check if data changed. The engine must ALSO confirm it holds this
          // dataset: stores are cached per instanceKey and outlive engines
          // (remount/HMR recreates the engine, disposal closes the old one),
          // so a store-only check can skip loading into a fresh, empty engine.
          const newDataHash = hashData(data);
          if (get().dataHash === newDataHash && dataEngine.loadedDataHash === newDataHash) {
            set({ dataLoading: false }, false, 'loadData:unchanged');
            // Don't set initComplete here - let caller set it after config is applied
            return;
          }

          // Initialize engine
          await dataEngine.init();

          // Load data based on type
          if (data instanceof Uint8Array) {
            // Raw Arrow IPC bytes (from Streamlit/Python)
            await dataEngine.loadArrowBytes(data, 'pivot_data');
          } else if (data && typeof data === 'object' && 'numRows' in data) {
            // Arrow Table object
            await dataEngine.loadArrow(data, 'pivot_data');
          } else if (typeof data === 'string') {
            // CSV string
            await dataEngine.loadCSV(data, 'pivot_data');
          } else if (data instanceof ArrayBuffer) {
            // CSV buffer
            await dataEngine.loadCSV(data as any, 'pivot_data');
          } else if (Array.isArray(data)) {
            // JSON array
            const { dataToCSV } = await import('../../domain/query/utils/csv');
            const csvText = dataToCSV(data);
            await dataEngine.loadCSV(csvText, 'pivot_data');
          }

          // Get available fields from engine (handles Arrow type mapping)
          const fieldItems = await dataEngine.getAvailableFields();
          const schema = await dataEngine.getSchema('pivot_data');
          const types = dataEngine.detectFieldTypes(schema);
          const dialect = dataEngine.getDialect();

          // Mark the engine as holding this dataset (see guard above)
          dataEngine.loadedDataHash = newDataHash;

          // Update all data state atomically
          // Note: Don't set initComplete here - caller will set it after applying config
          set(
            {
              dataHash: newDataHash,
              dataLoading: false,
              availableFields: fieldItems,
              detectedTypes: types,
              dialect
            },
            false,
            'loadData:complete'
          );
        } catch (error) {
          set({ dataLoading: false, initComplete: false }, false, 'loadData:error');
          throw error;
        }
      },

      reset: () =>
        set({ ...initialState }, false, 'reset')
      }),
      {
        name: `pivot-preferences-${instanceKey}`,
        storage: createJSONStorage(() => localStorage),
        // Only persist UI preferences, not data or calculations
        partialize: (state) => ({
          // Layout & UI preferences
          sidebarCollapsed: state.sidebarCollapsed,
          savedViewStates: state.savedViewStates,
          secondaryDisplayMode: state.secondaryDisplayMode,
          splitPosition: state.splitPosition,

          // Display preferences
          sortConfig: state.sortConfig,

          // Drilldown column preferences
          drilldownSelectedColumns: state.drilldownSelectedColumns

          // Explicitly NOT persisted:
          // - config (comes from Streamlit/props)
          // - dataHash, dataLoading, availableFields, detectedTypes (derived from data)
          // - cubeResults, drilldownData, sqlQuery (ephemeral query results)
          // - queryProgress, isDragging, showChartDialog (runtime UI state)
          // - chartConfig (depends on current data)
        }),
        version: 1
      }
    ),
    {
      name: `PivotStore-${instanceKey}`,
      enabled: isDev && typeof window !== 'undefined'
    }
  )
  );
}

/**
 * Hook to access the pivot store for the current instance
 * Must be used within a component wrapped by PivotStoreContext.Provider
 */
export function usePivotStore<T>(selector: (state: PivotStore) => T): T {
  const context = useContext(PivotStoreContext);
  if (!context) {
    throw new Error('usePivotStore must be used within a Pivot component');
  }
  return context.store(selector as any);
}

/**
 * Hook to get the instanceKey for the current pivot
 * Useful for passing to queries and other instance-specific operations
 */
export function usePivotInstanceKey(): string {
  const context = useContext(PivotStoreContext);
  if (!context) {
    throw new Error('usePivotInstanceKey must be used within a Pivot component');
  }
  return context.instanceKey;
}

/** The pivot's settings.locale, for components the locale prop does not reach. */
export function usePivotLocale(): string {
  return useContext(PivotStoreContext)?.locale ?? 'en-US';
}

/**
 * No-op function for backward compatibility
 * Previously cleared cached store instances, but stores are no longer cached
 * Each Pivot component creates its own independent store
 */
export function clearStoreInstances() {
  // No-op: stores are not cached anymore
}
