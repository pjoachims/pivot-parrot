/**
 * Column building logic for pivot tables
 * Handles column outline generation and tree building
 */

import { toMetricKey, toMetricLabel } from './utils';
import { isGrouped, safeStringify, columnPathKey } from '../../application/utils/cubeIndex';

const isNumeric = (v: unknown): v is number | bigint => typeof v === 'number' || typeof v === 'bigint';

// DECIMAL members can arrive as strings ("10.50"); order those by value too.
const numericValue = (v: unknown): unknown =>
  typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v;

/** Column member order: numbers and dates by value, text alphabetically, null (subtotal) last. */
function compareMembers(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  const x = numericValue(a);
  const y = numericValue(b);
  if (isNumeric(x) && isNumeric(y)) return x < y ? -1 : x > y ? 1 : 0;
  return String(a).localeCompare(String(b));
}

/** The column members a CUBE row aggregates: its column fields up to the first grouped one. */
function columnPathOf(row, colFields) {
  const path = [];
  for (const field of colFields) {
    // Handle both Number and BigInt for grouping columns (BigInt in remote mode with Arrow)
    if (isGrouped(row[`_grouping_${field}`])) break;
    path.push(row[field]);
  }
  return path;
}

/**
 * Column groups that can collapse: member paths above the last column field
 * that the cube aggregated. Without CUBE (no subtotals) there are none.
 */
export function columnGroups(sqlRows, colFields) {
  const groups = new Map();
  sqlRows.forEach(row => {
    const path = columnPathOf(row, colFields);
    if (path.length > 0 && path.length < colFields.length) groups.set(columnPathKey(path), path);
  });
  return [...groups.values()];
}

/**
 * Replace each collapsed group's columns (its descendants and its subtotal)
 * with one column at the group's path, where the first of them stood. The
 * outermost collapsed group wins.
 */
function collapseGroups(paths, collapsed) {
  if (collapsed.size === 0) return paths;
  const emitted = new Set();
  const result = [];
  paths.forEach(entry => {
    let group = null;
    for (let len = 1; len <= entry.path.length && !group; len++) {
      if (collapsed.has(columnPathKey(entry.path.slice(0, len)))) group = entry.path.slice(0, len);
    }
    if (!group) {
      result.push(entry);
      return;
    }
    const key = columnPathKey(group);
    if (emitted.has(key)) return;
    emitted.add(key);
    result.push({ path: group, isSubtotal: false, isCollapsed: true, depth: group.length });
  });
  return result;
}

/**
 * Build ordered column outline (flat list of all columns including subtotals)
 *
 * @param {Array<Object>} sqlRows - SQL CUBE results
 * @param {Array<string>} colFields - Column dimension fields
 * @param {Array<Object>} valueFields - Value field configurations
 * @param {number} valuesIndex - Position of Σ Values in columns (-1 if not in columns)
 * @param {boolean} valuesInRows - Whether values are in rows instead
 * @param {Set<string>} collapsed - columnPathKey of each collapsed group
 * @returns {Array<Object>} Ordered column definitions
 */
export function buildColumnOutline(sqlRows, colFields, valueFields, valuesIndex, valuesInRows, collapsed = new Set()) {
  const columns = [];

  // No column dimensions - just metrics
  if (colFields.length === 0) {
    if (valuesInRows) {
      // Values in rows, so columns have no metrics
      // Single "Total" column for all metrics
      columns.push({
        path: [],
        metric: null,
        label: 'Total',
        value: 'Total',
        isGrandTotal: true,
        isSubtotal: false,
        depth: 0
      });
    } else {
      // Only metrics as columns
      valueFields.forEach(v => {
        const metric = toMetricKey(v);
        const label = toMetricLabel(v);
        columns.push({ path: [], metric, label, value: label });
      });
    }
    return withValueIndex(columns);
  }

  // Collect all unique paths from SQL rows
  const seenPaths = new Set();
  const allPaths = [];
  // pathKey -> entry, built alongside allPaths so isSubtotal lookups below are
  // O(1) instead of re-scanning allPaths with .some() for every row.
  const pathIndex = new Map();

  sqlRows.forEach(row => {
    const path = columnPathOf(row, colFields);
    const pathKey = safeStringify(path);
    if (!seenPaths.has(pathKey)) {
      seenPaths.add(pathKey);
      // Every prefix the cube aggregated is a subtotal (or, empty, the grand total)
      const isSubtotal = path.length < colFields.length;
      const entry = { path, isSubtotal, depth: path.length };
      allPaths.push(entry);
      pathIndex.set(pathKey, entry);
    }
  });

  // Organize hierarchically: children first, then parent subtotal
  // Build a tree structure
  const tree = new Map();

  allPaths.forEach(({ path, isSubtotal, depth }) => {
    if (depth === 0) {
      // Grand total
      if (!tree.has('[]')) {
        tree.set('[]', { path: [], isSubtotal: true, depth: 0, children: new Map() });
      }
      return;
    }

    // Ensure parent exists (mark as NOT subtotal unless it exists in allPaths)
    const parentPath = path.slice(0, -1);
    const parentKey = safeStringify(parentPath);
    if (!tree.has(parentKey)) {
      const parentExistsAsSubtotal = pathIndex.get(parentKey)?.isSubtotal ?? false;
      tree.set(parentKey, {
        path: parentPath,
        isSubtotal: parentExistsAsSubtotal,
        depth: parentPath.length,
        children: new Map()
      });
    }

    // Add this node as child of parent
    const nodeKey = safeStringify(path);
    if (!tree.has(nodeKey)) {
      tree.set(nodeKey, { path, isSubtotal, depth, children: new Map() });
    }

    const parentNode = tree.get(parentKey);
    const thisNode = tree.get(nodeKey);
    parentNode.children.set(nodeKey, thisNode);
  });

  // Flatten tree: for each parent, list all children then the parent
  function flattenNode(node, result = []) {
    // Get children at this level, grouped by first dimension value
    const childGroups = new Map();

    node.children.forEach((child) => {
      const firstValue = child.path[node.depth];
      if (!childGroups.has(firstValue)) {
        childGroups.set(firstValue, []);
      }
      childGroups.get(firstValue).push(child);
    });

    // Sort group keys for deterministic ordering
    const sortedGroupKeys = Array.from(childGroups.keys()).sort(compareMembers);

    // For each group, recursively add children, then add subtotal for that group
    sortedGroupKeys.forEach(groupValue => {
      const children = childGroups.get(groupValue);
      children.forEach(child => {
        if (child.depth === colFields.length) {
          // Leaf node - add immediately
          result.push({ path: child.path, isSubtotal: child.isSubtotal, depth: child.depth });
        } else {
          // Non-leaf - recurse first
          flattenNode(child, result);
        }
      });

      // Find and add the subtotal for this group ONLY if it actually exists in allPaths
      const groupPath = [...node.path, groupValue];
      const groupKey = safeStringify(groupPath);
      const groupExistsInData = pathIndex.get(groupKey)?.isSubtotal ?? false;

      if (tree.has(groupKey) && groupExistsInData) {
        const groupNode = tree.get(groupKey);
        if (groupNode.isSubtotal) {
          result.push({ path: groupNode.path, isSubtotal: true, depth: groupNode.depth });
        }
      }
    });

    return result;
  }

  // Start from root (empty path)
  const rootKey = '[]';
  let pathsInOrder = [];
  const hasGrandTotal = allPaths.some(p => p.depth === 0);

  if (tree.has(rootKey)) {
    pathsInOrder = flattenNode(tree.get(rootKey));
    // Add grand total at the end only if it exists in the data
    if (hasGrandTotal) {
      pathsInOrder.push({ path: [], isSubtotal: true, depth: 0 });
    }
  } else {
    // No grand total - just flatten from top-level nodes
    // Get all nodes with depth 1, sorted for deterministic ordering
    const topLevelNodes = Array.from(tree.values())
      .filter(n => n.depth === 1)
      .sort((a, b) => compareMembers(a.path[0], b.path[0]));
    topLevelNodes.forEach(node => {
      flattenNode(node, pathsInOrder);
      if (node.isSubtotal) {
        pathsInOrder.push({ path: node.path, isSubtotal: true, depth: node.depth });
      }
    });
  }

  const combos = collapseGroups(pathsInOrder, collapsed);

  if (valuesInRows) {
    // Values in rows: columns are just dimensions (no metrics)
    combos.forEach(comboObj => {
      const combo = comboObj.path;
      const isGrandTotal = combo.length === 0;
      const fullPath = combo.join('/');
      columns.push({
        path: combo,
        metric: null,  // Metric comes from row
        label: isGrandTotal ? 'Total' : (fullPath || 'Total'),
        value: isGrandTotal ? 'Total' : (combo[combo.length - 1] || 'Total'),  // For formatting
        isSubtotal: comboObj.isSubtotal,
        isGrandTotal: isGrandTotal,
        depth: comboObj.depth
      });
    });
  } else {
    // Values in columns
    // If valuesIndex === -1, treat as "values at end" (default)
    const effectiveValuesIndex = valuesIndex !== -1 ? valuesIndex : colFields.length;

    if (effectiveValuesIndex === 0) {
      // Values at beginning: metrics first, then dimensions
      // Order: metric1/dim1, metric1/dim2, metric2/dim1, metric2/dim2
      valueFields.forEach(v => {
        const metric = toMetricKey(v);
        const label = toMetricLabel(v);
        combos.forEach(comboObj => {
          columns.push({
            path: comboObj.path,
            metric,
            label,
            value: label,  // For formatting
            isSubtotal: comboObj.isSubtotal,
            depth: comboObj.depth
          });
        });
      });
    } else if (effectiveValuesIndex === colFields.length) {
      // Values at end: dimensions first, then metrics
      // Order: dim1/metric1, dim1/metric2, dim2/metric1, dim2/metric2
      combos.forEach(comboObj => {
        valueFields.forEach(v => {
          const metric = toMetricKey(v);
          const label = toMetricLabel(v);
          columns.push({
            path: comboObj.path,
            metric,
            label,
            value: label,  // For formatting
            isSubtotal: comboObj.isSubtotal,
            depth: comboObj.depth
          });
        });
      });
    } else {
      // Values in middle: before dims, then metrics, then after dims
      // Group by before dimensions first
      const beforeCombos = new Map();
      combos.forEach(comboObj => {
        const combo = comboObj.path;
        const before = combo.slice(0, effectiveValuesIndex);
        const after = combo.slice(effectiveValuesIndex);
        const beforeKey = safeStringify(before);
        if (!beforeCombos.has(beforeKey)) {
          beforeCombos.set(beforeKey, []);
        }
        beforeCombos.get(beforeKey).push({ before, after, isSubtotal: comboObj.isSubtotal, depth: comboObj.depth });
      });

      // For each before-combination, iterate metrics, then after-dimensions
      // Sort keys for deterministic ordering
      const sortedBeforeKeys = Array.from(beforeCombos.keys()).sort();
      sortedBeforeKeys.forEach(beforeKey => {
        const pairs = beforeCombos.get(beforeKey);
        valueFields.forEach(v => {
          const metric = toMetricKey(v);
          const label = toMetricLabel(v);
          pairs.forEach(({ before, after, isSubtotal, depth }) => {
            columns.push({
              path: [...before, ...after],
              metric,
              label,
              value: label,  // For formatting
              isSubtotal,
              depth
            });
          });
        });
      });
    }
  }

  const collapsedPaths = new Set(combos.filter(c => c.isCollapsed).map(c => columnPathKey(c.path)));
  if (collapsedPaths.size > 0) {
    columns.forEach(col => {
      if (collapsedPaths.has(columnPathKey(col.path))) col.isCollapsed = true;
    });
  }

  return withValueIndex(columns);
}

/** Each column's place in a row's values array, which follows the outline. */
function withValueIndex(columns) {
  columns.forEach((col, valueIndex) => { col.valueIndex = valueIndex; });
  return columns;
}

/**
 * Build hierarchical column tree for rendering headers
 * Takes flat column outline and builds tree structure
 */
export function buildColumnTree(columnOutline, colFields, valueFields, valuesIndex, valuesInRows) {
  // If no dimensions, just return flat metrics
  if (colFields.length === 0) {
    return columnOutline.map(col => ({
      ...col,
      columnPath: col.path,
      children: []
    }));
  }

  if (valuesInRows) {
    // Build simple tree of just dimensions (no metrics)
    // buildDimensionTree now handles marking nodes directly
    return buildDimensionTree(columnOutline, colFields);
  }

  // Values in columns - build tree with metrics at valuesIndex
  const effectiveValuesIndex = valuesIndex !== -1 ? valuesIndex : colFields.length;

  const tree = [];

  // Sibling lookup index: currentLevel array -> Map<key, node>. Replaces
  // repeated Array.prototype.find() scans (O(children) per lookup, O(n^2)
  // across a wide outline) with O(1) lookups. Keyed on safeStringify(value)
  // (handles BigInt, unlike a raw Map key) rather than === identity, so two
  // equal-content dimension values from different rows still merge.
  const childIndex = new Map();
  function findChild(level, key) {
    return childIndex.get(level)?.get(key);
  }
  function addChild(level, key, node) {
    level.push(node);
    let idx = childIndex.get(level);
    if (!idx) {
      idx = new Map();
      childIndex.set(level, idx);
    }
    idx.set(key, node);
  }

  columnOutline.forEach(col => {
    const path = col.path;
    const metric = col.metric;

    // Build the hierarchy path
    let currentLevel = tree;
    let currentPath = [];

    // Process dimensions before values
    for (let i = 0; i < effectiveValuesIndex && i < path.length; i++) {
      const dimValue = path[i];
      const field = colFields[i];
      currentPath.push(dimValue);

      const key = `${safeStringify(dimValue)}|${field}`;
      let node = findChild(currentLevel, key);
      if (!node) {
        node = {
          value: dimValue,
          field,
          fieldLevel: i,
          level: i,
          path: [...currentPath],
          pathKey: currentPath.join('|'),
          children: []
        };
        addChild(currentLevel, key, node);
      }
      currentLevel = node.children;
    }

    // Add metric node (also add label from col for display)
    const metricKey = `${safeStringify(metric)}|_value`;
    let metricNode = findChild(currentLevel, metricKey);
    if (!metricNode) {
      metricNode = {
        value: metric,
        label: col.label,  // Add label here for intermediate metric nodes
        metric: col.metric,  // Also add metric property
        field: '_value',
        fieldLevel: effectiveValuesIndex,
        level: currentPath.length,
        path: [...currentPath, metric],
        pathKey: [...currentPath, metric].join('|'),
        children: []
      };
      addChild(currentLevel, metricKey, metricNode);
    }
    currentLevel = metricNode.children;
    currentPath.push(metric); // Add metric to path so child nodes inherit it

    // Process dimensions after values
    for (let i = effectiveValuesIndex; i < path.length; i++) {
      const dimValue = path[i];
      const field = colFields[i];
      currentPath.push(dimValue);

      const key = `${safeStringify(dimValue)}|${field}`;
      let node = findChild(currentLevel, key);
      if (!node) {
        node = {
          value: dimValue,
          field,
          fieldLevel: i + 1,
          level: currentPath.length,
          path: [...currentPath],
          pathKey: currentPath.join('|'),
          children: []
        };
        addChild(currentLevel, key, node);
      }
      currentLevel = node.children;
    }

    // If this is a subtotal (path shorter than colFields), we need to add a leaf node
    // The loop above only processes path.length dimensions, leaving us in the middle of the tree
    if (col.isSubtotal) {
      // Create a leaf node structure for this subtotal (properties set by markLeafNodes)
      const leafPathKey = path.join('|') + '|' + metric;
      const leafKey = `${safeStringify(path)}|${metric}|_subtotal`;
      const existingLeaf = findChild(currentLevel, leafKey);
      if (!existingLeaf) {
        const leafNode = {
          value: 'Total',
          field: '_subtotal',
          fieldLevel: path.length,
          level: currentPath.length,
          path: path,
          pathKey: leafPathKey,
          children: []
        };
        addChild(currentLevel, leafKey, leafNode);
      }
    }
  });

  // Mark leaf nodes with isSubtotal/isGrandTotal from columnOutline
  markLeafNodes(tree, columnOutline);

  return tree;
}

/**
 * Mark leaf nodes in tree with isSubtotal/isGrandTotal flags from columnOutline
 */
function markLeafNodes(tree, columnOutline) {
  let outlineIndex = 0;

  function traverse(nodes) {
    nodes.forEach(node => {
      if (!node.children || node.children.length === 0) {
        // Leaf node - match with columnOutline
        if (outlineIndex < columnOutline.length) {
          const col = columnOutline[outlineIndex];
          node.isSubtotal = col.isSubtotal || false;
          node.isGrandTotal = col.depth === 0;
          node.label = col.label;
          node.metric = col.metric;
          node.columnPath = col.path;
          node.isCollapsed = col.isCollapsed || false;
          node.valueIndex = col.valueIndex;

          outlineIndex++;
        }
      } else {
        // Non-leaf - recurse
        traverse(node.children);
      }
    });
  }

  traverse(tree);
}

/**
 * Build simple dimension tree (for values in rows)
 * This needs to handle subtotals by building a proper hierarchical tree
 */
function buildDimensionTree(columnOutline, colFields) {
  const tree = [];
  const parentNodes = new Map(); // Track parent nodes

  // Sibling lookup index: currentLevel array -> Map<key, node>. Replaces
  // repeated Array.prototype.find() scans with O(1) lookups, keyed on
  // safeStringify(value) (handles BigInt) rather than === identity so equal-
  // content values from different rows still merge. Subtotal leaf nodes are
  // intentionally never registered here, mirroring the original
  // `!n.isSubtotal` exclusion.
  const childIndex = new Map();
  function findChild(level, key) {
    return childIndex.get(level)?.get(key);
  }
  function addChild(level, key, node) {
    level.push(node);
    let idx = childIndex.get(level);
    if (!idx) {
      idx = new Map();
      childIndex.set(level, idx);
    }
    idx.set(key, node);
  }

  // Build tree by processing columnOutline in order
  columnOutline.forEach(col => {
    let currentLevel = tree;
    const path = col.path;

    // Special case: empty path (grand total) - add as root leaf node
    if (path.length === 0) {
      tree.push({
        value: col.label || 'Total',
        field: '_total',
        fieldLevel: 0,
        level: 0,
        path: [],
        pathKey: '',
        children: [],
        isSubtotal: col.isSubtotal,
        isGrandTotal: true,
        label: col.label,
        metric: col.metric,
        columnPath: col.path,
        valueIndex: col.valueIndex
      });
      return;
    }

    // If this is a subtotal (path shorter than colFields), add as a leaf node
    if (col.isSubtotal && path.length < colFields.length) {
      // Navigate to parent level
      for (let i = 0; i < path.length - 1; i++) {
        const value = path[i];
        const field = colFields[i];
        const key = `${safeStringify(value)}|${field}`;
        let node = findChild(currentLevel, key);
        if (!node) {
          node = {
            value,
            field,
            fieldLevel: i,
            level: i,
            path: path.slice(0, i + 1),
            pathKey: path.slice(0, i + 1).join('|'),
            children: []
          };
          addChild(currentLevel, key, node);
          parentNodes.set(node.pathKey, node);
        }
        currentLevel = node.children;
      }

      // Add subtotal as a leaf node at this level
      const subtotalNode = {
        value: path[path.length - 1],
        field: colFields[path.length - 1],
        fieldLevel: path.length - 1,
        level: path.length - 1,
        path: [...path],
        pathKey: path.join('|') + '_SUBTOTAL',
        children: [],
        isSubtotal: true,
        isGrandTotal: false,
        label: col.label,
        metric: col.metric,
        columnPath: col.path,
        valueIndex: col.valueIndex
      };
      currentLevel.push(subtotalNode);
      return;
    }

    // Regular detail column - navigate/create path
    for (let i = 0; i < path.length; i++) {
      const value = path[i];
      const field = colFields[i];

      const key = `${safeStringify(value)}|${field}`;
      let node = findChild(currentLevel, key);
      if (!node) {
        node = {
          value,
          field,
          fieldLevel: i,
          level: i,
          path: path.slice(0, i + 1),
          pathKey: path.slice(0, i + 1).join('|'),
          children: []
        };
        addChild(currentLevel, key, node);
        parentNodes.set(node.pathKey, node);
      }

      // Mark as leaf if this is the last segment
      if (i === path.length - 1) {
        node.isSubtotal = false;
        node.isGrandTotal = false;
        node.label = col.label;
        node.metric = col.metric;
        node.columnPath = col.path;
        node.isCollapsed = col.isCollapsed || false;
        node.valueIndex = col.valueIndex;
      }

      currentLevel = node.children;
    }
  });

  return tree;
}
