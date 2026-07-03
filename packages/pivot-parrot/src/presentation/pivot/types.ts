/**
 * Component-specific types
 *
 * This file defines clean interfaces for component props, avoiding 'any' wherever possible.
 */

import type { DataEngine } from '../../infrastructure/data-engines/DataEngine';
import type { PivotTableConfig } from '../../domain/models/types';
import type { ColumnarResult } from '../../application/utils/columnarResult';

// ==================== Calculation State ====================

export interface CalculationState {
  cubeResults: CubeRow[];
  dtypes: Record<string, string>;
  calculating: boolean;
  error: string | null;
  setError: (error: string | null) => void;
}

export interface CubeRow {
  [key: string]: string | number | null;
}

export interface DisplayData {
  headers: unknown;  // Complex nested structure from pivot builder
  rows: unknown[];   // Complex nested structure from pivot builder
  [key: string]: unknown;
}

// ==================== Drilldown State ====================

export interface DrilldownState {
  drilldownData: ColumnarResult | null;
  drilldownFilters: DimensionFilters | null;
  drilldownSQL: string | null;
  drilldownDtypes: Record<string, string> | null;
  exportDrilldownCSV: (data: ColumnarResult | null) => void;
}

export interface DrilldownRow {
  [key: string]: string | number | null;
}

export interface DimensionFilters {
  [dimension: string]: string | number | null;
}

// ==================== SQL Playground State ====================

export interface SQLPlaygroundState {
  sqlQuery: string;
  setSQLQuery: (sql: string) => void;
}

// ==================== Split Pane State ====================

export interface SplitPaneState {
  splitPosition: number;
  isDragging: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
  savedViewStates: SavedViewStates;
  setSplitPosition: (pos: number) => void;
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

// ==================== Snapshot State ====================

export interface Snapshot {
  id: string;
  timestamp: string | number;  // Can be string from hook or number
  name?: string;
  config: PivotTableConfig;
  cubeResults: CubeRow[];
  dtypes: Record<string, string>;
  // View state
  activeView: 'chart' | 'drilldown' | 'sql' | null;
  secondaryDisplayMode: 'hidden' | 'full' | 'split-below' | 'split-right';
  chartConfig?: unknown;
  splitPosition?: number;
  drilldownState?: {
    data: DrilldownRow[];
    filters: DimensionFilters;
    sql: string;
  };
  sqlQuery?: string;
}

// ==================== Enriched Config ====================

// This is the config after field resolution and defaults applied
export interface EnrichedConfig extends PivotTableConfig {
  showGrandTotal?: boolean;
  showRowSubtotals?: boolean;
  showColumnSubtotals?: boolean;
  [key: string]: unknown; // Allow additional properties from enrichment
}

// ==================== SQL History ====================

export interface SQLHistoryEntry {
  sql: string;
  timestamp: number;
  type: 'pivot' | 'drilldown' | 'uniqueValues' | 'query';
  sampleRows?: unknown[];
  dtypes?: Record<string, string>;
  rowCount?: number;
}

// ==================== Handler Types ====================

export interface PivotHandlers {
  handleDrilldown: (filters: DimensionFilters) => Promise<void>;
  handleSecondaryDisplayModeChange: (mode: 'hidden' | 'full' | 'split-below' | 'split-right') => void;
  handleOpenSQL: () => void;
  handleExecuteSQL: (sql: string) => Promise<unknown>;
}

// ==================== Export Types ====================

export type ExportFunction = (data: unknown, filename?: string | null) => void;
