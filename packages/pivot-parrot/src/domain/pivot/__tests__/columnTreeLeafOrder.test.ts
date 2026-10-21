// Guards the positional contract between columnOutline and the column tree:
// node.values arrays are outline-ordered and renderCells indexes them by leaf
// position, so collectLeaves(buildColumnTree(outline)) must yield exactly one
// leaf per outline column, in outline order.
import { describe, it, expect } from 'vitest';
import { buildColumnOutline, buildColumnTree } from '../columnBuilder';
import { safeStringify } from '../../../application/utils/cubeIndex';

function collectLeaves(nodes, leaves = []) {
  nodes.forEach((node) => {
    if (node.children?.length > 0) collectLeaves(node.children, leaves);
    else leaves.push(node);
  });
  return leaves;
}

const rows = [
  { region: 'East', product: 'A', sum_sales: 1, count_orders: 10, _grouping_region: 0, _grouping_product: 0 },
  { region: 'East', product: 'B', sum_sales: 2, count_orders: 20, _grouping_region: 0, _grouping_product: 0 },
  { region: 'East', product: null, sum_sales: 3, count_orders: 30, _grouping_region: 0, _grouping_product: 1 },
  { region: 'West', product: 'A', sum_sales: 4, count_orders: 40, _grouping_region: 0, _grouping_product: 0 },
  { region: 'West', product: 'B', sum_sales: 5, count_orders: 50, _grouping_region: 0, _grouping_product: 0 },
  { region: 'West', product: null, sum_sales: 6, count_orders: 60, _grouping_region: 0, _grouping_product: 1 },
  { region: null, product: null, sum_sales: 12, count_orders: 120, _grouping_region: 1, _grouping_product: 1 },
];
const colFields = ['region', 'product'];
const valueFields = [
  { field: 'sales', aggregation: 'sum' },
  { field: 'orders', aggregation: 'count' },
];

describe('buildColumnTree leaf order', () => {
  it('yields one leaf per outline column, in outline order, with merged siblings', () => {
    const outline = buildColumnOutline(rows, colFields, valueFields, -1, false);
    const tree = buildColumnTree(outline, colFields, valueFields, -1, false);
    const leaves = collectLeaves(tree);

    expect(leaves.length).toBe(outline.length);
    leaves.forEach((leaf, i) => {
      expect(leaf.metric).toBe(outline[i].metric);
      const leafDims = (leaf.path || []).filter((p) => p !== leaf.metric);
      const outlineDims = outline[i].path || [];
      expect(safeStringify(leafDims)).toBe(safeStringify(outlineDims));
      expect(!!leaf.isSubtotal).toBe(!!outline[i].isSubtotal);
    });

    // Siblings with equal content must merge: exactly one top-level node per
    // region (East, West) plus the grand-total metric branch.
    const topValues = tree.map((n) => n.value);
    expect(topValues.filter((v) => v === 'East')).toHaveLength(1);
    expect(topValues.filter((v) => v === 'West')).toHaveLength(1);
  });
});
