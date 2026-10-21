import { PivotConfig, PivotTableConfig, ExtendedPivotTableConfig, DuckDBInstance, DataInput, FieldItem, SnapshotStore } from '../models/types';
import { DataEngine } from '../../infrastructure/data-engines/DataEngine';

/**
 * Normalized configuration with defaults applied
 *
 * This class takes the raw PivotConfig and provides a clean interface
 * with all defaults applied. Access via dot notation throughout the component.
 */
export class NormalizedPivotConfig {
  // Data & Engine
  readonly dataEngine: DataEngine | null;
  readonly duckdb: DuckDBInstance | undefined;
  readonly duckdbBundles: PivotConfig['duckdbBundles'];
  readonly data: DataInput | undefined;
  readonly mode: 'local' | 'remote';

  // Pivot Configuration (can be either direct config or extended format)
  readonly initialConfig: PivotTableConfig | ExtendedPivotTableConfig | null;

  // UI Settings (with defaults)
  readonly autoUpdate: boolean;
  readonly autoExecute: boolean;
  readonly enableSQLPlayground: boolean;
  readonly showSnapshots: boolean;
  readonly devMode: boolean;
  readonly locale: string;
  readonly height: number;
  readonly enableProfiling: boolean;
  readonly verboseProfiling: boolean;

  // Engine Settings (with defaults)
  readonly pivotTimeout: number;
  readonly uniqueValuesTimeout: number;
  readonly drilldownTimeout: number;
  readonly dialect: 'duckdb' | 'databricks' | 'spark' | 'generic';

  // Callbacks
  readonly onConfigChange: ((config: PivotTableConfig) => void) | null;
  readonly onAutoUpdateChange: ((autoUpdate: boolean) => void) | null;

  readonly snapshotStore: SnapshotStore | null;

  constructor(config: PivotConfig = {}) {
    // Data & Engine
    this.dataEngine = config.dataEngine || null;
    this.duckdb = config.duckdb;
    this.duckdbBundles = config.duckdbBundles;
    this.data = config.data;
    this.mode = config.mode || 'local';

    // Pivot Configuration
    this.initialConfig = config.initialConfig || null;

    // UI Settings with defaults
    this.autoUpdate = config.settings?.autoUpdate ?? true;
    this.autoExecute = config.settings?.autoExecute ?? false;
    // Off by default in remote mode: there the playground sends arbitrary SQL
    // to the host's backend, so the host opts in (and guards it server-side).
    this.enableSQLPlayground = config.settings?.enableSQLPlayground ?? this.mode !== 'remote';
    this.showSnapshots = config.settings?.showSnapshots ?? true;
    this.devMode = config.settings?.devMode ?? false;
    this.locale = config.settings?.locale ?? 'en-US';
    this.height = config.settings?.height ?? 1000;
    this.enableProfiling = config.settings?.enableProfiling ?? false;
    this.verboseProfiling = config.settings?.verboseProfiling ?? false;

    // Engine Settings with defaults
    this.pivotTimeout = config.engineSettings?.pivotTimeout ?? 60000;
    this.uniqueValuesTimeout = config.engineSettings?.uniqueValuesTimeout ?? 20000;
    this.drilldownTimeout = config.engineSettings?.drilldownTimeout ?? 30000;
    this.dialect = config.engineSettings?.dialect ?? 'duckdb';

    // Callbacks
    this.onConfigChange = config.callbacks?.onConfigChange || null;
    this.onAutoUpdateChange = config.callbacks?.onAutoUpdateChange || null;

    this.snapshotStore = config.snapshotStore || null;
  }

  /**
   * Check if initialConfig is in extended format (has nested .config property)
   */
  isExtendedConfig(): this is { initialConfig: ExtendedPivotTableConfig } {
    return this.initialConfig !== null && 'config' in this.initialConfig;
  }

  /**
   * Get the actual pivot table config (handles both direct and extended formats)
   */
  getPivotTableConfig(): PivotTableConfig | null {
    if (!this.initialConfig) return null;
    if ('config' in this.initialConfig) {
      return this.initialConfig.config;
    }
    return this.initialConfig as PivotTableConfig;
  }

  /**
   * Get available fields (only present in extended format)
   */
  getAvailableFields(): FieldItem[] {
    if (this.initialConfig && 'availableFields' in this.initialConfig) {
      return this.initialConfig.availableFields || [];
    }
    return [];
  }

  /**
   * Get detected types (only present in extended format)
   */
  getDetectedTypes(): Record<string, string | number> {
    if (this.initialConfig && 'detectedTypes' in this.initialConfig) {
      return this.initialConfig.detectedTypes || {};
    }
    return {};
  }

  /**
   * Get derived fields map (only present in extended format)
   * Maps source field ID to array of derived fields
   */
  getDerivedFieldsMap(): Record<string, FieldItem[]> {
    if (this.initialConfig && 'derivedFieldsMap' in this.initialConfig) {
      return this.initialConfig.derivedFieldsMap || {};
    }
    return {};
  }
}
