import { useMemo, useRef } from 'react';
import { buildPivotDisplayData, countDisplayColumns, type PivotDisplayData } from '../../domain/pivot';
import { SIGMA_VALUES_ID } from '../../domain/models/types';

const MAX_COLUMNS = 100;

/** The table to show, or why it is not shown. */
export type PivotDisplayResult = PivotDisplayData | { error: string };

/**
 * Custom hook to build pivot display from query results
 * Handles display transformation, sorting, and column validation
 *
 * @param queryResult - The query result from usePivotCalculation (with cubeIndex attached)
 * @param executionConfig - The config that produced the queryResult
 * @param enrichedValues - Values with custom metric details merged in
 * @param sortConfig - How to sort the pivot table
 * @param collapsedColumns - columnPathKey of each collapsed column group
 */
export function usePivotDisplay(
  queryResult: any,
  executionConfig: any,
  enrichedValues: any[],
  sortConfig: any,
  collapsedColumns: string[] = []
): PivotDisplayResult | null {
  const lastDisplayRef = useRef<PivotDisplayResult | null>(null);

  return useMemo(() => {
    if (!queryResult || !executionConfig) return null;

    const { cubeResults, dtypes, fieldsHash: resultFieldsHash } = queryResult;

    // Compute order-independent hash of current fields
    const currentFieldsHash = [
      ...executionConfig.rows.map((f: any) => typeof f === 'string' ? f : f.id).filter((f: string) => f !== SIGMA_VALUES_ID),
      ...executionConfig.columns.map((f: any) => typeof f === 'string' ? f : f.id).filter((f: string) => f !== SIGMA_VALUES_ID)
    ].sort().join(',');

    // Check if dimensions changed (fields added/removed vs just rearranged)
    if (currentFieldsHash !== resultFieldsHash) {
      // Dimensions changed (fields added/removed) - don't rebuild until new query results
      return lastDisplayRef.current; // Return previous display
    }

    // Same fields, possibly rearranged - rebuild with current executionConfig
    const rowFieldNames = executionConfig.rows.map((f: any) => typeof f === 'string' ? f : f.id);
    const colFieldNames = executionConfig.columns.map((f: any) => typeof f === 'string' ? f : f.id);

    // Count the columns before the full build: a too-wide table is never built
    if (colFieldNames.some((f: string) => f !== SIGMA_VALUES_ID)) {
      const { subtotals = 'both', grandTotals = 'both' } = executionConfig;
      const columnCount = countDisplayColumns(cubeResults, rowFieldNames, colFieldNames, enrichedValues, collapsedColumns, {
        showColSubtotals: subtotals === 'col' || subtotals === 'both',
        showGrandTotalCol: grandTotals === 'col' || grandTotals === 'both'
      });
      if (columnCount > MAX_COLUMNS) {
        return {
          error: `Too many columns to display (${columnCount.toLocaleString()}). Maximum is ${MAX_COLUMNS}. Try adding filters, collapsing column groups or reducing column fields.`
        };
      }
    }

    const newDisplay = buildPivotDisplayData(
      cubeResults,
      rowFieldNames,
      colFieldNames,
      enrichedValues,
      sortConfig,
      dtypes,
      collapsedColumns
    );

    // Store for future comparisons
    lastDisplayRef.current = newDisplay;
    return newDisplay;
  }, [queryResult, queryResult?.revision, sortConfig, collapsedColumns, executionConfig?.rows, executionConfig?.columns, executionConfig?.subtotals, executionConfig?.grandTotals, enrichedValues]);
}
