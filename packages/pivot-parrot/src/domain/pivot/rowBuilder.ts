/**
 * Row building logic for pivot tables
 * Handles row tree generation
 */

import { toMetricKey, toMetricLabel } from './utils';
import { isUngrouped, safeStringify } from '../../application/utils/cubeIndex';

/**
 * Build hierarchical row tree
 *
 * @param {Array<Object>} sqlRows - SQL CUBE results
 * @param {Array<string>} rowFields - Row dimension fields
 * @param {Array<Object>} valueFields - Value fields (if Values in rows)
 * @param {number} valuesIndex - Position of Σ Values in rows (-1 if in columns)
 * @param {Object} dtypes - Column name → DTYPE enum mapping
 * @returns {Array<Object>} Root-level row nodes
 */
export function buildRowTree(sqlRows, rowFields, valueFields, valuesIndex, dtypes = {}) {
  const root = { children: new Map() };

  // Build mapping from metric key to label for display
  const metricKeyToLabel = new Map();
  valueFields.forEach(v => {
    const key = toMetricKey(v);
    const label = toMetricLabel(v);
    metricKeyToLabel.set(key, label);
  });

  // Helper to insert a path into the tree
  function insertPath(path, depth = 0, node = root, parentPath = [], fields = rowFields) {
    if (depth >= path.length) return;

    const value = path[depth];
    const currentPath = [...parentPath, value];

    if (!node.children.has(value)) {
      // Use friendly label for metric keys, otherwise use value as-is
      const displayLabel = metricKeyToLabel.get(value) || value;

      node.children.set(value, {
        label: value,  // Raw value; type resolved from dtypes at format time
        groupLabel: displayLabel,  // Use friendly name for custom metrics
        depth,
        path: currentPath,
        children: new Map(),
        values: null  // Will be populated later
      });
    }

    insertPath(path, depth + 1, node.children.get(value), currentPath, fields);
  }

  if (valuesIndex !== -1) {
    // Values in rows: inject metrics into paths at valuesIndex
    const beforeFields = rowFields.slice(0, valuesIndex);
    const afterFields = rowFields.slice(valuesIndex);

    // Special case: no other dimensions (Values is the only row field)
    if (rowFields.length === 0) {
      // Just insert each metric as a standalone row
      valueFields.forEach(v => {
        const metric = toMetricKey(v);
        insertPath([metric]);
      });
    } else {
      // Collect unique dimension combinations
      const uniquePaths = new Set();
      sqlRows.forEach(row => {
        // Handle both Number and BigInt for grouping columns (BigInt in remote mode with Arrow)
        const isLeaf = rowFields.every(f => {
          const groupingValue = row[`_grouping_${f}`];
          return isUngrouped(groupingValue);
        });
        if (!isLeaf) return;

        const dimPath = rowFields.map(f => row[f]);
        uniquePaths.add(safeStringify(dimPath));
      });

      const paths = Array.from(uniquePaths).map(s => JSON.parse(s as string));  // Preserve SQL order

      // For each dimension path, insert all metrics at valuesIndex
      paths.forEach(dimPath => {
        const before = dimPath.slice(0, valuesIndex);
        const after = dimPath.slice(valuesIndex);

        valueFields.forEach(v => {
          const metric = toMetricKey(v);
          const fullPath = [...before, metric, ...after];
          insertPath(fullPath);
        });
      });
    }
  } else {
    // Values in columns: rows are just dimensions

    // Special case: no row dimensions at all - return empty array
    // Only grand total will be shown
    if (rowFields.length === 0) {
      return [];
    }

    const uniquePaths = new Set();
    sqlRows.forEach(row => {
      // Handle both Number and BigInt for grouping columns (BigInt in remote mode with Arrow)
      const isLeaf = rowFields.every(f => {
        const groupingValue = row[`_grouping_${f}`];
        return isUngrouped(groupingValue);
      });
      if (!isLeaf) return;

      const path = rowFields.map(f => row[f]);
      uniquePaths.add(safeStringify(path));
    });

    const paths = Array.from(uniquePaths).map(s => JSON.parse(s as string));  // Preserve SQL order
    paths.forEach(path => insertPath(path));
  }

  // Convert Map tree to array tree
  function mapToArray(node: any): any[] {
    const children = Array.from(node.children.values()).map((child: any) => ({
      ...child,
      children: mapToArray(child)
    }));
    return children;
  }

  return mapToArray(root);
}
