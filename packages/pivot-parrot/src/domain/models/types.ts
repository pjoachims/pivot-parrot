import { DataEngine } from '../../infrastructure/data-engines/DataEngine';
import type { FieldItem as PivotFieldItem } from '../field/FieldItem';

// Primitive value types that can appear in data
export type PrimitiveValue = string | number | boolean | null;

/**
 * Complete taxonomy of field types in the pivot system
 *
 * Drop rules:
 * - DIMENSION types (BASE_FIELD, DERIVED_FIELD, CUSTOM_GROUPING) → rows, columns, filters
 * - MEASURE types (AGGREGATION, CUSTOM_METRIC) → values, filters (with HAVING)
 * - CUSTOM_FILTER → filters only
 * - SIGMA_VALUES → rows, columns only
 */
export enum FieldKind {
  // Data columns from schema
  BASE_FIELD = 'base_field',           // Raw database column (e.g., region, sales, date)

  // Derived transformations
  DERIVED_FIELD = 'derived_field',     // Date parts, bins (e.g., date_year, sales_bucket)

  // Aggregations (measures)
  AGGREGATION = 'aggregation',         // Field + agg function (e.g., SUM_sales, AVG_price)

  // Custom user expressions
  CUSTOM_METRIC = 'custom_metric',     // Custom formula measure (e.g., profit_margin)
  CUSTOM_FILTER = 'custom_filter',     // Custom filter expression (e.g., is_high_value)
  CUSTOM_GROUPING = 'custom_grouping', // Custom grouping expression (e.g., region_type)

  // Special UI elements
  SIGMA_VALUES = 'sigma_values'        // The "Σ Values" placeholder for pivot layout
}

/** Id of the Σ Values placeholder in config.rows / config.columns: where the metrics sit in the layout. */
export const SIGMA_VALUES_ID = 'Σ Values';

export type FieldItem = PivotFieldItem;

// Field reference can be string ID or full object
export type FieldRef = string | FieldItem;

/**
 * Derived Field Type
 * Used for derived fields mapping (date parts, transformations)
 */
export interface DerivedField {
  id: string;
  label: string;
  sql: string;
  derivation_type: 'date_part' | 'custom';
}

/**
 * Value configuration for aggregation
 * Note: UI uses capitalized aggregations (Sum, Count) but they're normalized to lowercase in SQL generation
 */
export interface ValueFormat {
  type?: 'number' | 'currency' | 'percentage';
  decimals?: number;
  currency?: string;              // ISO code for type 'currency', default 'USD'
  useThousandSeparator?: boolean; // default: true for 'currency', false otherwise
}

export interface ValueConfig {
  field: string;
  aggregation: 'Sum' | 'Count' | 'Avg' | 'Min' | 'Max' | 'Count_distinct' | 'sum' | 'count' | 'avg' | 'min' | 'max' | 'count_distinct' | 'median' | 'std' | 'var' | 'custom';
  format?: ValueFormat;
  isCustom?: boolean;
}

/**
 * Filter configuration
 * Unified type for both UI state and query state
 */
export interface Filter {
  field: string;
  type: string;  // Filter type (equal, one_of, contains, between, greater, less, etc.)
  value?: PrimitiveValue;  // Single value for equal, contains, etc.
  selectedValues?: PrimitiveValue[];  // Multiple values for one_of
  betweenStart?: PrimitiveValue;  // Start value for between
  betweenEnd?: PrimitiveValue;  // End value for between
  isNot?: boolean;  // Negation flag
  isCustom?: boolean;

  // Enriched metadata (for HAVING clause detection and SQL generation)
  sourceField?: string;  // For derived/aggregated fields
  aggregation?: string;  // For aggregated filters
  formula?: string;  // For custom expressions
  filterType?: 'having' | 'where';  // Explicit type for WHERE vs HAVING
}

/**
 * Custom metric definition
 */
export interface CustomMetric {
  id: string;
  name: string;
  expr: string;
  format?: ValueFormat;
}

/**
 * Custom filter expression
 */
export interface CustomFilter {
  id: string;
  name: string;
  expr: string;
}

/**
 * Custom grouping expression
 */
export interface CustomGrouping {
  id: string;
  name: string;
  expr: string;
}


/**
 * Pivot table configuration
 */
export interface PivotTableConfig {
  rows: string[];
  columns: string[];
  values: ValueConfig[];
  filters: Filter[];
  hiddenValues?: ValueConfig[]; // Shadow values for HAVING filters (in SELECT but not displayed)
  customMetrics?: CustomMetric[];
  customFilters?: CustomFilter[];
  customGroupings?: CustomGrouping[];
  fieldNameOverrides?: Record<string, string>; // Map of field ID -> display name
}

/**
 * Extended pivot config with metadata (used for serialization)
 */
export interface ExtendedPivotTableConfig {
  config: PivotTableConfig;
  availableFields?: FieldItem[];
  detectedTypes?: Record<string, string | number>;
  derivedFieldsMap?: Record<string, FieldItem[]>;  // Maps source field to array of derived fields
}

/**
 * UI settings for the pivot component
 */
export interface PivotUISettings {
  autoUpdate?: boolean;
  autoExecute?: boolean;
  enableSQLPlayground?: boolean;
  /** The built-in Snapshots panel (default true). A host with its own saved-views UI hides it and uses the ref's getView/loadView. */
  showSnapshots?: boolean;
  locale?: string;
  height?: number;
  uniqueValuesLimit?: number | null;  // Max unique values to fetch (null = auto based on row count)

  // Dev Mode - exposes window.__pivotParrot debugging API
  devMode?: boolean;                  // Enable dev mode (default: false)
  enableProfiling?: boolean;          // Enable performance profiling (default: follows devMode)
  verboseProfiling?: boolean;         // Log each profiled operation (default: false)
}

/**
 * Engine settings for remote/local engines
 */
export interface PivotEngineSettings {
  pivotTimeout?: number;          // Timeout for pivot queries (ms), default: 60000
  uniqueValuesTimeout?: number;   // Timeout for unique values queries (ms), default: 20000
  drilldownTimeout?: number;      // Timeout for drilldown queries (ms), default: 30000
  dialect?: 'duckdb' | 'databricks' | 'spark' | 'generic';
}

/**
 * Callback functions for pivot events
 */
export interface PivotCallbacks {
  onConfigChange?: (config: PivotTableConfig) => void;
  onAutoUpdateChange?: (autoUpdate: boolean) => void;
}

// Data input types
export type ArrowData = Uint8Array | ArrayBuffer;
export type JSONData = Record<string, PrimitiveValue>[];
export type CSVData = string;
export type DataInput = ArrowData | JSONData | CSVData | unknown;

// DuckDB types (external library, kept as unknown for safety)
export type DuckDBInstance = unknown;

/**
 * Complete configuration object for the Pivot component
 *
 * @example
 * ```tsx
 * <Pivot config={{
 *   dataEngine: myEngine,
 *   data: myData,
 *   initialConfig: {
 *     rows: ['Category'],
 *     columns: ['Year'],
 *     values: [{ field: 'Sales', aggregation: 'sum' }]
 *   },
 *   settings: {
 *     autoUpdate: true,
 *     locale: 'en-US'
 *   },
 *   callbacks: {
 *     onConfigChange: (config) => console.log('Config changed:', config)
 *   }
 * }} />
 * ```
 */
export interface PivotConfig {
  // Instance Management
  instanceKey?: string;     // Unique key for multi-instance support (localStorage, query locks, DevTools)

  // Data & Engine
  dataEngine?: DataEngine;
  duckdb?: DuckDBInstance;  // Legacy DuckDB WASM module
  data?: DataInput;         // Arrow bytes, CSV, JSON, etc.
  mode?: 'local' | 'remote';

  /**
   * The view to start from (direct config or extended format with metadata). It is
   * applied on the first init and again whenever its content changes, so an equal
   * object passed on every render keeps the user's edits; pass different content
   * to load a new view.
   */
  initialConfig?: PivotTableConfig | ExtendedPivotTableConfig;

  // UI Settings
  settings?: PivotUISettings;

  // Engine Settings
  engineSettings?: PivotEngineSettings;

  // Callbacks
  callbacks?: PivotCallbacks;

  /** Persists snapshots (saved views); in memory when absent. */
  snapshotStore?: SnapshotStore;
}


// ==================== Component Types ====================

export interface CubeRow {
  [key: string]: string | number | null;
}

export interface DrilldownRow {
  [key: string]: string | number | null;
}

export interface DimensionFilters {
  [dimension: string]: string | number | null;
}

export interface SavedViewStates {
  chart: ViewState;
  drilldown: ViewState;
  sql: ViewState;
}

export interface ViewState {
  mode: 'hidden' | 'full' | 'split-below' | 'split-right';
  position: number;
}

/**
 * What recreates a pivot screen: its config and view state, never its result
 * data. Restoring re-runs the query, so numbers are always current and no data
 * leaves the engine. `v` lets a host that stores views migrate old ones.
 */
export interface PivotView {
  v: 1;
  config: PivotTableConfig;
  /** Derived fields (date parts, bins) the config may use; they live outside the config. */
  derivedFields: FieldItem[];
  sortConfig: { valueKey: string | null; direction: 'asc' | 'desc' };
  activeView: 'chart' | 'drilldown' | 'sql' | null;
  secondaryDisplayMode: 'hidden' | 'full' | 'split-below' | 'split-right';
  chartConfig: unknown | null;
  splitPosition: number;
  /** The cell the drilldown was opened on; restoring re-queries its rows. */
  drilldownFilters: DimensionFilters | null;
}

export interface SavedView {
  id: string;
  name: string;
  createdAt: string;
  view: PivotView;
}

export type NewSavedView = Omit<SavedView, 'id' | 'createdAt'> & { id?: string };

/**
 * Where saved views live. A host passes one as `snapshotStore` to keep them
 * server-side; without it the pivot keeps them in memory.
 */
export interface SnapshotStore {
  list(): Promise<SavedView[]>;
  save(view: NewSavedView): Promise<SavedView>;
  remove(id: string): Promise<void>;
}
