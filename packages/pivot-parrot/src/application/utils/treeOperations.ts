/**
 * Tree operations for expanding/collapsing pivot table rows
 * Eliminates duplicate traversal logic from PivotDisplay
 */

import { safeStringify } from './cubeIndex';

interface TreeNode {
  children?: TreeNode[];
  [key: string]: any;
}

type ExpandedState = Record<string, boolean>;

/**
 * Expansion key of a row: its member-value path, so the state follows the
 * member through sorting, filtering and refetches instead of a position.
 */
export function rowKey(node: TreeNode): string {
  return safeStringify(node.path);
}

/**
 * Generic tree traversal that processes nodes at a specific depth
 */
function traverseTree(
  nodes: TreeNode[],
  callback: (key: string, currentDepth: number) => void,
  targetDepth?: number,
  currentDepth = 0
): void {
  nodes.forEach(node => {
    if (targetDepth === undefined || currentDepth === targetDepth) {
      callback(rowKey(node), currentDepth);
    }

    if (node.children && node.children.length > 0) {
      traverseTree(node.children, callback, targetDepth, currentDepth + 1);
    }
  });
}

/**
 * Drop the expansion state of rows that are no longer in the tree
 */
export function pruneExpanded(nodes: TreeNode[], currentExpanded: ExpandedState): ExpandedState {
  const kept: ExpandedState = {};
  traverseTree(nodes, key => {
    if (key in currentExpanded) kept[key] = currentExpanded[key];
  });
  return kept;
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

  traverseTree(nodes, (key, currentDepth) => {
    if (currentDepth === depth) {
      newExpanded[key] = isExpanded;
    }
  }, depth);

  return newExpanded;
}

/**
 * Set all nodes to expanded state
 */
export function expandAll(nodes: TreeNode[]): ExpandedState {
  const newExpanded: ExpandedState = {};

  traverseTree(nodes, (key) => {
    newExpanded[key] = true;
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
