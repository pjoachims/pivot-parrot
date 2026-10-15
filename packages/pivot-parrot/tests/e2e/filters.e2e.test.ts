import { describe, it, expect, beforeAll } from 'vitest';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { DuckDBDialect } from '../../src/domain/query/dialects/DuckDBDialect';
import { DatabricksDialect } from '../../src/domain/query/dialects/DatabricksDialect';
import { buildFilter } from '../../src/domain/query/sql/filters';
import { buildPivotSQL } from '../../src/domain/query/sql/buildPivotSQL';
import { fromSchema, createDerived } from '../../src/domain/field/FieldItem';

const dialect = new DuckDBDialect();
let conn: DuckDBConnection;

beforeAll(async () => {
  const instance = await DuckDBInstance.create(':memory:');
  conn = await instance.connect();
  await conn.run(`CREATE TABLE pivot_data AS SELECT * FROM (VALUES
    ('A', '01234', 10.50::DECIMAL(10,2), DATE '2024-01-01', 'c1', 5),
    ('B', '1234',  20.00::DECIMAL(10,2), DATE '2025-01-01', 'c2', 200),
    (NULL, '00001', 5.00::DECIMAL(10,2), DATE '2025-01-01', 'c3', 50)
  ) t(region, zip, price, order_date, customer, qty)`);
});

const fields = [
  fromSchema({ name: 'region', type: 'string' }),
  fromSchema({ name: 'zip', type: 'string' }),
  fromSchema({ name: 'price', type: 'decimal<10,2>' }),
  fromSchema({ name: 'order_date', type: 'date32' }),
  fromSchema({ name: 'customer', type: 'string' }),
  fromSchema({ name: 'qty', type: 'int32' }),
];
const types = Object.fromEntries(fields.map(f => [f.id, f.dtype]));

async function select(column: string, where: string): Promise<unknown[]> {
  const reader = await conn.runAndReadAll(`SELECT ${column} FROM pivot_data WHERE ${where} ORDER BY ${column}`);
  return reader.getRows().map(r => r[0]);
}

const whereOf = (filter: Record<string, unknown>) => buildFilter(filter).toSQL(dialect) as string;

async function pivot(config: Record<string, unknown>, availableFields = fields) {
  const { sql } = buildPivotSQL({
    config: { rows: [], columns: [], ...config } as any,
    dialect,
    availableFields,
    detectedTypes: types,
    disableSubtotals: true,
  });
  const reader = await conn.runAndReadAll(sql);
  return reader.getRowObjectsJson();
}

describe('filter values are quoted by type, not by content', () => {
  it('one_of a numeric-looking string matches only that string', async () => {
    expect(await select('zip', whereOf({ field: 'zip', type: 'one_of', selectedValues: ['01234'] }))).toEqual(['01234']);
  });

  it('equal a numeric-looking string matches only that string', async () => {
    expect(await select('zip', whereOf({ field: 'zip', type: 'equal', value: '1234' }))).toEqual(['1234']);
  });

  // Databricks (ANSI) casts a string literal to the int column's type: '49.5' would fail there.
  it('a typed-in number on a numeric field is emitted as a number', async () => {
    const config = { rows: ['region'], columns: [], values: [{ field: 'qty', aggregation: 'Sum' }], filters: [{ field: 'qty', type: 'greater', value: '49.5' }] } as any;
    const { sql } = buildPivotSQL({ config, dialect: new DatabricksDialect(), availableFields: fields, detectedTypes: types });
    expect(sql).toContain('(qty > 49.5)');
    const rows = await pivot(config);
    expect(rows.map(r => r.region).sort()).toEqual(['B', null]);
  });
});

describe('drilldown on a decimal dimension', () => {
  it('matches a number value', async () => {
    const where = dialect.buildWhereClause([{ field: 'price', value: 10.5, typeName: 'decimal<10,2>' }]);
    expect(await select('zip', where)).toEqual(['01234']);
  });

  it('matches an Arrow Decimal128 value (Uint32Array, scaled by 10^2)', async () => {
    const where = dialect.buildWhereClause([{ field: 'price', value: new Uint32Array([1050, 0, 0, 0]), typeName: 'decimal<10,2>' }]);
    expect(await select('zip', where)).toEqual(['01234']);
  });
});

describe('excluding values keeps the blanks', () => {
  it.each([
    ['not one_of', { type: 'one_of', selectedValues: ['A'] }],
    ['not equal', { type: 'equal', value: 'A' }],
    ['not contains', { type: 'contains', value: 'A' }],
    ['not starts_with', { type: 'starts_with', value: 'A' }],
    ['not ends_with', { type: 'ends_with', value: 'A' }],
    ['not less_equal', { type: 'less_equal', value: 'A' }],
  ])('%s', async (_label, filter) => {
    expect(await select('region', whereOf({ field: 'region', isNot: true, ...filter }))).toEqual(['B', null]);
  });

  it.each([
    ['not greater', 'greater', 49], ['not less', 'less', 49], ['not less_equal', 'less_equal', 50],
  ])('%s on a number keeps NULL', async (_label, type, value) => {
    await conn.run(`CREATE OR REPLACE TEMP VIEW nums AS SELECT * FROM (VALUES (1), (100), (NULL)) t(n)`);
    const where = buildFilter({ field: 'n', type, value, isNot: true }).toSQL(dialect);
    const reader = await conn.runAndReadAll(`SELECT count(*) FROM nums WHERE ${where}`);
    expect(Number(reader.getRows()[0][0])).toBe(2);
  });

  it('excluding the blank entry itself drops the NULL rows', async () => {
    expect(await select('region', whereOf({ field: 'region', type: 'one_of', selectedValues: ['A', null], isNot: true }))).toEqual(['B']);
  });

  it('including the blank entry matches the NULL rows', async () => {
    expect(await select('region', whereOf({ field: 'region', type: 'one_of', selectedValues: ['A', null] }))).toEqual(['A', null]);
  });
});

describe('regex filter on DuckDB', () => {
  it('matches', async () => {
    expect(await select('region', whereOf({ field: 'region', type: 'regex', value: '^A' }))).toEqual(['A']);
  });

  it('negated keeps the blanks', async () => {
    expect(await select('region', whereOf({ field: 'region', type: 'regex', value: '^A', isNot: true }))).toEqual(['B', null]);
  });
});
