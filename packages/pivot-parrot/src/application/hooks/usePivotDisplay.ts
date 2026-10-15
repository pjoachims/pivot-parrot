import { useMemo, useRef } from 'react';
import { buildPivotDisplayData } from '../../domain/pivot';
import { SIGMA_VALUES_ID } from '../../domain/models/types';

/**
 * Custom hook to build pivot display from query results
 * Handles display transformation, sorting, and column validation
 *
 * @param queryResult - The query result from usePivotCalculation (with cubeIndex attached)
 * @param executionConfig - The config that produced the queryResult
 * @param enrichedValues - Values with custom metric details merged in
 * @param sortConfig - How to sort the pivot table
 */
export function usePivotDisplay(
  queryResult: any,
  executionConfig: any,
  enrichedValues: any[],
  sortConfig: any
) {
  const lastDisplayRef = useRef<any>(null);

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

    // Check column count BEFORE building display
    const MAX_COLUMNS = 100;
    if (colFieldNames.length > 0) {
      const uniqueColCombos = new Set();
      cubeResults.forEach((row: any) => {
        const colKey = colFieldNames.map((field: string) => row[field]).join('|');
        uniqueColCombos.add(colKey);
      });

      const metricsPerMember = rowFieldNames.includes(SIGMA_VALUES_ID) ? 1 : enrichedValues.length;
      const estimatedColumns = uniqueColCombos.size * metricsPerMember;
      if (estimatedColumns > MAX_COLUMNS) {
        // Return error object instead of throwing (prevents React crash)
        return {
          error: `Too many columns to display (~${estimatedColumns.toLocaleString()}). Maximum is ${MAX_COLUMNS}. Try adding filters or reducing column fields.`
        };
      }
    }

    const newDisplay = buildPivotDisplayData(
      cubeResults,
      rowFieldNames,
      colFieldNames,
      enrichedValues,
      sortConfig,
      dtypes
    );

    // Store for future comparisons
    lastDisplayRef.current = newDisplay;
    return newDisplay;
  }, [queryResult, queryResult?.revision, sortConfig, executionConfig?.rows, executionConfig?.columns, enrichedValues]);
}
