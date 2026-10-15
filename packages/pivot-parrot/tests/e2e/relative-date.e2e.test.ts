import { describe, it, expect, beforeAll } from 'vitest';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { DuckDBDialect } from '../../src/domain/query/dialects/DuckDBDialect';
import { DatabricksDialect } from '../../src/domain/query/dialects/DatabricksDialect';
import { buildFilter } from '../../src/domain/query/sql/filters';
import { buildPivotSQL } from '../../src/domain/query/sql/buildPivotSQL';

const dialect = new DuckDBDialect();
let conn: DuckDBConnection;

// Every anchor is derived from DuckDB's current_date with functions the filter does not
// emit (isodow, day, quarter, make_date, last_day), so the tests run on the real "today"
// and still check each period boundary on whatever calendar day they run.
const ANCHORS: Record<string, string> = {
  today: 't', yesterday: 't - 1', today_minus_2: 't - 2', today_minus_6: 't - 6',
  today_minus_7: 't - 7', today_minus_8: 't - 8', tomorrow: 't + 1',
  mon: 'mon', sun: 'mon + 6', next_mon: 'mon + 7',
  prev_sun: 'mon - 1', prev_mon: 'mon - 7', prev2_sun: 'mon - 8',
  m_first: 'mstart(t)', m_last: 'last_day(t)', next_m_first: 'last_day(t) + 1',
  prev_m_last: 'mstart(t) - 1', prev_m_first: 'mstart(mstart(t) - 1)', prev2_m_last: 'mstart(mstart(t) - 1) - 1',
  q_first: 'qstart(t)', q_last: 'qstart(qstart(t) + 95) - 1', next_q_first: 'qstart(qstart(t) + 95)',
  prev_q_last: 'qstart(t) - 1', prev_q_first: 'qstart(qstart(t) - 1)', prev2_q_last: 'qstart(qstart(t) - 1) - 1',
  y_first: 'make_date(year(t), 1, 1)', y_last: 'make_date(year(t), 12, 31)', next_y_first: 'make_date(year(t) + 1, 1, 1)',
  prev_y_last: 'make_date(year(t) - 1, 12, 31)', prev_y_first: 'make_date(year(t) - 1, 1, 1)', prev2_y_last: 'make_date(year(t) - 2, 12, 31)',
};

beforeAll(async () => {
  const instance = await DuckDBInstance.create(':memory:');
  conn = await instance.connect();
  await conn.run(`CREATE MACRO mstart(x) AS x - (day(x) - 1)::INTEGER`);
  await conn.run(`CREATE MACRO qstart(x) AS make_date(year(x), (quarter(x) - 1) * 3 + 1, 1)`);
  const rows = Object.entries(ANCHORS).map(([tag, expr]) => `SELECT '${tag}' AS tag, ${expr} AS d FROM a`);
  await conn.run(`CREATE TABLE days AS
    WITH a AS (SELECT current_date AS t, current_date - (isodow(current_date) - 1)::INTEGER AS mon)
    ${rows.join(' UNION ALL ')}
    UNION ALL SELECT 'null', NULL`);
  await conn.run(`CREATE TABLE stamps AS
    WITH a AS (SELECT current_date AS t, current_date - (isodow(current_date) - 1)::INTEGER AS mon)
    SELECT 'today_end' AS tag, t + TIME '23:59:59.999' AS ts FROM a
    UNION ALL SELECT 'tomorrow_start', t + 1 + TIME '00:00:00' FROM a
    UNION ALL SELECT 'today_minus_6_start', t - 6 + TIME '00:00:00' FROM a
    UNION ALL SELECT 'today_minus_7_end', t - 7 + TIME '23:59:59.999' FROM a
    UNION ALL SELECT 'prev_sun_end', mon - 1 + TIME '23:59:59.999' FROM a
    UNION ALL SELECT 'mon_start', mon + TIME '00:00:00' FROM a`);
});

type Relative = { mode: 'last' | 'previous'; n: number; unit: 'day' | 'week' | 'month' | 'quarter' | 'year' };

async function tagsMatching(table: string, column: string, relative: Relative, isNot = false): Promise<Set<string>> {
  const where = buildFilter({ field: column, type: 'relative_date', relative, isNot }).toSQL(dialect);
  const reader = await conn.runAndReadAll(`SELECT tag FROM ${table} WHERE ${where}`);
  return new Set(reader.getRows().map(r => String(r[0])));
}

describe('relative date filter resolves against current_date in DuckDB', () => {
  it.each<[string, Relative, string[], string[]]>([
    ['Today', { mode: 'last', n: 1, unit: 'day' }, ['today'], ['yesterday', 'tomorrow']],
    ['Yesterday', { mode: 'previous', n: 1, unit: 'day' }, ['yesterday'], ['today', 'today_minus_2']],
    ['Last 7 days', { mode: 'last', n: 7, unit: 'day' }, ['today', 'today_minus_6'], ['today_minus_7', 'tomorrow']],
    ['Previous 7 days', { mode: 'previous', n: 7, unit: 'day' }, ['yesterday', 'today_minus_7'], ['today', 'today_minus_8']],
    ['This week', { mode: 'last', n: 1, unit: 'week' }, ['mon', 'sun', 'today'], ['prev_sun', 'next_mon']],
    ['Last 2 weeks', { mode: 'last', n: 2, unit: 'week' }, ['prev_mon', 'sun'], ['prev2_sun', 'next_mon']],
    ['Previous week', { mode: 'previous', n: 1, unit: 'week' }, ['prev_mon', 'prev_sun'], ['prev2_sun', 'mon']],
    ['This month', { mode: 'last', n: 1, unit: 'month' }, ['m_first', 'm_last'], ['prev_m_last', 'next_m_first']],
    ['Last 2 months', { mode: 'last', n: 2, unit: 'month' }, ['prev_m_first', 'm_last'], ['prev2_m_last', 'next_m_first']],
    ['Previous month', { mode: 'previous', n: 1, unit: 'month' }, ['prev_m_first', 'prev_m_last'], ['prev2_m_last', 'm_first']],
    ['This quarter', { mode: 'last', n: 1, unit: 'quarter' }, ['q_first', 'q_last'], ['prev_q_last', 'next_q_first']],
    ['Previous quarter', { mode: 'previous', n: 1, unit: 'quarter' }, ['prev_q_first', 'prev_q_last'], ['prev2_q_last', 'q_first']],
    ['This year', { mode: 'last', n: 1, unit: 'year' }, ['y_first', 'y_last'], ['prev_y_last', 'next_y_first']],
    ['Last 2 years', { mode: 'last', n: 2, unit: 'year' }, ['prev_y_first', 'y_last'], ['prev2_y_last', 'next_y_first']],
    ['Previous year', { mode: 'previous', n: 1, unit: 'year' }, ['prev_y_first', 'prev_y_last'], ['prev2_y_last', 'y_first']],
  ])('%s', async (_label, relative, inside, outside) => {
    const tags = await tagsMatching('days', 'd', relative);
    for (const tag of inside) expect(tags, `${tag} is inside`).toContain(tag);
    for (const tag of outside) expect(tags, `${tag} is outside`).not.toContain(tag);
    expect(tags).not.toContain('null');
  });

  it('on a TIMESTAMP field includes the whole last day and nothing of the next', async () => {
    const last7 = await tagsMatching('stamps', 'ts', { mode: 'last', n: 7, unit: 'day' });
    expect(last7).toContain('today_end');
    expect(last7).toContain('today_minus_6_start');
    expect(last7).not.toContain('tomorrow_start');
    expect(last7).not.toContain('today_minus_7_end');
    const previousWeek = await tagsMatching('stamps', 'ts', { mode: 'previous', n: 1, unit: 'week' });
    expect(previousWeek).toContain('prev_sun_end');
    expect(previousWeek).not.toContain('mon_start');
  });

  it('negated keeps the NULL rows and everything outside the range', async () => {
    const tags = await tagsMatching('days', 'd', { mode: 'last', n: 7, unit: 'day' }, true);
    expect(tags).toContain('null');
    expect(tags).toContain('tomorrow');
    expect(tags).toContain('today_minus_7');
    expect(tags).not.toContain('today');
    expect(tags).not.toContain('today_minus_6');
  });
});

describe('relative date filter rejects what it cannot put into SQL', () => {
  it.each([
    ['an unknown unit', { mode: 'last', n: 7, unit: 'hour' }],
    ['an unknown mode', { mode: 'next', n: 7, unit: 'day' }],
    ['n = 0', { mode: 'last', n: 0, unit: 'day' }],
    ['a fractional n', { mode: 'last', n: 1.5, unit: 'day' }],
    ['an injected n', { mode: 'last', n: '7) OR (1=1', unit: 'day' }],
    ['no relative at all', undefined],
  ])('%s', (_label, relative) => {
    expect(() => buildFilter({ field: 'd', type: 'relative_date', relative }).toSQL(dialect)).toThrow();
  });
});

describe('a saved view keeps the filter relative', () => {
  it('survives JSON round trip unchanged and resolves through the CUBE + HAVING query', async () => {
    await conn.run(`CREATE OR REPLACE TABLE pivot_data AS
      SELECT * FROM (VALUES ('A', 10), ('A', 5), ('B', 1000)) v(region, sales),
      (SELECT current_date - 3 AS order_date)
      UNION ALL SELECT 'A', 999, current_date - 30
      UNION ALL SELECT 'C', 1, NULL`);
    const region = { id: 'region', name: 'region', dtype: 'string', kind: 'base_field' };
    const orderDate = { id: 'order_date', name: 'order_date', dtype: 'date32', kind: 'base_field' };
    const config = {
      rows: ['region'],
      columns: [],
      values: [{ field: 'sales', aggregation: 'Sum' }],
      filters: [
        { field: 'order_date', type: 'relative_date', relative: { mode: 'last', n: 7, unit: 'day' } },
        { field: 'SUM_sales', filterType: 'having', aggregation: 'Sum', sourceField: 'sales', type: 'less', value: 100 },
      ],
    };
    const saved = JSON.parse(JSON.stringify(config));
    expect(saved).toEqual(config);

    const { sql } = buildPivotSQL({
      config: saved,
      dialect,
      availableFields: [region, orderDate] as any,
      detectedTypes: { region: 'string', order_date: 'date32', sales: 'int32' },
    });
    expect(sql).toContain('current_date');
    expect(sql).not.toMatch(/\d{4}-\d{2}-\d{2}/);

    const rows = (await conn.runAndReadAll(sql)).getRowObjectsJson() as any[];
    const byRegion = Object.fromEntries(rows.map(r => [r._grouping_region ? '(all)' : String(r.region), Number(r.sum_sales)]));
    expect(byRegion).toEqual({ A: 15, '(all)': 15 });
  });
});

describe('relative date filter on Databricks', () => {
  const databricks = new DatabricksDialect();
  const sqlOf = (relative: Relative, isNot = false) =>
    buildFilter({ field: 'order_date', type: 'relative_date', relative, isNot }).toSQL(databricks);

  it.each<[string, Relative, string]>([
    ['Last 7 days', { mode: 'last', n: 7, unit: 'day' },
      '(order_date >= date_add(current_date(), -6) AND order_date < date_add(current_date(), 1))'],
    ['Yesterday', { mode: 'previous', n: 1, unit: 'day' },
      '(order_date >= date_add(current_date(), -1) AND order_date < date_add(current_date(), 0))'],
    ['Previous week', { mode: 'previous', n: 1, unit: 'week' },
      "(order_date >= date_add(trunc(current_date(), 'WEEK'), -7) AND order_date < date_add(trunc(current_date(), 'WEEK'), 0))"],
    ['This month', { mode: 'last', n: 1, unit: 'month' },
      "(order_date >= add_months(trunc(current_date(), 'MONTH'), 0) AND order_date < add_months(trunc(current_date(), 'MONTH'), 1))"],
    ['Previous 2 quarters', { mode: 'previous', n: 2, unit: 'quarter' },
      "(order_date >= add_months(trunc(current_date(), 'QUARTER'), -6) AND order_date < add_months(trunc(current_date(), 'QUARTER'), 0))"],
    ['Last 3 years', { mode: 'last', n: 3, unit: 'year' },
      "(order_date >= add_months(trunc(current_date(), 'YEAR'), -24) AND order_date < add_months(trunc(current_date(), 'YEAR'), 12))"],
  ])('%s', (_label, relative, expected) => {
    expect(sqlOf(relative)).toBe(expected);
  });

  it('negated keeps the NULL rows', () => {
    expect(sqlOf({ mode: 'last', n: 7, unit: 'day' }, true)).toBe(
      '(NOT ((order_date >= date_add(current_date(), -6) AND order_date < date_add(current_date(), 1))) OR order_date IS NULL)'
    );
  });
});
