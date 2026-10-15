import { it, expect } from 'vitest';
import { DuckDBInstance } from '@duckdb/node-api';
import { buildPivotSQL } from '../../src/domain/query/sql/buildPivotSQL';
import { DuckDBDialect } from '../../src/domain/query/dialects/DuckDBDialect';

it('a derived field whose formula references another derived field works as a row dimension', async () => {
  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  await conn.run(`CREATE TABLE pivot_data AS SELECT * FROM (VALUES
    (DATE '2023-05-01', 10), (DATE '2024-02-01', 20), (DATE '2024-07-01', 5)
  ) t(order_date, sales)`);
  const availableFields = [
    { id: 'order_date', name: 'order_date', dtype: 'date32', kind: 'base_field' },
    { id: 'order_year', name: 'Year', dtype: 'int64', kind: 'derived_field', formula: 'YEAR("order_date")' },
    { id: 'next_year', name: 'Next year', dtype: 'int64', kind: 'derived_field', formula: '{{order_year}} + 1' }
  ] as any[];
  const config: any = {
    rows: ['next_year'],
    columns: [],
    values: [{ field: 'sales', aggregation: 'Sum' }],
    filters: []
  };
  const { sql } = buildPivotSQL({ config, dialect: new DuckDBDialect(), availableFields, detectedTypes: { sales: 'int32' } });
  const rows = (await conn.runAndReadAll(sql)).getRowObjectsJson() as any[];
  const byYear = Object.fromEntries(rows.map(r => [r._grouping_next_year ? 'total' : String(r.next_year), Number(r.sum_sales)]));
  expect(byYear).toEqual({ '2024': 10, '2025': 25, total: 35 });
});
