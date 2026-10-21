/**
 * Main orchestrator for building pivot display data
 * Coordinates column building, row building, and value population
 */

import { toMetricKey, toMetricLabel } from './utils';
import { buildColumnOutline, buildColumnTree, columnGroups } from './columnBuilder';
import { buildRowTree } from './rowBuilder';
import { populateNodeValues } from './valuePopulator';
import { buildCubeIndex, createCellHash, lookupCubeValue } from '../../application/utils/cubeIndex';
import { profiler } from '../query/utils/profiler';
import { SIGMA_VALUES_ID } from '../models/types';

/**
 * Sort each level of the row tree by one value, in place. `sortValue` gives a
 * node's value in the sorted column. The level of metric rows
 * (Σ Values in rows, `metricDepth`) keeps the order of the Values zone.
 */
function sortRowTree(nodes, direction, sortValue, metricDepth) {
  if (nodes.length > 0 && nodes[0].depth !== metricDepth) {
    nodes.sort((a, b) => {
      const aVal = sortValue(a);
      const bVal = sortValue(b);

      // Missing values go to the end
      if ((aVal === null || aVal === undefined) && (bVal === null || bVal === undefined)) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        const diff = aVal - bVal;
        return direction === 'asc' ? diff : -diff;
      }

      if (typeof aVal === 'bigint' && typeof bVal === 'bigint') {
        return direction === 'asc' ? (aVal < bVal ? -1 : aVal > bVal ? 1 : 0) : (bVal < aVal ? -1 : bVal > aVal ? 1 : 0);
      }

      const strA = String(aVal);
      const strB = String(bVal);
      return direction === 'asc' ? strA.localeCompare(strB, undefined, { numeric: true }) : strB.localeCompare(strA, undefined, { numeric: true });
    });
  }

  nodes.forEach(node => {
    if (node.children && node.children.length > 0) {
      sortRowTree(node.children, direction, sortValue, metricDepth);
    }
  });
}

export interface PivotDisplayData {
  columnConfig: {
    colFields: string[];
    hierarchy: any[];
    valueFields: string[];
    valuesIndex?: number;
    valuesInRows?: boolean;
    groups: unknown[][];
  };
  rowGroups: any[];
  grandTotal: any;
  cubeIndex?: Map<string, any>;
  _columnOutline?: any[];
}

/**
 * How many columns buildPivotDisplayData lays out for these arguments, less
 * the subtotal and grand total columns the table hides. It builds only the
 * column outline, so it is cheap next to the build, which fills every cell.
 */
export function countDisplayColumns(
  sqlRows, rowFields, colFields, valueFields, collapsedColumns: Iterable<string>,
  { showColSubtotals, showGrandTotalCol }: { showColSubtotals: boolean; showGrandTotalCol: boolean }
): number {
  const outline = buildColumnOutline(
    sqlRows,
    colFields.filter(f => f !== SIGMA_VALUES_ID),
    valueFields,
    colFields.indexOf(SIGMA_VALUES_ID),
    rowFields.includes(SIGMA_VALUES_ID),
    {},
    new Set(collapsedColumns)
  );
  return outline.filter(col => {
    if (col.path.length === 0 && (col.isSubtotal || col.isGrandTotal)) return showGrandTotalCol;
    return !col.isSubtotal || showColSubtotals;
  }).length;
}

/**
 * Main entry point: Build pivot display data using long-to-wide transformation
 *
 * @param {Array<Object>} sqlRows - SQL CUBE results
 * @param {Array<string>} rowFields - Row dimension fields (may include 'Σ Values')
 * @param {Array<string>} colFields - Column dimension fields (may include 'Σ Values')
 * @param {Array<Object>} valueFields - Value field configurations
 * @param {Object} sortConfig - Sort configuration { valueKey, direction, columnPath? }
 * @param {Object} dtypes - Column name → engine type name mapping
 * @param {Iterable<string>} collapsedColumns - columnPathKey of each collapsed column group
 * @returns {Object} Pivot display data structure
 */
export function buildPivotDisplayData(sqlRows, rowFields, colFields, valueFields, sortConfig = null, dtypes = {}, collapsedColumns = []): PivotDisplayData {
  return profiler.profile('buildPivotDisplayData', () => {
    if (!sqlRows?.length) {
      return {
        columnConfig: { colFields: [], hierarchy: [], valueFields: [], groups: [] },
        rowGroups: [],
        grandTotal: null
      };
    }

    // Determine where Values appear
    const rowValuesIndex = rowFields.indexOf(SIGMA_VALUES_ID);
    const colValuesIndex = colFields.indexOf(SIGMA_VALUES_ID);
    const valuesInRows = rowValuesIndex !== -1;

    const actualRowFields = rowFields.filter(f => f !== SIGMA_VALUES_ID);
    const actualColFields = colFields.filter(f => f !== SIGMA_VALUES_ID);

    // Build hash index for O(1) lookups (order-independent)
    const allFields = [...actualRowFields, ...actualColFields];

    // Check if index is cached on sqlRows (attached by PivotCalculator)
    const cubeIndex = sqlRows._cubeIndex || profiler.profile('buildCubeIndex', () =>
      buildCubeIndex(sqlRows, allFields)
    );

    // 1. Build column outline (flat, for value indexing)
    const columnOutline = profiler.profile('buildColumnOutline', () =>
      buildColumnOutline(
        sqlRows,
        actualColFields,
        valueFields,
        colValuesIndex,
        valuesInRows,
        dtypes,
        new Set(collapsedColumns)
      )
    );

    // 1b. Build column tree (hierarchical, for headers)
    const columnTree = profiler.profile('buildColumnTree', () =>
      buildColumnTree(
        columnOutline,
        actualColFields,
        valueFields,
        colValuesIndex,
        valuesInRows
      )
    );

    // 2. Build row tree
    const rowTree = profiler.profile('buildRowTree', () =>
      buildRowTree(
        sqlRows,
        actualRowFields,
        valueFields,
        rowValuesIndex,
        dtypes
      )
    );

    // 3. Populate values arrays using hash index
    profiler.profile('populateNodeValues', () =>
      populateNodeValues(
        rowTree,
        sqlRows,
        actualRowFields,
        columnOutline,
        actualColFields,
        rowValuesIndex,
        rowFields,  // Pass original rowFields with Σ Values
        cubeIndex,  // Pass hash index for O(1) lookups
        dtypes
      )
    );

    // 3b. Sort row tree if sortConfig is provided
    if (sortConfig && sortConfig.valueKey) {
      const sortValue = node => {
        const dimPath = valuesInRows ? node.path.filter((_, i) => i !== rowValuesIndex) : node.path;
        const hash = createCellHash(dimPath, actualRowFields, sortConfig.columnPath ?? [], actualColFields);
        return lookupCubeValue(cubeIndex, hash, sortConfig.valueKey);
      };
      profiler.profile('sortRowTree', () =>
        sortRowTree(rowTree, sortConfig.direction, sortValue, rowValuesIndex)
      );
    }

    // 4. Build grand total row(s) (all row dimensions aggregated)
    // When values in rows: create separate grand total row per metric
    // When values in columns: create single grand total row
    let grandTotalRow = null;

    if (valuesInRows) {
      // Multiple grand total rows, one per metric
      grandTotalRow = profiler.profile('buildGrandTotal', () =>
        valueFields.map(vf => {
          const metric = toMetricKey(vf);
          const values = columnOutline.map((col) => {
            const hash = createCellHash([], actualRowFields, col.path, actualColFields);
            return lookupCubeValue(cubeIndex, hash, metric);
          });
          return {
            metric,
            metricLabel: toMetricLabel(vf),
            values
          };
        })
      );
    } else {
      // Single grand total row
      grandTotalRow = profiler.profile('buildGrandTotal', () =>
        columnOutline.map((col) => {
          const hash = createCellHash([], actualRowFields, col.path, actualColFields);
          return lookupCubeValue(cubeIndex, hash, col.metric);
        })
      );
    }

    // Return in format compatible with PivotDisplay
    return {
      columnConfig: {
        colFields: actualColFields,
        hierarchy: columnTree,  // Hierarchical tree for headers
        valueFields: valueFields.map(toMetricKey),
        valuesIndex: colValuesIndex,  // Position of Σ Values among the column fields, -1 if not in columns
        valuesInRows,
        groups: columnGroups(sqlRows, actualColFields)  // Column groups that can collapse
      },
      rowGroups: rowTree,
      grandTotal: grandTotalRow,
      cubeIndex,  // Return index for caching!
      _columnOutline: columnOutline  // Keep flat outline for debugging
    };
  });
}
