import { useState } from 'react';
import { DataEngine } from '../../infrastructure/data-engines/DataEngine';
import { usePivotStore } from '../state/store';
import { adaptQueryResult, toRows, type ColumnarResult } from '../utils/columnarResult';

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

  function exportDrilldownCSV(result: ColumnarResult | null): void {
    if (!result || result.numRows === 0) return;

    const headers = result.columnNames;
    const rows: string[] = [];
    for (let i = 0; i < result.numRows; i++) {
      rows.push(headers.map(h => {
        const val = result.getValue(i, h);
        const strVal = val === null || val === undefined ? '' : String(val);
        return strVal.includes(',') || strVal.includes('"')
          ? `"${strVal.replace(/"/g, '""')}"`
          : strVal;
      }).join(','));
    }
    const csv = [headers.join(','), ...rows].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'drilldown_data.csv';
    link.click();
    URL.revokeObjectURL(link.href);
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
    restoreDrilldown
  };
}
