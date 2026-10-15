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

describe('LIKE filters match special characters literally', () => {
  const notes = async (filter: Record<string, unknown>) => {
    await conn.run(`CREATE OR REPLACE TEMP VIEW notes AS SELECT * FROM (VALUES ('O''Brien_50%'), ('O''Brien 50'), ('a\\b'), ('x!y'), ('xy')) t(note)`);
    const reader = await conn.runAndReadAll(`SELECT note FROM notes WHERE ${whereOf({ field: 'note', ...filter })} ORDER BY note`);
    return reader.getRows().map(r => r[0]);
  };

  it('% and _', async () => {
    expect(await notes({ type: 'contains', value: "'Brien_50%" })).toEqual(["O'Brien_50%"]);
  });

  it('a backslash', async () => {
    expect(await notes({ type: 'ends_with', value: '\\b' })).toEqual(['a\\b']);
  });

  it('the escape character itself', async () => {
    expect(await notes({ type: 'starts_with', value: 'x!' })).toEqual(['x!y']);
  });
});

describe('Databricks string literals', () => {
  const databricks = new DatabricksDialect();

  it('escape backslashes and quotes with a backslash', () => {
    expect(buildFilter({ field: 'path', type: 'equal', value: "C:\\O'Brien\\" }).toSQL(databricks))
      .toBe("path = 'C:\\\\O\\'Brien\\\\'");
  });

  it('LIKE patterns use ! as the escape character', () => {
    expect(buildFilter({ field: 'Kunde Name', type: 'contains', value: "O'Brien_50%!\\" }).toSQL(databricks))
      .toBe("`Kunde Name` LIKE '%O\\'Brien!_50!%!!\\\\%' ESCAPE '!'");
  });

  it('typed drilldown values on a string field', () => {
    expect(databricks.buildWhereClause([{ field: 'path', value: 'C:\\', typeName: 'string' }]))
      .toBe("(path = 'C:\\\\')");
  });
});

describe('HAVING on multi-word aggregations', () => {
  const having = (aggregation: string, field: string, type: string, value: number) => ({
    values: [{ field, aggregation }],
    filters: [{ field: `${aggregation.toUpperCase()}_${field}`, filterType: 'having', aggregation, sourceField: field, type, value }],
  });

  it('Count Distinct', async () => {
    const rows = await pivot({ rows: ['region'], ...having('Count Distinct', 'customer', 'greater', 0) });
    expect(rows.map(r => r.region).sort()).toEqual(['A', 'B', null]);
  });

  it('Std Dev', async () => {
    expect(await pivot(having('Std Dev', 'qty', 'greater', 100))).toHaveLength(1);
    expect(await pivot(having('Std Dev', 'qty', 'greater', 110))).toHaveLength(0);
  });
});

describe('HAVING on a custom metric', () => {
  const customMetrics = [
    { id: 'm_qty', name: 'Qty', expr: 'sum(qty)' },
    { id: 'm_double', name: 'Double', expr: '{{ m_qty }} * 2' },
  ];
  const havingOnDouble = (formula: string) => pivot({
    rows: ['region'],
    values: [{ field: 'm_double', aggregation: 'custom', isCustom: true, expr: customMetrics[1].expr }],
    customMetrics,
    filters: [{ field: 'm_double', filterType: 'having', formula, type: 'greater', value: 100 }],
  });

  it('resolves a reference to another metric as the SELECT does', async () => {
    expect((await havingOnDouble(customMetrics[1].expr)).map(r => r.region)).toEqual(['B']);
  });

  it('uses the metric as it is now, not as it was when the filter was added', async () => {
    expect((await havingOnDouble('{{ m_qty }} * 1000')).map(r => r.region)).toEqual(['B']);
  });
});

describe('derived fields and custom groupings as filters', () => {
  const year = createDerived({ id: 'order_date_year', name: 'Year', dtype: 'int32', sourceField: 'order_date', formula: 'YEAR("order_date")' });
  const withYear = [...fields, year];
  const regions = (rows: Record<string, unknown>[]) => rows.map(r => r.region).sort();

  it('WHERE on a derived field uses its formula', async () => {
    const rows = await pivot({
      rows: ['region'],
      values: [{ field: 'qty', aggregation: 'Sum' }],
      filters: [{ field: 'order_date_year', type: 'one_of', selectedValues: [2024] }],
    }, withYear);
    expect(regions(rows)).toEqual(['A']);
  });

  it('a typed-in number on a derived field compares as a number', async () => {
    const rows = await pivot({
      rows: ['region'],
      values: [{ field: 'qty', aggregation: 'Sum' }],
      filters: [{ field: 'order_date_year', type: 'greater', value: '2024' }],
    }, withYear);
    expect(regions(rows)).toEqual(['B', null]);
  });

  it('a custom expression on a derived field substitutes {{field}}', async () => {
    const rows = await pivot({
      rows: ['region'],
      values: [{ field: 'qty', aggregation: 'Sum' }],
      filters: [{ field: 'order_date_year', type: 'custom_expr', value: '{{field}} = 2024' }],
    }, withYear);
    expect(regions(rows)).toEqual(['A']);
  });

  it('WHERE on a custom grouping that references a derived field', async () => {
    const rows = await pivot({
      rows: ['region'],
      values: [{ field: 'qty', aggregation: 'Sum' }],
      customGroupings: [{ id: 'era', name: 'Era', expr: "CASE WHEN {{order_date_year}} < 2025 THEN 'old' ELSE 'new' END" }],
      filters: [{ field: 'era', type: 'equal', value: 'new' }],
    }, withYear);
    expect(regions(rows)).toEqual(['B', null]);
  });

  it('HAVING on an aggregate of a derived field uses its formula', async () => {
    const rows = await pivot({
      rows: ['region'],
      values: [{ field: 'order_date_year', aggregation: 'Max' }],
      filters: [{ field: 'MAX_order_date_year', filterType: 'having', aggregation: 'Max', sourceField: 'order_date_year', type: 'greater', value: 2024 }],
    }, withYear);
    expect(regions(rows)).toEqual(['B', null]);
  });
});
