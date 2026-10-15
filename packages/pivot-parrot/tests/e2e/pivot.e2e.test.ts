import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { DuckDBInstance } from '@duckdb/node-api';
import { buildCubeSQL } from '../../src/domain/query/sql/buildCubeSQL';
import { DuckDBDialect } from '../../src/domain/query/dialects/DuckDBDialect';
import { buildChartData } from '../../src/presentation/charts/chartUtils';
import { transformBarLineChart } from '../../src/presentation/charts/BarLineChart';
import { buildPivotDisplayData } from '../../src/domain/pivot/index';
import { buildPivotCSV } from '../../src/application/utils/export';
import { computeLeafColumns } from '../../src/application/utils/columnHelpers';

const CASES_DIR = join(__dirname, 'cases');
const dialect = new DuckDBDialect();

/**
 * Convert DuckDB-specific types to Arrow-like types
 * DuckDBDecimalValue → number (what toChartValue expects after Arrow deserialization)
 * BigInt → number
 */
function toArrowLikeValue(val: any): any {
  // DuckDBDecimalValue: {value: bigint, scale: number, width: number}
  if (val && typeof val === 'object' && 'value' in val && 'scale' in val) {
    return Number(val.value) / Math.pow(10, val.scale);
  }
  // BigInt → number
  if (typeof val === 'bigint') {
    return Number(val);
  }
  return val;
}

/**
 * Convert number to Uint32Array (Arrow Decimal128 representation)
 * This simulates what Apache Arrow JS returns for high-precision decimals
 */
function numberToUint32Array(num: number, scale: number): Uint32Array {
  const scaled = BigInt(Math.round(num * Math.pow(10, scale)));
  const arr = new Uint32Array(4); // 128-bit = 4 x 32-bit
  // Handle negative via two's complement
  let val = scaled < 0n ? scaled + (1n << 128n) : scaled;
  for (let i = 0; i < 4; i++) {
    arr[i] = Number(val & 0xFFFFFFFFn);
    val >>= 32n;
  }
  return arr;
}

/**
 * Convert DuckDB decimal to Uint32Array (simulating Arrow format)
 */
function toArrowFormat(val: any, typeName: string, schema: Record<string, string>): any {
  // DuckDBDecimalValue: {value: bigint, scale: number, width: number}
  if (val && typeof val === 'object' && 'value' in val && 'scale' in val) {
    const num = Number(val.value) / Math.pow(10, val.scale);
    return numberToUint32Array(num, val.scale);
  }
  // BigInt → number (int64 columns stay as numbers)
  if (typeof val === 'bigint') {
    return Number(val);
  }
  return val;
}

describe('Pivot E2E', () => {
  for (const dir of readdirSync(CASES_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;

    it(dir.name, async () => {
      const input = JSON.parse(readFileSync(join(CASES_DIR, dir.name, 'input.json'), 'utf-8'));
      const isChartTest = !!input.chartConfig;
      const expectedFile = isChartTest ? 'expected.json' : 'expected.csv';
      const expected = readFileSync(join(CASES_DIR, dir.name, expectedFile), 'utf-8').trim();

      const instance = await DuckDBInstance.create(':memory:');
      const conn = await instance.connect();

      const tmpJson = join(tmpdir(), `pivot_test_${Date.now()}.json`);
      writeFileSync(tmpJson, JSON.stringify(input.data));

      try {
        // Create table
        if (input.sqlTypes) {
          const cols = Object.entries(input.sqlTypes).map(([name, type]) => `"${name}" ${type}`).join(', ');
          await conn.run(`CREATE TABLE pivot_data (${cols})`);
          await conn.run(`INSERT INTO pivot_data SELECT * FROM read_json_auto('${tmpJson}')`);
        } else {
          await conn.run(`CREATE TABLE pivot_data AS SELECT * FROM read_json_auto('${tmpJson}')`);
        }

        // Run query (use CUBE for chart and pivotDisplay tests)
        const needsCube = isChartTest || input.pivotDisplay;
        const sql = buildCubeSQL(input.config, input.filters || [], input.schema, 'pivot_data', dialect, [], [], !needsCube);
        const reader = await conn.runAndReadAll(sql);
        const result = reader.getRows();
        const colNames = reader.columnNames();
        const colTypes = reader.columnTypes();

        // Build dtypes from result schema (like real app does)
        const dtypes: Record<string, string> = {};
        colNames.forEach((name, i) => {
          const colType = colTypes[i];
          // Check for decimal with precision/scale
          if (colType.typeId === 24 && typeof colType.scale === 'number') { // DECIMAL typeId
            dtypes[name] = `decimal<${colType.width},${colType.scale}>`;
          } else {
            dtypes[name] = dialect.detectArrowType(colType.toString());
          }
        });

        // Convert to objects with Arrow-like types
        const rows = result.map(row => {
          const obj: Record<string, any> = {};
          colNames.forEach((name, i) => {
            obj[name] = input.arrowFormat
              ? toArrowFormat(row[i], name, dtypes)
              : toArrowLikeValue(row[i]);
          });
          return obj;
        });

        if (isChartTest) {
          const chartData = buildChartData(rows, input.chartConfig, input.config, dtypes, dialect);
          const { traces } = transformBarLineChart(chartData, input.chartConfig);

          const expectedTraces = JSON.parse(expected);
          expect(traces.length).toBe(expectedTraces.length);
          traces.forEach((trace, i) => {
            expect(trace.x).toEqual(expectedTraces[i].x);
            expect(trace.y).toEqual(expectedTraces[i].y);
          });
        } else if (input.pivotDisplay) {
          // Test pivot display CSV (the visual pivot layout)
          const { rows: rowFields, columns: colFields, values } = input.config;
          const valueFields = values.map((v: any) => ({
            field: v.field,
            aggregation: v.aggregation,
            isCustom: v.isCustom
          }));

          const displayData = buildPivotDisplayData(
            rows,
            rowFields,
            colFields,
            valueFields,
            null, // sortConfig
            dtypes
          );

          // The leaf columns the app exports with (PivotDisplayHeader)
          const leafCols = computeLeafColumns(displayData);

          const csv = buildPivotCSV(
            displayData,
            leafCols,
            rowFields,
            false, // showRowSubtotals
            false, // showGrandTotal
            input.config
          );

          expect(csv).toBe(expected);
        } else {
          // Test raw cube results
          const header = expected.split('\n')[0].split(',');
          const csv = [header.join(','), ...rows.map(r => header.map(h => r[h]).join(',')).sort()].join('\n');
          expect(csv).toBe(expected);
        }
      } finally {
        try { unlinkSync(tmpJson); } catch {}
      }
    });
  }
});
