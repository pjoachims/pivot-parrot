/**
 * Tree operations for expanding/collapsing pivot table rows
 * Eliminates duplicate traversal logic from PivotDisplay
 */

interface TreeNode {
  children?: TreeNode[];
  [key: string]: any;
}

type ExpandedState = Record<string, boolean>;

/**
 * Generic tree traversal that processes nodes at a specific depth
 */
function traverseTree(
  nodes: TreeNode[],
  callback: (pathKey: string, currentDepth: number) => void,
  targetDepth?: number,
  currentPath: number[] = [],
  currentDepth = 0
): void {
  nodes.forEach((node, idx) => {
    const path = [...currentPath, idx];
    const pathKey = path.join('-');

    if (targetDepth === undefined || currentDepth === targetDepth) {
      callback(pathKey, currentDepth);
    }

    if (node.children && node.children.length > 0) {
      traverseTree(node.children, callback, targetDepth, path, currentDepth + 1);
    }
  });
}

/**
 * Set all nodes at a specific depth to expanded/collapsed state
 */
export function setLevelExpansion(
  nodes: TreeNode[],
  currentExpanded: ExpandedState,
  depth: number,
  isExpanded: boolean
): ExpandedState {
  const newExpanded = { ...currentExpanded };

  traverseTree(nodes, (pathKey, currentDepth) => {
    if (currentDepth === depth) {
      newExpanded[pathKey] = isExpanded;
    }
  }, depth);

  return newExpanded;
}

/**
 * Set all nodes to expanded state
 */
export function expandAll(nodes: TreeNode[]): ExpandedState {
  const newExpanded: ExpandedState = {};

  traverseTree(nodes, (pathKey) => {
    newExpanded[pathKey] = true;
  });

  return newExpanded;
}

/**
 * Collapse all nodes (returns empty state)
 */
export function collapseAll(): ExpandedState {
  return {};
}

/**
 * Toggle expansion for nodes at a specific field depth
 */
export function toggleFieldLevel(
  nodes: TreeNode[],
  currentExpanded: ExpandedState,
  fieldDepth: number,
  shouldExpand: boolean
): ExpandedState {
  return setLevelExpansion(nodes, currentExpanded, fieldDepth, shouldExpand);
}
