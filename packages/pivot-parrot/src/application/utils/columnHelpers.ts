/**
 * Utility functions for column operations
 */

/**
 * Compute leaf columns from display data hierarchy
 */
export function computeLeafColumns(displayData, showGrandTotal = true, showColSubtotals = true) {
  if (!displayData || !displayData.columnConfig) return [];

  const hierarchy = displayData.columnConfig.hierarchy || [];

  function collectLeaves(nodes, leaves = []) {
    nodes.forEach(node => {
      if (node.children?.length > 0) {
        collectLeaves(node.children, leaves);
      } else {
        if (node.isGrandTotal && !showGrandTotal) return;
        if (node.isSubtotal && !node.isGrandTotal && !showColSubtotals) return;
        leaves.push(node);
      }
    });
    return leaves;
  }

  return collectLeaves(hierarchy);
}
