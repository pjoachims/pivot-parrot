# Pivot-Parrot Architecture

## Visual Layout

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    PIVOT-PARROT APPLICATION                                        │
│  ┌──────────────────────────────┬──────────────────────────────────────────────────────────────┐  │
│  │  LEFT SIDEBAR                │  MAIN DISPLAY AREA                                           │  │
│  │  FieldOptionsContainer       │  PivotMainPanel                                              │  │
│  │                              │                                                              │  │
│  │ ┌──────────────────────────┐ │ ┌──────────────────────────────────────────────────────────┐ │  │
│  │ │ ◀ Field Options  Auto ☑  │ │ │ PIVOT TABLE (PivotDisplay)                               │ │  │
│  │ │   ⚙  Sort ⇅  Export 📥   │ │ │ ┌────────┬─────────────────────┐                         │ │  │
│  │ │   Chart 📊               │ │ │ │ state  │ Count_units_purch.. │                         │ │  │
│  │ │ SidebarTopBar            │ │ │ ├────────┼─────────────────────┤                         │ │  │
│  │ └──────────────────────────┘ │ │ │ AK     │ 37                  │                         │ │  │
│  │                              │ │ │ AL     │ 65                  │                         │ │  │
│  │ ┌──────────────────────────┐ │ │ │ AR     │ 11                  │                         │ │  │
│  │ │ Choose fields:           │ │ │ │ AZ     │ 600                 │                         │ │  │
│  │ │ [Search___________ 🔍]   │ │ │ │ CA     │ 2903                │                         │ │  │
│  │ │ FieldOptionsSearch       │ │ │ │ CO     │ 720                 │                         │ │  │
│  │ └──────────────────────────┘ │ │ └────────┴─────────────────────┘                         │ │  │
│  │                              │ │                                                          │ │  │
│  │ ┌──────────────────────────┐ │ │ • Expandable rows/columns (chevrons)                     │ │  │
│  │ │ AVAILABLE FIELDS         │ │ │ • Context menus (right-click)                            │ │  │
│  │ │ FieldsList               │ │ │ • Sort by clicking headers                               │ │  │
│  │ │ ☐ # customer_id          │ │ │ • Drilldown on row click                                 │ │  │
│  │ │ ☐ Abc state    ← ACTIVE  │ │ └──────────────────────────────────────────────────────────┘ │  │
│  │ │ ☐ Abc city               │ │                                                              │  │
│  │ │ ────────────────────     │ │ ┌──────────────────────────────────────────────────────────┐ │  │
│  │ │ 📊 Custom Metrics        │ │ │ SECONDARY VIEW (DrilldownView / ChartView / SQLPlayground)│ │  │
│  │ │ 🔎 Custom Filters        │ │ │ ┌──────────┬────────┬───────────┬───────┐                │ │  │
│  │ │ 📁 Custom Groupings      │ │ │ │customer_i│ tax_id │ customer  │ state │                │ │  │
│  │ └──────────────────────────┘ │ │ ├──────────┼────────┼───────────┼───────┤                │ │  │
│  │                              │ │ │ 12584934 │        │ JOZEF...  │ AL    │                │ │  │
│  │ ━━ DROP ZONES ━━━━━━━━━━━━  │ │ │ 12570667 │        │ MANGUE... │ AL    │                │ │  │
│  │ DropZonesGrid               │ │ └──────────┴────────┴───────────┴───────┘                │ │  │
│  │ ┌──────────────────────────┐ │ └──────────────────────────────────────────────────────────┘ │  │
│  │ │ ⊞ Filters                │ │                                                              │  │
│  │ │ [Drop here_____________] │ │                                                              │  │
│  │ └──────────────────────────┘ │                                                              │  │
│  │ ┌──────────────────────────┐ │                                                              │  │
│  │ │ ⊞ Columns                │ │                                                              │  │
│  │ │ [Drop here_____________] │ │                                                              │  │
│  │ └──────────────────────────┘ │                                                              │  │
│  │ ┌──────────────────────────┐ │                                                              │  │
│  │ │ ⊞ Rows                   │ │                                                              │  │
│  │ │ [state ⓧ 🔽 🔍 ⋮]       │ │                                                              │  │
│  │ └──────────────────────────┘ │                                                              │  │
│  │ ┌──────────────────────────┐ │                                                              │  │
│  │ │ Σ Values                 │ │                                                              │  │
│  │ │ Count of units_purchased │ │                                                              │  │
│  │ └──────────────────────────┘ │                                                              │  │
│  │                              │                                                              │  │
│  │ ┌──────────────────────────┐ │                                                              │  │
│  │ │ 📦 Snapshots (0)      ▶  │ │                                                              │  │
│  │ │ SnapshotsPanel           │ │                                                              │  │
│  │ └──────────────────────────┘ │                                                              │  │
│  └──────────────────────────────┴──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘

FLOATING DIALOGS (DialogsManager - rendered on demand):
┌─────────────────────────┐  ┌─────────────────────────┐  ┌─────────────────────────┐
│ Expression Editor       │  │ Filter Dialog           │  │ Having Filter Dialog    │
│ ─────────────────────── │  │ ─────────────────────── │  │ ─────────────────────── │
│ Type: [Metric ▼]        │  │ Field: state            │  │ Field: Count_units...   │
│ Name: [______________]  │  │ Operator: [equals ▼]    │  │ Operator: [> ▼]         │
│ Formula: [___________]  │  │ Values:                 │  │ Value: [______________] │
│ [Cancel] [Save]         │  │ ☐ AK  ☐ AL  ☑ CA       │  │ [Clear] [Apply]         │
└─────────────────────────┘  └─────────────────────────┘  └─────────────────────────┘
```

## Folder Structure

```
packages/pivot-parrot/src/
├── application/                    # Application layer (use cases, state, hooks)
│   ├── state/
│   │   ├── store.ts               # Zustand store (767 lines) - all client state
│   │   └── actions.ts             # Pure action functions (config transformations)
│   ├── hooks/
│   │   ├── usePivotCalculation.ts # Query execution, caching, SQL generation
│   │   ├── usePivotDisplay.ts     # Transform cubeResults → display data
│   │   ├── usePivotHandlers.ts    # Event orchestration (drilldown, export, etc.)
│   │   ├── useDrilldown.ts        # Drilldown query execution
│   │   ├── useSQLPlayground.ts    # SQL playground logic
│   │   ├── useSnapshots.ts        # Snapshot CRUD operations
│   │   ├── useSplitPane.ts        # Split pane resize logic
│   │   ├── useQueryProgress.ts    # Query progress tracking
│   │   └── useDevMode.ts          # Dev tools (window.__pivotParrot)
│   └── utils/
│       ├── cubeIndex.ts           # O(1) CUBE lookups via hash index
│       ├── chartUtils.ts          # Chart data transformation
│       └── drilldownBuilder.ts    # Build drilldown filters
│
├── domain/                         # Domain layer (business logic, pure functions)
│   ├── models/
│   │   ├── types.ts               # All TypeScript types
│   │   └── NormalizedPivotConfig.ts # Config normalization with defaults
│   ├── field/
│   │   ├── FieldItem.ts           # Field data structure
│   │   └── metric-resolver.ts     # Custom metric resolution
│   ├── pivot/
│   │   ├── index.ts               # buildPivotDisplayData orchestrator
│   │   ├── columnBuilder.ts       # Column tree construction
│   │   ├── rowBuilder.ts          # Row tree construction
│   │   └── valuePopulator.ts      # Populate values via cube index
│   └── query/
│       ├── sql/
│       │   ├── buildPivotSQL.ts   # Main SQL generation entry point
│       │   ├── buildCubeSQL.ts    # CUBE query generation
│       │   └── filters.ts         # WHERE/HAVING clause builders
│       └── dialects/
│           ├── SQLDialect.ts      # Dialect interface
│           ├── DuckDBDialect.ts   # DuckDB-specific SQL
│           └── DatabricksDialect.ts
│
├── infrastructure/                 # Infrastructure layer (external services)
│   └── data-engines/
│       ├── DataEngine.ts          # Abstract base class
│       ├── DuckDBWASMEngine.ts    # Local mode (browser WASM)
│       └── RemoteDataEngine.ts    # Remote mode (Streamlit/Jupyter backend)
│
└── presentation/                   # Presentation layer (React components)
    ├── pivot/
    │   ├── Pivot.tsx              # Root component (585 lines), store provider
    │   ├── PivotMainPanel.tsx     # Main display area
    │   └── PivotQueryProgress.tsx # Query overlay
    ├── sidebar/
    │   ├── Sidebar.tsx            # Sidebar shell
    │   ├── field-options/
    │   │   ├── FieldOptionsContainer.tsx  # Sidebar orchestrator
    │   │   ├── FieldsList.tsx     # Available fields list
    │   │   └── drop-zones/
    │   │       ├── DropZonesGrid.tsx
    │   │       └── DropZone.tsx
    │   ├── dialogs/
    │   │   ├── DialogsManager.tsx # Renders all dialogs
    │   │   ├── FilterDialog.tsx
    │   │   ├── HavingFilterDialog.tsx
    │   │   └── CustomExpressionDialog.tsx
    │   └── snapshots/
    │       └── SnapshotsPanel.tsx
    ├── pivot-table/
    │   ├── PivotDisplay.tsx       # Pivot table renderer
    │   ├── ColumnHeaders.tsx
    │   └── PivotRow.tsx
    ├── charts/
    │   ├── ChartView.tsx          # Chart container
    │   ├── ChartDialog.tsx        # Chart config dialog
    │   ├── BarLineChart.tsx
    │   ├── ScatterChart.tsx
    │   └── TreemapChart.tsx
    ├── drilldown/
    │   └── DrilldownView.tsx
    └── secondary/
        ├── SecondaryView.tsx      # Secondary panel router
        └── SQLPlayground.tsx
```

## State Management

### Zustand Store (`application/state/store.ts`)

All client state lives in a single Zustand store. Each `<Pivot>` instance creates its own isolated store via `createPivotStore(instanceKey)`.

```typescript
interface PivotStore {
  // ==================== Config State ====================
  config: PivotTableConfig;           // User's current configuration
  executionConfig: PivotTableConfig;  // Committed config (triggers query)

  // ==================== Data State ====================
  dataHash: string | null;            // Hash of loaded data (change detection)
  dataLoading: boolean;
  initComplete: boolean;              // Guards query execution
  availableFields: FieldItem[];       // Schema from data engine
  detectedTypes: Record<string, string>;
  uniqueValuesCache: Record<string, any[]>;

  // ==================== Display State ====================
  sortConfig: { valueKey: string | null; direction: 'asc' | 'desc' };
  chartConfig: ChartConfig | null;

  // ==================== UI State ====================
  sidebarCollapsed: boolean;
  activeView: 'chart' | 'drilldown' | 'sql' | null;
  secondaryDisplayMode: 'hidden' | 'full' | 'split-below' | 'split-right';
  autoUpdate: boolean;
  searchQuery: string;
  dragOverZone: string | null;

  // Dialog states
  filterDialog: any;
  havingFilterDialog: any;
  expressionDialog: any;
  derivedFieldDialog: any;

  // ==================== Transient State ====================
  drilldownData: any[] | null;
  drilldownFilters: any;
  sqlQuery: string;
  queryProgress: { elapsed: number; type: string } | null;
  sqlHistory: Array<{ timestamp: string; sql: string; ... }>;
}
```

### Persistence

Only UI preferences persist to localStorage (`pivot-preferences-{instanceKey}`):
- `sidebarCollapsed`
- `savedViewStates`
- `secondaryDisplayMode`
- `splitPosition`
- `sortConfig`

Everything else is ephemeral (config from props, data from engine, query results).

### Granular Reactivity

Components subscribe to specific slices:

```typescript
// GOOD: Only re-renders when config changes
const config = usePivotStore((s) => s.config);

// BAD: Re-renders on ANY store change
const store = usePivotStore();
```

## Data Flow

### Initialization Sequence

```
1. Pivot mounts
   └─→ createPivotStore(instanceKey)
   └─→ Render PivotInner with store context

2. Data loading (useEffect in Pivot.tsx)
   ├─→ Local mode: loadData(cfg.data, dataEngine)
   │   └─→ DuckDBWASMEngine.loadArrowBytes() / loadCSV()
   │   └─→ getAvailableFields() → setAvailableFields()
   │   └─→ detectFieldTypes() → setDetectedTypes()
   │
   └─→ Remote mode: queryEngine.getAvailableFields()
       └─→ setAvailableFields(), setDetectedTypes()

3. Apply initial config
   └─→ setConfig(cfg.getPivotTableConfig())

4. Mark ready
   └─→ setInitComplete(true)

5. Auto-commit (if autoUpdate=true)
   └─→ commitConfig() copies config → executionConfig
```

### Query Execution Flow

```
executionConfig changes (via commitConfig)
    ↓
usePivotCalculation useEffect detects change
    ↓
calculatePivot()
    ├─→ buildPivotSQL(config, dialect, availableFields, detectedTypes)
    │   ├─→ Enrich values with custom metric expressions
    │   ├─→ Build WHERE clauses (dimension filters)
    │   ├─→ Build HAVING clauses (aggregation filters)
    │   └─→ Generate CUBE SQL
    │
    ├─→ Check cache (hashPivotConfig)
    │
    └─→ engine.executeQuery(sql)
        ├─→ Local: DuckDB WASM in browser
        └─→ Remote: HTTP to Python backend
    ↓
setQueryResult({ cubeResults, dtypes, fieldsHash, config })
    ↓
usePivotDisplay transforms cubeResults → displayData
    ├─→ buildColumnOutline() - flat list for value indexing
    ├─→ buildColumnTree() - hierarchical for headers
    ├─→ buildRowTree() - row hierarchy
    ├─→ populateNodeValues() - fill values via cubeIndex
    └─→ sortRowTree() - apply sort
    ↓
PivotDisplay renders table
```

### Drag & Drop Flow

```
User drags field from FieldsList
    ↓
handleDragStart: e.dataTransfer.setData({ fieldName, sourceZone })
    ↓
User drags over DropZone
    ↓
store.setDragOverZone('rows')  →  Visual highlight
    ↓
User drops
    ↓
store.handleDrop(fieldName, sourceZone, 'rows', index)
    ├─→ buildHandleDrop() - pure function builds new config
    ├─→ set({ config: newConfig })
    └─→ If filter zone: setTimeout → open FilterDialog
    ↓
(if autoUpdate) commitConfig() → query executes
```

### Drilldown Flow

```
User clicks row in PivotDisplay
    ↓
onDrilldown(dimensionFilters)
    ↓
useDrilldown.executeDrilldown(filters)
    ├─→ Build SELECT * query with WHERE clauses
    └─→ engine.executeQuery(sql)
    ↓
setDrilldownData(results)
setActiveView('drilldown')
    ↓
SecondaryView renders DrilldownView
```

## Component Hierarchy

```
<Pivot>
  <PivotStoreContext.Provider>
    <PivotInner>
      <PivotQueryProgress />
      <FieldOptionsContainer>
        <Sidebar>
          <SidebarTopBar />
          <FieldOptionsSection>
            <FieldOptionsSearch />
            <FieldsList />
            <FieldOptionsActions />
            <DropZonesGrid />
            <DialogsManager />
          </FieldOptionsSection>
          <SnapshotsPanel />
        </Sidebar>
      </FieldOptionsContainer>
      <PivotMainPanel>
        <PivotDisplay />
        <SecondaryView>
          <DrilldownView /> | <ChartView /> | <SQLPlayground />
        </SecondaryView>
      </PivotMainPanel>
    </PivotInner>
  </PivotStoreContext.Provider>
</Pivot>
```

## Config Object

### Input Format (PivotConfig)

```typescript
interface PivotConfig {
  // Data source (one of these)
  dataEngine?: DataEngine;     // Remote engine (Streamlit/Jupyter)
  duckdb?: DuckDBInstance;     // DuckDB WASM instance
  data?: DataInput;            // Raw data (Arrow, CSV, JSON)

  // Mode
  mode?: 'local' | 'remote';
  instanceKey?: string;        // For multi-instance support

  // Initial pivot config
  initialConfig?: PivotTableConfig;

  // Settings
  settings?: {
    autoUpdate?: boolean;      // Default: true
    locale?: string;           // Default: 'en-US'
    enableSQLPlayground?: boolean; // Default: true local, false remote
    devMode?: boolean;
  };

  // Engine settings
  engineSettings?: {
    pivotTimeout?: number;     // Default: 60000
    uniqueValuesTimeout?: number;
    dialect?: 'duckdb' | 'databricks';
  };

  // Callbacks
  callbacks?: {
    onConfigChange?: (config: PivotTableConfig) => void;
  };
}
```

### PivotTableConfig (Runtime)

```typescript
interface PivotTableConfig {
  filters: Filter[];           // Filter configurations (field, type, value, etc.)
  rows: string[];              // Row dimension fields (may include 'Σ Values')
  columns: string[];           // Column dimension fields
  values: ValueConfig[];       // Metrics to compute

  customMetrics?: CustomMetric[];     // User-defined calculated fields
  customFilters?: CustomFilter[];     // Custom filter expressions
  customGroupings?: CustomGrouping[];
}

interface ValueConfig {
  field: string;
  aggregation: 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX' | ...;
  format?: FormatConfig;
  isCustom?: boolean;          // True if references customMetrics
}
```

## SQL Generation

### CUBE Query Structure

```sql
SELECT
  -- Dimensions (with GROUPING markers)
  region,
  GROUPING(region) AS _grouping_region,
  category,
  GROUPING(category) AS _grouping_category,

  -- Metrics
  SUM(sales) AS sum_sales,
  COUNT(*) AS count_id

FROM pivot_data

WHERE state IN ('CA', 'NY')  -- Dimension filters

GROUP BY CUBE(region, category)

HAVING SUM(sales) > 1000     -- Aggregation filters

ORDER BY region, category
```

The `GROUPING()` columns indicate aggregation level:
- `0` = dimension value present (detail row)
- `1` = dimension aggregated (subtotal/total row)

### Cube Index

For O(1) value lookups, cube results are indexed by hash:

```typescript
// Hash format: "ungrouped:value|grouped:*" (sorted for order-independence)
"category:Electronics|region:West"  →  [row]
"category:*|region:West"            →  [subtotal row]
"category:*|region:*"               →  [grand total row]
```

## Data Engines

### DataEngine (Abstract Base)

```typescript
class DataEngine {
  async init(): Promise<void>;
  async loadArrowBytes(bytes: Uint8Array, tableName: string): Promise<void>;
  async loadCSV(data: string, tableName: string): Promise<void>;
  async executeQuery(sql: string): Promise<QueryResult>;
  async getAvailableFields(): Promise<FieldItem[]>;
  getDialect(): SQLDialect;

  // Query tracking
  subscribeToQueries(listener: (info) => void): () => void;
  isQueryRunning(): boolean;
}
```

### DuckDBWASMEngine (Local Mode)

- Runs DuckDB in browser via WebAssembly
- Data stays client-side
- No network latency for queries
- Supports Arrow, CSV, JSON input

### RemoteDataEngine (Remote Mode)

- Sends SQL to the Python backend (Streamlit or Jupyter)
- Backend executes on real database
- Returns Arrow IPC bytes
- Used for large datasets / production databases

## Charts

Charts read from the same CUBE results as the pivot table:

```
cubeResults (flat CUBE rows)
    ↓
buildChartData(cubeResults, chartConfig, config, dtypes, dialect)
    ├─→ getChartDimensions(chartConfig)
    ├─→ selectChartData() - filter to correct aggregation level
    ├─→ buildCubeIndex() - for treemap lookups
    └─→ Return { rows, rawRows, cubeIndex, dimensions, ... }
    ↓
transformBarLineChart() / transformScatterChart() / transformTreemapChart()
    ↓
Plotly.react(traces, layout)
```

Chart types:
- **Bar/Line**: X-axis dimension, optional groupBy, multiple Y metrics
- **Scatter**: X/Y metrics, point level dimension, optional color dimension
- **Treemap**: Hierarchical (1-3 levels), size metric, optional color metric

## Multi-Instance Support

Each `<Pivot>` component creates its own isolated store:

```typescript
<Pivot config={{ instanceKey: 'sales_pivot', ... }} />
<Pivot config={{ instanceKey: 'inventory_pivot', ... }} />
```

- Stores are independent (no shared state)
- localStorage keys include instanceKey: `pivot-preferences-sales_pivot`
- DevTools shows separate stores: `PivotStore-sales_pivot`

## Performance

### Optimizations

1. **Granular subscriptions** - Components only re-render on their specific state changes
2. **Cube index** - O(1) value lookups instead of O(n) array scans
3. **Query caching** - LRU cache in usePivotCalculation
4. **Execution boundary** - `config` vs `executionConfig` prevents query spam
5. **Profiler** - Optional timing via `profiler.profile('name', fn)`
