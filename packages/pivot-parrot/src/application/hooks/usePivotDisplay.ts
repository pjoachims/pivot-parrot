import { useMemo, useRef } from 'react';
import { buildPivotDisplayData, countDisplayColumns, type PivotDisplayData } from '../../domain/pivot';
import { columnGroups } from '../../domain/pivot/columnBuilder';
import { fitColumns, expandGroup, type ColumnFolds } from '../../domain/pivot/columnFit';
import { SIGMA_VALUES_ID } from '../../domain/models/types';

const MAX_COLUMNS = 100;

/** How the table's column groups were folded to fit MAX_COLUMNS. */
export interface ColumnFitView {
  /** columnPathKey of each folded group: the user's and `autoCollapsed` */
  collapsed: string[];
  /** columnPathKey of each group folded to fit */
  autoCollapsed: string[];
  limit: number;
  /** The user's choices once they open `group`, or null when the table cannot show it open. */
  expand: (group: unknown[]) => ColumnFolds | null;
}

/** The table to show, or why it is not shown. */
export type PivotDisplayResult = (PivotDisplayData & { columnFit?: ColumnFitView }) | { error: string };

/**
 * Custom hook to build pivot display from query results
 * Handles display transformation, sorting, and column validation
 *
 * @param queryResult - The query result from usePivotCalculation (with cubeIndex attached)
 * @param executionConfig - The config that produced the queryResult
 * @param enrichedValues - Values with custom metric details merged in
 * @param sortConfig - How to sort the pivot table
 * @param collapsedColumns - columnPathKey of each column group the user collapsed
 * @param expandedColumns - columnPathKey of each column group the user opened
 */
export function usePivotDisplay(
  queryResult: any,
  executionConfig: any,
  enrichedValues: any[],
  sortConfig: any,
  collapsedColumns: string[] = [],
  expandedColumns: string[] = []
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

    // Fit the columns before the full build: a too-wide table is never built
    let collapsed = collapsedColumns;
    let columnFit: ColumnFitView | undefined;
    const dimColFields = colFieldNames.filter((f: string) => f !== SIGMA_VALUES_ID);
    if (dimColFields.length > 0) {
      const { subtotals = 'both', grandTotals = 'both' } = executionConfig;
      const visibility = {
        showColSubtotals: subtotals === 'col' || subtotals === 'both',
        showGrandTotalCol: grandTotals === 'col' || grandTotals === 'both'
      };
      const countColumns = (folded: Set<string>) =>
        countDisplayColumns(cubeResults, rowFieldNames, colFieldNames, enrichedValues, folded, visibility);
      const groups = columnGroups(cubeResults, dimColFields);
      const folds = { collapsed: collapsedColumns, expanded: expandedColumns };
      const fit = fitColumns(groups, folds, MAX_COLUMNS, countColumns);
      if ('error' in fit) {
        const folded = groups.length > 0 ? ' with every column group collapsed' : '';
        return {
          error: `Too many columns to display: ${fit.columnCount.toLocaleString()}${folded}. Maximum is ${MAX_COLUMNS}. Add a filter, move a column field to Rows or remove a value.`
        };
      }
      collapsed = fit.collapsed;
      columnFit = {
        collapsed: fit.collapsed,
        autoCollapsed: fit.autoCollapsed,
        limit: MAX_COLUMNS,
        expand: group => expandGroup(groups, folds, group, MAX_COLUMNS, countColumns)
      };
    }

    const newDisplay = {
      ...buildPivotDisplayData(
        cubeResults,
        rowFieldNames,
        colFieldNames,
        enrichedValues,
        sortConfig,
        dtypes,
        collapsed
      ),
      columnFit
    };

    // Store for future comparisons
    lastDisplayRef.current = newDisplay;
    return newDisplay;
  }, [queryResult, queryResult?.revision, sortConfig, collapsedColumns, expandedColumns, executionConfig?.rows, executionConfig?.columns, executionConfig?.subtotals, executionConfig?.grandTotals, enrichedValues]);
}
