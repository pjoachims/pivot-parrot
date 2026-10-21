/**
 * Value population logic for pivot tables
 * Populates values arrays for nodes in the row tree
 */

import { createCellHash, lookupCubeValue } from '../../application/utils/cubeIndex';
import { SIGMA_VALUES_ID } from '../models/types';

/**
 * Populate values arrays for all nodes in the tree
 *
 * @param {Array<Object>} nodes - Tree nodes to populate
 * @param {Array<Object>} sqlRows - SQL CUBE results
 * @param {Array<string>} rowFields - Row dimension fields
 * @param {Array<Object>} columnOutline - Ordered column definitions
 * @param {Array<string>} colFields - Column dimension fields
 * @param {number} valuesIndex - Position of Σ Values in rows (-1 if in columns)
 * @param {Array<string>} originalRowFields - Original row fields including Σ Values
 * @param {Map} cubeIndex - Hash index for O(1) lookups
 * @param {Object} dtypes - Column name → engine type name mapping
 */
export function populateNodeValues(nodes, sqlRows, rowFields, columnOutline, colFields, valuesIndex, originalRowFields, cubeIndex, dtypes = {}) {
  nodes.forEach(node => {
    const valuesInRows = valuesIndex !== -1;
    const hasChildren = node.children && node.children.length > 0;

    if (valuesInRows) {
      // Special case: when Values is at position 0, metric nodes ARE at depth 0
      // They need subtotals if they have children
      if (valuesIndex === 0 && node.depth === 0 && hasChildren) {
        // This is a metric parent node - give it subtotals
        const metricName = node.path[0];

        node.subtotals = columnOutline.map((col) => {
          // Use hash lookup: all row dimensions grouped, match column path
          const hash = createCellHash([], rowFields, col.path, colFields);
          return lookupCubeValue(cubeIndex, hash, metricName);
        });

        node.values = null;

        // Recurse for children
        populateNodeValues(node.children, sqlRows, rowFields, columnOutline, colFields, valuesIndex, originalRowFields, cubeIndex, dtypes);
        return;
      }

      // Node must be at or below Values level to have values
      if (node.path.length <= valuesIndex) {
        // A member above the metric level spans several metrics: no common subtotal (as in Excel).
        node.values = null;
        if (hasChildren) {
          populateNodeValues(node.children, sqlRows, rowFields, columnOutline, colFields, valuesIndex, originalRowFields, cubeIndex, dtypes);
        }
        return;
      }

      // Split path at Values position
      const beforePath = node.path.slice(0, valuesIndex);
      const rowMetric = node.path[valuesIndex];
      const afterPath = node.path.slice(valuesIndex + 1);

      // IMPORTANT: Use originalRowFields (with Σ Values) for slicing, not actualRowFields
      const originalFields = originalRowFields || rowFields;  // Fallback for backward compat
      const beforeFields = originalFields.slice(0, valuesIndex).filter(f => f !== SIGMA_VALUES_ID);
      const afterFields = originalFields.slice(valuesIndex + 1).filter(f => f !== SIGMA_VALUES_ID);

      const valuesArray = columnOutline.map(col => {
        // Use hash lookup: combine before + after paths (skipping Values position)
        const rowPath = [...beforePath, ...afterPath];
        const rowFieldsWithoutValues = [...beforeFields, ...afterFields];
        const hash = createCellHash(rowPath, rowFieldsWithoutValues, col.path, colFields);
        return lookupCubeValue(cubeIndex, hash, rowMetric);
      });
      // Below the metric level a parent's row is that metric's subtotal.
      node.subtotals = hasChildren ? valuesArray : undefined;
      node.values = hasChildren ? null : valuesArray;
    } else {
      // Values in columns - use hash lookup (O(1) instead of O(n))
      const valuesArray = columnOutline.map(col => {
        const hash = createCellHash(node.path, rowFields, col.path, colFields);
        return lookupCubeValue(cubeIndex, hash, col.metric);
      });

      node.subtotals = hasChildren ? valuesArray : undefined;
      node.values = hasChildren ? null : valuesArray;
    }

    // Recursively populate children
    if (hasChildren) {
      populateNodeValues(node.children, sqlRows, rowFields, columnOutline, colFields, valuesIndex, originalRowFields, cubeIndex, dtypes);
    }
  });
}
