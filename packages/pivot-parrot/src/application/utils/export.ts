/**
 * Export utilities for PivotDisplay
 */

import { profiler } from '../../domain/query/utils/profiler';

// Escape a string for safe use inside a RegExp
const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replace every occurrence of each id with its friendly name, in a single pass.
 * Ids are matched longest-first so a short id (e.g. "sum") can't clobber part of
 * a longer id (e.g. "sum_total") before the longer one gets a chance to match,
 * and .replace() with a global regex catches every occurrence (not just the first).
 */
export const replaceIdsWithNames = (header, idNamePairs) => {
  const pairs = idNamePairs.filter(p => p?.id && p?.name);
  if (pairs.length === 0) return header;

  const sorted = [...pairs].sort((a, b) => b.id.length - a.id.length);
  const nameById = new Map(sorted.map(p => [p.id, p.name]));
  const pattern = new RegExp(sorted.map(p => escapeRegExp(p.id)).join('|'), 'g');

  return header.replace(pattern, match => nameById.get(match) ?? match);
};

// Helper to escape CSV values
export const escapeCSV = (val) => {
  if (val == null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Export raw SQL data to CSV with friendly column names
 */
export const exportDataCSV = (displayData, config = null) => {
  return profiler.profile('exportDataCSV', () => {
  let sqlData = null;

  if (displayData?.cubeResults && displayData.cubeResults.length > 0) {
    sqlData = displayData.cubeResults;
  }

  if (!sqlData || !sqlData.length) {
    alert('No data to export');
    return;
  }

  const headers = Object.keys(sqlData[0]);

  // Map technical IDs to friendly names for custom metrics and groupings
  // (single pass, longest id first - see replaceIdsWithNames)
  const idNamePairs = [
    ...(config?.customGroupings || []),
    ...(config?.customMetrics || [])
  ];
  const friendlyHeaders = headers.map(header => replaceIdsWithNames(header, idNamePairs));

  // Build CSV with friendly headers
  let csv = friendlyHeaders.join(',') + '\n';
  sqlData.forEach(row => {
    const values = headers.map(h => {
      const val = row[h];
      // Handle null/undefined as empty string
      if (val === null || val === undefined) return '';
      // Convert all other values (including false, 0, "") to string
      const str = String(val);
      // Escape quotes and wrap in quotes if contains comma
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    csv += values.join(',') + '\n';
  });

  // Download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `pivot_data_${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  });
};

/**
 * Build CSV string from pivot display data (internal function)
 * @param {Object} data - Pivot display data
 * @param {Array} leafCols - Leaf columns from column hierarchy
 * @param {Array} rowFields - Row field names
 * @param {boolean} showRowSubtotals - Whether to show row subtotals
 * @param {boolean} showGrandTotal - Whether to show grand total
 * @param {Object} config - Pivot config for mapping custom metric names
 * @returns {string} CSV string
 */
export const buildPivotCSV = (data, leafCols, rowFields, showRowSubtotals, showGrandTotal, config = null) => {
  return profiler.profile('buildPivotCSV', () => {
  if (!data || !data.rowGroups) {
    return '';
  }

  // Helper to map custom metric ID to friendly name
  const getMetricName = (metricId) => {
    if (!metricId) return metricId;
    if (config?.customMetrics) {
      const metric = config.customMetrics.find(m => m.id === metricId);
      if (metric?.name) return metric.name;
    }
    return metricId;
  };

  // Helper to map custom grouping ID to friendly name
  const getFieldName = (fieldId) => {
    if (!fieldId) return fieldId;
    if (config?.customGroupings) {
      const grouping = config.customGroupings.find(g => g.id === fieldId);
      if (grouping?.name) return grouping.name;
    }
    return fieldId;
  };

  const lines = [];
  const colFields = data.columnConfig.colFields || [];
  const hasColFields = colFields.length > 0;

  // Map custom grouping IDs to friendly names in field arrays
  const friendlyRowFields = rowFields ? rowFields.map(getFieldName) : [];
  const friendlyColFields = colFields.map(getFieldName);

  if (hasColFields && leafCols && leafCols.length > 0) {
    // Build multi-row headers for column hierarchy
    const numLevels = colFields.length + 1; // colFields + value field row

    for (let level = 0; level < numLevels; level++) {
      const row = level === 0 ? ['Row Labels'] : [''];

      leafCols.forEach(leaf => {
        // Use the existing path array from the leaf
        const path = leaf.path || [];

        // For regular columns, path contains: [colField1Value, colField2Value, ..., metricName]
        // For subtotals, path contains: [...colFieldValues, "_SUBTOTAL_metric"]
        // For grand total, path is: ["_GRAND_TOTAL_metric"]

        if (leaf.isGrandTotal) {
          // Grand Total column
          if (level === 0) {
            row.push('Grand Total');
          } else if (level === numLevels - 1) {
            row.push(getMetricName(leaf.value) || '');
          } else {
            row.push('');
          }
        } else if (leaf.isSubtotal) {
          // Subtotal column - show parent values, then "Subtotal", then metric
          const pathWithoutSubtotal = path.slice(0, -1); // Remove _SUBTOTAL_xxx
          const subtotalDepth = pathWithoutSubtotal.length;

          if (level < subtotalDepth) {
            const pathVal = pathWithoutSubtotal[level];
            row.push(pathVal || '');
          } else if (level === subtotalDepth) {
            row.push('Subtotal');
          } else if (level === numLevels - 1) {
            row.push(getMetricName(leaf.value) || '');
          } else {
            row.push('');
          }
        } else {
          // Regular column - path has colField values followed by metric name
          if (level < path.length) {
            // Last level of path is the metric name - map it to friendly name
            const value = path[level];
            row.push(level === path.length - 1 ? getMetricName(value) : value);
          } else {
            row.push('');
          }
        }
      });

      lines.push(row.map(escapeCSV).join(','));
    }
  } else {
    // Simple header: Row Labels + value fields (map to friendly names)
    const valueHeaders = (data.columnConfig.valueFields || []).map(getMetricName);
    const headers = ['Row Labels', ...valueHeaders];
    lines.push(headers.map(escapeCSV).join(','));
  }

  // Build data rows with indentation
  const buildRow = (row, depth = 0) => {
    // Skip null rows if explicitly configured to hide them (default: show as "(Blank)")
    if (config?.showNullGroups === false && (row.groupLabel === '(null)' || row.groupLabel === null)) return;

    const indent = '    '.repeat(depth); // 4 spaces per level
    // Export raw row label without formatting - handle false, 0, "" correctly
    const labelValue = row.groupLabel;
    const labelStr = (labelValue === null || labelValue === undefined) ? '' : String(labelValue);
    const label = indent + labelStr;

    // Determine which values to show
    const hasKids = row.children && row.children.length > 0;
    const isSubtotalRow = row.subtotals && hasKids;
    let cellValues = row.values;

    if (isSubtotalRow && showRowSubtotals) {
      cellValues = row.subtotals;
    } else if (!row.values && !row.subtotals) {
      cellValues = null;
    }

    // Build value cells with raw numbers (no formatting)
    const values = [label];
    (leafCols || []).forEach((leaf, idx) => {
      const rawVal = cellValues?.[idx];  // Use array index
      // Export raw value: null/undefined → empty, all others (including false, 0, "") → string
      if (rawVal === null || rawVal === undefined) {
        values.push('');
      } else {
        values.push(String(rawVal));
      }
    });

    lines.push(values.map(escapeCSV).join(','));

    // Recurse for children
    if (hasKids && row.children) {
      row.children.forEach(child => buildRow(child, depth + 1));
    }
  };

  data.rowGroups.forEach(group => buildRow(group, 0));

  // Add Grand Total row with raw numbers
  if (showGrandTotal && data.grandTotal) {
    const values = ['Grand Total'];
    (leafCols || []).forEach((leaf, idx) => {
      const rawVal = data.grandTotal[idx];  // Use array index
      // Export raw value: null/undefined → empty, all others (including false, 0, "") → string
      if (rawVal === null || rawVal === undefined) {
        values.push('');
      } else {
        values.push(String(rawVal));
      }
    });
    lines.push(values.map(escapeCSV).join(','));
  }

  // Return CSV string
  return lines.join('\n');
  });
};

/**
 * Export visual pivot layout to CSV file (browser download)
 * @param {Object} data - Pivot display data
 * @param {Array} leafCols - Leaf columns from column hierarchy
 * @param {Array} rowFields - Row field names
 * @param {boolean} showRowSubtotals - Whether to show row subtotals
 * @param {boolean} showGrandTotal - Whether to show grand total
 * @param {Object} config - Pivot config for mapping custom metric names
 */
export const exportPivotCSV = (data, leafCols, rowFields, showRowSubtotals, showGrandTotal, config = null) => {
  return profiler.profile('exportPivotCSV', () => {
  const csv = buildPivotCSV(data, leafCols, rowFields, showRowSubtotals, showGrandTotal, config);

  if (!csv) {
    alert('No pivot data to export');
    return;
  }

  // Download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `pivot_visual_${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  });
};
