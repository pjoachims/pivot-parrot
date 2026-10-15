import { describe, it, expect } from 'vitest';
import { DuckDBInstance } from '@duckdb/node-api';
import { buildPivotSQL } from '../../src/domain/query/sql/buildPivotSQL';
import { DuckDBDialect } from '../../src/domain/query/dialects/DuckDBDialect';

const region = { id: 'region', name: 'region', dtype: 'string', kind: 'base_field' };
const category = { id: 'category', name: 'category', dtype: 'string', kind: 'base_field' };
const types = { region: 'string', category: 'string', sales: 'int32' };

async function runPivot(filterType: 'less' | 'greater', value: number) {
  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  await conn.run(`CREATE TABLE pivot_data AS SELECT * FROM (VALUES
    ('A', 'x', 30), ('A', 'y', 500),
    ('B', 'x', 20), ('B', 'y', 40),
    (NULL, 'x', 7), (NULL, 'y', 300)
  ) t(region, category, sales)`);

  const config = {
    rows: [region],
    columns: [category],
    values: [{ field: 'sales', aggregation: 'Sum' }],
    filters: [{ field: 'SUM_sales', filterType: 'having', aggregation: 'Sum', sourceField: 'sales', type: filterType, value }]
  };
  const { sql } = buildPivotSQL({ config, dialect: new DuckDBDialect(), availableFields: [region, category], detectedTypes: types });
  const rows = (await conn.runAndReadAll(sql)).getRowObjectsJson() as any[];

  // Keyed by grouping level so a NULL member and a total row stay distinct
  const cell = new Map(rows.map(r => {
    const reg = r._grouping_region ? '(all)' : String(r.region);
    const cat = r._grouping_category ? '(all)' : String(r.category);
    return [`${reg}|${cat}`, Number(r.sum_sales)];
  }));
  return Object.fromEntries([...cell.entries()].sort());
}

describe('HAVING under CUBE filters leaves, totals sum the surviving leaves', () => {
  it('SUM < 100 keeps the NULL region and totals only what survived', async () => {
    expect(await runPivot('less', 100)).toEqual({
      'A|x': 30,
      'B|x': 20,
      'B|y': 40,
      'null|x': 7,
      'A|(all)': 30,
      'B|(all)': 60,
      'null|(all)': 7,
      '(all)|x': 57,
      '(all)|y': 40,
      '(all)|(all)': 97
    });
  });

  it('SUM > 100 leaves filtered-out children out of the subtotals', async () => {
    expect(await runPivot('greater', 100)).toEqual({
      'A|y': 500,
      'null|y': 300,
      'A|(all)': 500,
      'null|(all)': 300,
      '(all)|y': 800,
      '(all)|(all)': 800
    });
  });
});

it('HAVING over an expression dimension binds the leaf match to the outer row', async () => {
  const instance = await DuckDBInstance.create(':memory:');
  const conn = await instance.connect();
  await conn.run(`CREATE TABLE pivot_data AS SELECT * FROM (VALUES
    ('A', 30), ('B', 500), ('C', 20), (NULL, 7)
  ) t(region, sales)`);
  const config = {
    rows: ['bucket'],
    columns: [],
    values: [{ field: 'sales', aggregation: 'Sum' }],
    customGroupings: [{ id: 'bucket', name: 'Bucket', expr: "CASE WHEN region IN ('A', 'B') THEN 'AB' END" }],
    filters: [{ field: 'SUM_sales', filterType: 'having', aggregation: 'Sum', sourceField: 'sales', type: 'less', value: 100 }]
  };
  const { sql } = buildPivotSQL({ config, dialect: new DuckDBDialect(), availableFields: [region], detectedTypes: types });
  const rows = (await conn.runAndReadAll(sql)).getRowObjectsJson() as any[];
  // AB = 530 is filtered out; the NULL bucket (C + NULL region = 27) survives and is the total
  expect(rows.map(r => [r._grouping_bucket, r.bucket, Number(r.sum_sales)]).sort()).toEqual([
    [0, null, 27],
    [1, null, 27]
  ]);
});
