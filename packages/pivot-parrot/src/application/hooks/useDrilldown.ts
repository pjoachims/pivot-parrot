import { useState } from 'react';
import { DataEngine } from '../../infrastructure/data-engines/DataEngine';
import { usePivotStore } from '../state/store';
import { adaptQueryResult, toRows, type ColumnarResult } from '../utils/columnarResult';
import { downloadCSV } from '../utils/export';
import { decodeNumber } from '../utils/formatters';
import { toCSV, type CsvCell } from '../../domain/query/utils/csv';

// Type definitions
type DimensionFilters = Record<string, any>;

interface DrilldownResult {
  data?: any[];
  table?: any;
  sql: string;
  executionTime?: number;
  rowCount?: number;
  columnCount?: number;
  filters?: DimensionFilters;
  limitReached?: boolean;
}

/**
 * Custom hook to manage drilldown functionality
 */
export function useDrilldown(
  queryEngine: DataEngine | null,
  dataEngine: DataEngine | null,
  detectedTypes: Record<string, string | number> = {},
  drilldownTimeout?: number,
  availableFields: any[] = [],
  customGroupings: any[] = [],
  customFilters: any[] = []
) {
  // Read addToSqlHistory from store
  const addToSqlHistory = usePivotStore((s) => s.addToSqlHistory);
  const [drilldownData, setDrilldownData] = useState<ColumnarResult | null>(null);
  const [drilldownFilters, setDrilldownFilters] = useState<DimensionFilters | null>(null);
  const [drilldownSQL, setDrilldownSQL] = useState<string | null>(null);
  const [drilldownDtypes, setDrilldownDtypes] = useState<Record<string, string> | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState<boolean>(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  function cancelDrilldown(): void {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setDrilldownLoading(false);
    }
  }

  function clearDrilldown(): void {
    cancelDrilldown();
    setDrilldownData(null);
    setDrilldownFilters(null);
    setDrilldownSQL(null);
    setDrilldownDtypes(null);
  }

  async function executeDrilldown(dimensionFilters: DimensionFilters): Promise<DrilldownResult> {
    // Cancel any existing drilldown
    if (abortController) {
      abortController.abort();
    }

    const controller = new AbortController();
    setAbortController(controller);
    setDrilldownLoading(true);
    setDrilldownFilters(dimensionFilters);
    setDrilldownData(null);
    setDrilldownSQL(null);

    try {
      if (controller.signal.aborted) {
        throw new Error('Drilldown cancelled');
      }

      const engine = queryEngine || dataEngine;
      if (!engine) {
        throw new Error('No data engine available for drilldown');
      }
      await engine.init();

      if (controller.signal.aborted) {
        throw new Error('Drilldown cancelled');
      }

      // Request the Arrow format - DuckDBWASMEngine keeps the query result
      // columnar (no per-row materialization); engines that can't produce an
      // Arrow Table (remote) silently fall back to rows, and adaptQueryResult
      // below handles either shape identically.
      const result = await engine.executeDrilldown(dimensionFilters, 'pivot_data', 10000, detectedTypes, drilldownTimeout, availableFields, customGroupings, customFilters, 'arrow');

      if (controller.signal.aborted) {
        throw new Error('Drilldown cancelled');
      }

      const adapted = adaptQueryResult(result);
      setDrilldownData(adapted);
      setDrilldownSQL(result.sql);
      setDrilldownDtypes(result.dtypes);

      // Add to SQL history (small materialized sample only - never the full result)
      addToSqlHistory(
        result.sql,
        'drilldown',
        toRows(adapted, 3), // First 3 rows as sample
        result.dtypes, // dtypes from drilldown result
        result.rowCount
      );

      return result;
    } catch (err) {
      if (!controller.signal.aborted) {
        throw err;
      }
      throw new Error('Drilldown cancelled');
    } finally {
      if (controller === abortController) {
        setAbortController(null);
      }
      setDrilldownLoading(false);
    }
  }

  function exportDrilldownCSV(result: ColumnarResult | null, locale?: string): void {
    if (!result || result.numRows === 0) return;

    const headers = result.columnNames;
    const dialect = (queryEngine || dataEngine)?.getDialect() ?? null;
    const rows = Array.from({ length: result.numRows }, (_, i) => headers.map(h => decodeNumber(result.getValue(i, h), result.dtypes[h], dialect) as CsvCell));
    downloadCSV(toCSV([headers, ...rows], locale), 'drilldown_data.csv');
  }

  function restoreDrilldown(data: any[], filters: DimensionFilters, sql: string, dtypes?: Record<string, string>): void {
    // Restore drilldown state from snapshot (no query execution). Snapshots
    // always hold a materialized rows array (they're serializable), so adapt
    // it into the same columnar shape the live query path produces.
    setDrilldownData(adaptQueryResult({ data, dtypes }));
    setDrilldownFilters(filters);
    setDrilldownSQL(sql);
    setDrilldownDtypes(dtypes || null);
    setDrilldownLoading(false);
  }

  return {
    drilldownData,
    drilldownFilters,
    drilldownSQL,
    drilldownDtypes,
    drilldownLoading,
    executeDrilldown,
    cancelDrilldown,
    exportDrilldownCSV,
    restoreDrilldown,
    clearDrilldown
  };
}
