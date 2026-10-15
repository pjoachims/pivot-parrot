import React from 'react';
import { SIGMA_VALUES_ID } from '../../domain/models/types';

/**
 * Render data cells for a row
 */
export function renderCells(vals, leafColumns, styles, formatValue, rowMetric = null, node = null, rowFields = null, colFields = null, onCellContextMenu = null) {
  const isGrandTotalRow = node && node.groupLabel === 'Grand Total';

  return leafColumns.map((leaf, i) => {
    // Check if cell is in grand total row OR grand total column
    const isGrandTotalCell = isGrandTotalRow || leaf.isGrandTotal;

    let cellStyle;
    if (leaf.isSubtotal && !leaf.isGrandTotal) {
      // Subtotal column but NOT grand total column
      // If it's in a grand total row, make it bold
      if (isGrandTotalRow) {
        cellStyle = { ...styles.dataCell, ...styles.subtotalCell, fontWeight: '600' };
      } else {
        cellStyle = { ...styles.dataCell, ...styles.subtotalCell };
      }
    } else if (isGrandTotalCell) {
      cellStyle = { ...styles.dataCell, ...styles.grandTotalCell, fontWeight: '600' };
    } else {
      cellStyle = styles.dataCell;
    }

    // Use array index directly (long-to-wide transformation)
    const value = vals?.[i];

    // Use the metric identifier for format lookup
    // When values are in rows, rowMetric contains the metric identifier from the row path
    // When values are in columns, leaf.metric contains the metric identifier
    const valueKey = rowMetric || leaf.metric;

    const formattedValue = formatValue(value, valueKey);

    // Add context menu handler
    const handleContextMenu = (e) => {
      if (onCellContextMenu && value !== null && value !== undefined) {
        e.preventDefault();
        onCellContextMenu(e, {
          node,
          leaf,
          value,
          rowFields,
          colFields
        });
      }
    };

    return (
      <td
        key={i}
        className="pivot-data-cell"
        style={{...cellStyle, cursor: onCellContextMenu ? 'context-menu' : 'default'}}
        onContextMenu={handleContextMenu}
      >
        {formattedValue}
      </td>
    );
  });
}

/**
 * PivotRow Component
 * Renders a single pivot table row with expand/collapse and value cells
 */
export function PivotRow({
  node,
  depth,
  rowKey,
  expanded,
  toggle,
  rowFields,
  formatRowLabel,
  showRowSubtotals,
  styles,
  leafColumns,
  formatValue,
  virtualStart,
  rowHeight,
  colFields,
  onCellContextMenu,
  onChevronContextMenu
}) {
  const hasKids = node.children && node.children.length > 0;
  const isOpen = !!expanded[rowKey];
  const isLeaf = node.values && !hasKids;
  const isGrand = node.groupLabel === 'Grand Total';

  const valuesInRows = rowFields && rowFields.some(f => f === SIGMA_VALUES_ID);
  const valuesIndex = rowFields ? rowFields.indexOf(SIGMA_VALUES_ID) : -1;
  const isSubtotalRow = node.subtotals && hasKids;

  const fieldName = rowFields && rowFields[depth] ? rowFields[depth] : null;
  // For metric rows (at valuesIndex), use groupLabel (friendly name)
  // For dimension rows, use label (wrapped with dtype for proper formatting)
  const isMetricRow = valuesInRows && depth === valuesIndex;
  const displayLabel = fieldName && !isMetricRow
    ? formatRowLabel(node.label, fieldName)
    : (node.groupLabel || node.label || node.date || '(no label)');

  // Extract metric from row path when values are in rows
  let rowMetric = null;
  if (valuesInRows && valuesIndex >= 0 && node.path && node.path.length > valuesIndex) {
    rowMetric = node.path[valuesIndex];
  }

  let cellValues = node.values;
  if (isSubtotalRow) {
    cellValues = showRowSubtotals ? node.subtotals : null;
  } else if (!isLeaf && !node.subtotals) {
    cellValues = null;
  }

  const rowStyle = isGrand ? styles.grandTotalRow :
    (isSubtotalRow && showRowSubtotals ? styles.subtotalRow :
    (isLeaf ? styles.detailRow : styles.groupRow));

  // Label cell style - override font weight for subtotal rows (keep normal)
  const labelStyle = {
    ...styles.groupLabel,
    paddingLeft: `${12 + depth * 20}px`,
    ...(isSubtotalRow && !isGrand ? { fontWeight: 'normal' } : {})
  };

  return (
    <tr
      key={rowKey}
      style={{
        ...rowStyle,
        height: `${rowHeight}px`,
        transform: `translateY(${virtualStart}px)`
      }}
    >
      <td style={labelStyle}>
        {hasKids && (
          <button
            className="pp-icon-btn-primary-hover"
            style={styles.expandButton}
            onClick={(e) => {
              e.stopPropagation();
              toggle(rowKey);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (onChevronContextMenu) {
                onChevronContextMenu(e, { depth, fieldName, isOpen });
              }
            }}
            aria-label={isOpen ? `Collapse ${displayLabel}` : `Expand ${displayLabel}`}
          >
            {isOpen ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ pointerEvents: 'none' }}>
                <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ pointerEvents: 'none' }}>
                <polyline points="9 18 15 12 9 6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        )}
        <span style={styles.groupText}>{displayLabel}</span>
      </td>
      {renderCells(cellValues, leafColumns, styles, formatValue, rowMetric, node, rowFields, colFields, onCellContextMenu)}
    </tr>
  );
}
