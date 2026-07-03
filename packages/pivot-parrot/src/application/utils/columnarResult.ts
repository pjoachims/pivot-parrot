/**
 * Columnar result adapter
 *
 * DuckDB WASM hands back an Arrow Table that is already columnar. Remote
 * engines hand back a plain rows array. Views (DrilldownView, SQLPlayground)
 * shouldn't care which one they got - they just want to read a value by
 * (row, column). This adapter gives both shapes the same tiny interface so
 * the Arrow path never has to be flattened into per-row objects just to be
 * displayed.
 */

import type { ArrowType } from '../../domain/types/ArrowTypes';

export interface ColumnarResult {
  numRows: number;
  columnNames: string[];
  dtypes: Record<string, string>;
  getValue: (row: number, col: string) => any;
}

interface RawQueryResult {
  table?: any;       // Apache Arrow Table (local engine, format: 'arrow')
  data?: any[];       // Row objects (remote engine, or row-shaped queries)
  dtypes?: Record<string, string>;
}

/**
 * Adapt an engine query result (either an Arrow Table or a rows array) into
 * a uniform columnar accessor.
 */
export function adaptQueryResult(result: RawQueryResult | null | undefined): ColumnarResult {
  const dtypes = result?.dtypes || {};

  if (result?.table) {
    const table = result.table;
    const columnNames: string[] = table.schema.fields.map((f: any) => f.name);

    // Cache child vectors per column so repeated cell reads don't re-look-up
    // the vector every time - memory stays columnar either way.
    const children = new Map<string, any>();
    const getChild = (col: string) => {
      if (!children.has(col)) {
        children.set(col, table.getChild(col));
      }
      return children.get(col);
    };

    return {
      numRows: table.numRows,
      columnNames,
      dtypes,
      getValue: (row, col) => getChild(col)?.get(row) ?? null
    };
  }

  const rows = result?.data || [];
  const columnNames = rows.length > 0 ? Object.keys(rows[0]) : Object.keys(dtypes);

  return {
    numRows: rows.length,
    columnNames,
    dtypes,
    getValue: (row, col) => rows[row]?.[col] ?? null
  };
}

/**
 * Materialize a plain rows array from a columnar result. Only use this where
 * a real array is unavoidable (CSV export, snapshot serialization, small SQL
 * history samples) - pass `limit` to only materialize the first few rows.
 */
export function toRows(result: ColumnarResult, limit?: number): Record<string, any>[] {
  const n = limit !== undefined ? Math.min(limit, result.numRows) : result.numRows;
  const rows: Record<string, any>[] = [];
  for (let i = 0; i < n; i++) {
    const row: Record<string, any> = {};
    for (const col of result.columnNames) {
      row[col] = result.getValue(i, col);
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Convert a raw Arrow-flavored cell value for ag-grid display/filtering.
 * Shared by DrilldownView and SQLPlayground so both grids get the same
 * temporal/BigInt handling the old whole-dataset transform pass used to do,
 * just applied lazily per rendered cell instead of eagerly over every row.
 * `arrowType` should be resolved once per column (via getArrowType), not per cell.
 */
export function convertForGrid(val: any, arrowType: ArrowType | null): any {
  if (val === null || val === undefined) return val;

  // Temporal types → Date object (ag-grid handles formatting/filtering natively)
  if (arrowType?.category === 'temporal') {
    return new Date(val as number);
  }

  // BigInt → Number (so ag-grid number filter works), falling back to String
  // for values outside the safe integer range
  if (typeof val === 'bigint') {
    return val <= Number.MAX_SAFE_INTEGER && val >= Number.MIN_SAFE_INTEGER
      ? Number(val)
      : String(val);
  }

  return val;
}
