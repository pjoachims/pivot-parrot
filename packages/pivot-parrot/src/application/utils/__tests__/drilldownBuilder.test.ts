import { it, expect } from 'vitest';
import { buildDrilldownFilters } from '../drilldownBuilder';
import { buildPivotDisplayData } from '../../../domain/pivot';
import { columnPathKey } from '../cubeIndex';
import { cube } from '../../../domain/pivot/__tests__/cubeFixture';

const facts = [
  { day: 1, product: 'Chair', region: 'North', category: 'Furniture', sales: 1 },
  { day: 1, product: 'Chair', region: 'South', category: 'Furniture', sales: 2 }
];
const sales = [{ field: 'sales', aggregation: 'sum' }];

it.each([
  ['values last', ['product', 'region', 'category', 'Σ Values']],
  ['values first', ['Σ Values', 'product', 'region', 'category']],
  ['values between', ['product', 'Σ Values', 'region', 'category']]
])('a cell in a collapsed column group drills down to that group\'s members (%s)', (_, columns) => {
  const data: any = buildPivotDisplayData(
    cube(facts, ['day', 'product', 'region', 'category']), ['day'], columns, sales, null, {}, [columnPathKey(['Chair', 'North'])]
  );
  const leaves: any[] = [];
  const walk = (n: any) => (n.children?.length ? n.children.forEach(walk) : leaves.push(n));
  data.columnConfig.hierarchy.forEach(walk);
  const collapsed = leaves.find(l => l.isCollapsed);

  const filters = buildDrilldownFilters({
    node: data.rowGroups[0],
    leaf: collapsed,
    rowFields: ['day'],
    colFields: columns,
    config: { rows: ['day'], columns, values: sales, filters: [] }
  });

  expect(filters.map(f => [f.field, f.value])).toEqual([['day', 1], ['product', 'Chair'], ['region', 'North']]);
});

it('a cell in a collapsed column group drills down to that group\'s members with Σ Values in rows', () => {
  const columns = ['product', 'region', 'category'];
  const data: any = buildPivotDisplayData(
    cube(facts, ['day', ...columns]), ['day', 'Σ Values'], columns, sales, null, {}, [columnPathKey(['Chair', 'North'])]
  );
  const leaves: any[] = [];
  const walk = (n: any) => (n.children?.length ? n.children.forEach(walk) : leaves.push(n));
  data.columnConfig.hierarchy.forEach(walk);

  const filters = buildDrilldownFilters({
    node: data.rowGroups[0].children[0],
    leaf: leaves.find(l => l.isCollapsed),
    rowFields: ['day', 'Σ Values'],
    colFields: columns,
    config: { rows: ['day', 'Σ Values'], columns, values: sales, filters: [] }
  });

  expect(filters.map(f => [f.field, f.value])).toEqual([['day', 1], ['product', 'Chair'], ['region', 'North']]);
});
