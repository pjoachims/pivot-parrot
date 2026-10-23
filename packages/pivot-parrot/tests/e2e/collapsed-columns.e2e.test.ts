import { describe, it, expect, beforeAll } from 'vitest';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { buildPivotSQL } from '../../src/domain/query/sql/buildPivotSQL';
import { DuckDBDialect } from '../../src/domain/query/dialects/DuckDBDialect';
import { AGGREGATIONS } from '../../src/domain/query/sql/aggregations';
import { buildPivotDisplayData } from '../../src/domain/pivot/index';
import { computeLeafColumns } from '../../src/application/utils/columnHelpers';
import { columnPathKey } from '../../src/application/utils/cubeIndex';
import { buildPivotGrid } from '../../src/application/utils/export';
import { toMetricKey } from '../../src/domain/pivot/utils';

const field = (id: string, dtype: string) => ({ id, name: id, dtype, kind: 'base_field' });
const region = field('region', 'string');
const category = field('category', 'string');
const product = field('product', 'string');
const sales = field('sales', 'int32');
const types = { region: 'string', category: 'string', product: 'string', sales: 'int32' };
const dialect = new DuckDBDialect();

// Uneven member sizes, so an average of averages (or a sum of them) is not the average.
const FACTS = `
  ('Nord', 'Tech', 'Phone', 10), ('Nord', 'Tech', 'Phone', 30), ('Nord', 'Tech', 'Laptop', 200),
  ('Nord', 'Home', 'Lamp', 5),
  ('Süd', 'Tech', 'Phone', 20), ('Süd', 'Tech', 'Laptop', 100), ('Süd', 'Tech', 'Laptop', 300), ('Süd', 'Tech', 'Laptop', 300),
  ('Süd', 'Home', 'Lamp', 7), ('Süd', 'Home', 'Sofa', 900)`;

// Every aggregation the DuckDB dialect runs; mode is left out because a tie has no single answer.
const aggregations = Object.values(AGGREGATIONS).filter(a => a.key !== 'mode' && a.sqlName in dialect.aggregations);
const values = [
  ...aggregations.map(a => ({ field: 'sales', aggregation: a.value })),
  { field: 'ratio', aggregation: 'custom', isCustom: true, name: 'Ratio', expr: 'SUM(sales) / COUNT(*)' }
];

let conn: DuckDBConnection;
let cube: any[];

beforeAll(async () => {
  conn = await (await DuckDBInstance.create(':memory:')).connect();
  await conn.run(`CREATE TABLE pivot_data AS SELECT * FROM (VALUES ${FACTS}) t(region, category, product, sales)`);
  const config = { rows: [region], columns: [category, product], values, filters: [] };
  const { sql } = buildPivotSQL({ config, dialect, availableFields: [region, category, product, sales], detectedTypes: types });
  cube = (await conn.runAndReadAll(sql)).getRowObjectsJson() as any[];
});

const num = (v: unknown) => v === null || v === undefined ? null : Number(v);

/** The pivot's cells by row label, with Tech collapsed: the CUBE result through the table's display build. */
function collapsedTech() {
  const data = buildPivotDisplayData(cube, ['region'], ['category', 'product', 'Σ Values'], values, null, {}, [columnPathKey(['Tech'])]);
  const leaves = computeLeafColumns(data, true, false);
  const grid = buildPivotGrid(data, leaves, ['region'], true, true, { values });
  const techCols = leaves.flatMap((leaf: any, i: number) => leaf.isCollapsed && leaf.columnPath[0] === 'Tech' ? [i] : []);
  const row = (label: string) => grid.cells.find(r => String(r[0]).trim() === label)!;
  return { leaves, techCols, row };
}

/** What the warehouse says for Tech, per region and in total, asked directly at that level. */
async function techDirect(expr: string) {
  const per = (await conn.runAndReadAll(`SELECT region, ${expr} AS v FROM pivot_data WHERE category = 'Tech' GROUP BY region`)).getRowObjectsJson() as any[];
  const all = (await conn.runAndReadAll(`SELECT ${expr} AS v FROM pivot_data WHERE category = 'Tech'`)).getRowObjectsJson() as any[];
  return { ...Object.fromEntries(per.map(r => [r.region, num(r.v)])), 'Grand Total': num(all[0].v) };
}

describe('a collapsed column group shows the CUBE row at its level', () => {
  it('Tech collapsed: one column per metric, its product columns gone, though column subtotals are off', () => {
    const { leaves, techCols } = collapsedTech();
    expect(techCols).toHaveLength(values.length);
    expect(leaves.some((leaf: any) => !leaf.isCollapsed && leaf.columnPath?.[0] === 'Tech')).toBe(false);
    expect(leaves.filter((leaf: any) => !leaf.isSubtotal && leaf.columnPath?.[0] === 'Home')).toHaveLength(2 * values.length);
  });

  const cases = values.map((v, i) => [v.isCustom ? v.name : v.aggregation, toMetricKey(v), i < aggregations.length ? dialect.getAggregation(aggregations[i].sqlName, 'sales') : v.expr]);

  it.each(cases)('%s equals the aggregate over all of Tech, asked at that level', async (name, metric, expr) => {
    const { leaves, techCols, row } = collapsedTech();
    const col = techCols.find(i => (leaves[i] as any).metric === metric)!;
    expect(col, `a collapsed Tech column for ${name}`).toBeDefined();
    const direct = await techDirect(expr!);
    for (const label of ['Nord', 'Süd', 'Grand Total']) {
      expect(num(row(label)[col + 1]), `${name} for ${label}`).toBeCloseTo(direct[label], 6);
    }
  });

  it('the average over Tech is not the sum or the mean of its products\' averages', async () => {
    const { leaves, techCols, row } = collapsedTech();
    const col = techCols.find(i => (leaves[i] as any).metric === 'avg_sales')!;
    const shown = num(row('Süd')[col + 1]);
    // Süd: Phone avg 20, Laptop avg (100+300+300)/3 = 233.33; all of Tech: 720 / 4 = 180.
    expect(shown).toBe(180);
    expect(shown).not.toBeCloseTo(20 + 700 / 3, 3);
    expect(shown).not.toBeCloseTo((20 + 700 / 3) / 2, 3);
  });
});
