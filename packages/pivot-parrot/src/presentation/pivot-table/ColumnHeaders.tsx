import React from 'react';
import type { SortConfig } from '../../domain/models/types';
import { usePivotStore } from '../../application/state/store';
import { columnPathKey } from '../../application/utils/cubeIndex';
import { useColumnCollapse } from '../../application/hooks/useColumnCollapse';
import { Icon } from '../shared/Icon';

/**
 * Format a column header value based on field type
 */
function formatHeaderValue(value, field, dialect, dtypes) {
  if (value === null || value === undefined || value === '') return '(Blank)';
  if (typeof value === 'boolean') return String(value);

  // Look up typeName from dtypes mapping, keyed by field name
  const fieldName = typeof field === 'string' ? field : (field?.id || field?.name);
  if (fieldName && dtypes && dtypes[fieldName] !== undefined && dialect && dialect.toDisplay) {
    const fieldTypeName = dtypes[fieldName];
    const formatted = dialect.toDisplay(value, fieldTypeName);
    return String(formatted);
  }

  // Fallback: convert to string
  const str = String(value);

  // Remove quotes from large DECIMAL values (e.g., "17604449022020080021205" -> 17604449022020080021205)
  if (str.startsWith('"') && str.endsWith('"')) {
    return str.slice(1, -1);
  }

  return str;
}

/**
 * The sort a click on a leaf header applies: descending, then ascending, then
 * off. With Σ Values in rows a leaf has no metric of its own, so it sorts by
 * the value already chosen in the Sort menu, or else the first value.
 */
function nextSortForLeaf(leaf, sortConfig: SortConfig, valueFields: string[]): SortConfig {
  const valueKey = leaf.metric ?? sortConfig.valueKey ?? valueFields[0] ?? null;
  const columnPath = leaf.columnPath?.length ? leaf.columnPath : undefined;
  if (!isSortedBy(leaf, sortConfig)) return { valueKey, direction: 'desc', columnPath };
  if (sortConfig.direction === 'desc') return { valueKey, direction: 'asc', columnPath };
  return { valueKey: null, direction: 'desc' };
}

function isSortedBy(leaf, sortConfig: SortConfig): boolean {
  if (!sortConfig.valueKey) return false;
  if (leaf.metric != null && leaf.metric !== sortConfig.valueKey) return false;
  return columnPathKey(leaf.columnPath ?? []) === columnPathKey(sortConfig.columnPath ?? []);
}

/** A header cell; a leaf's cell sorts the rows, a group's cell may carry its chevron. */
function HeaderCell({ label, style, colSpan = 1, rowSpan = 1, leaf = null, columnName = '', sortConfig = null, onSort = null, chevron = null }) {
  const sorted = leaf && isSortedBy(leaf, sortConfig) ? sortConfig.direction : null;
  const name = leaf && [leaf.metric != null && leaf.label, columnName].filter(Boolean).join(', ');
  return (
    <th
      style={style}
      colSpan={colSpan}
      rowSpan={rowSpan}
      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
    >
      <div>
        {chevron}
        {leaf ? (
          <button type="button" className="pp-sort-header" aria-label={`Sort by ${name}`} onClick={() => onSort(leaf)}>
            {label}
            {sorted && <span aria-hidden="true">{sorted === 'asc' ? ' ↑' : ' ↓'}</span>}
          </button>
        ) : label}
      </div>
    </th>
  );
}

/**
 * Column Headers Component
 * Renders the complex hierarchical column headers for the pivot table
 */
export function ColumnHeaders({
  data,
  leafColumns,
  rowFields,
  rowFieldLabels,
  colFieldLabels,
  title,
  styles,
  dialect,
  dtypes,
  onGroupContextMenu = null
}) {
  const sortConfig = usePivotStore((s) => s.sortConfig);
  const setSort = usePivotStore((s) => s.setSort);
  const collapse = useColumnCollapse(data.columnConfig.groups);
  const onSort = (leaf) => setSort(nextSortForLeaf(leaf, sortConfig, data.columnConfig.valueFields || []));
  const formatMember = (member, d) => formatHeaderValue(member, data.columnConfig.colFields[d], dialect, dtypes);
  const columnName = (leaf) => leaf.columnPath?.length
    ? leaf.columnPath.map(formatMember).join(' / ')
    : leaf.isGrandTotal ? 'Grand Total' : '';

  // Special case: no column dimensions, just metrics
  if (data.columnConfig.colFields.length === 0 && leafColumns.length > 0) {
    const specialNumRows = 1; // Only 1 header row in this case
    return (
      <>
        <tr style={styles.headerRow}>
          <th style={{ ...styles.headerCell, ...styles.rowLabelHeader }} rowSpan={1}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gridTemplateRows: `repeat(${specialNumRows}, 1fr)`,
              gap: '8px',
              height: '100%'
            }}>
              {/* Left column: Spans all rows, flex inside for title top + row fields bottom */}
              <div style={{
                gridRow: '1 / -1',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: title ? 'space-between' : 'flex-end'
              }}>
                {title && <span style={styles.rowLabelsTitle}>{title}</span>}
                {rowFields && rowFields.length > 0 && (
                  <div style={{ ...styles.rowFieldsHierarchy, borderTop: 'none', paddingTop: 0 }} title={rowFieldLabels.join(' \\ ')}>
                    {rowFieldLabels.join(' \\ ')}
                  </div>
                )}
              </div>

              {/* Right column: Column fields, one per grid row - from original config */}
              {Array.from({ length: specialNumRows }).map((_, idx) => {
                const fieldName = colFieldLabels[idx] || '';

                return (
                  <div key={idx} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    borderLeft: '0.5px solid var(--border-color-light)',
                    paddingLeft: '8px'
                  }}>
                    {fieldName && (
                      <div style={{ ...styles.rowFieldsHierarchy, borderTop: 'none', paddingTop: 0 }} title={fieldName}>
                        {fieldName}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </th>
          {leafColumns.map((leaf, i) => (
            <HeaderCell
              key={i}
              leaf={leaf}
              label={leaf.label || leaf.metric || leaf.value}
              columnName={columnName(leaf)}
              style={{ ...styles.headerCell, ...styles.mainHeader, boxShadow: 'inset 0.5px 0 0 0 var(--border-color-light), inset 0 0.5px 0 0 var(--border-color-light), inset 0 -1px 0 0 var(--border-color-medium)' }}
              sortConfig={sortConfig}
              onSort={onSort}
            />
          ))}
        </tr>
      </>
    );
  }

  // Laid out from the data, not the config: a new config shows the previous data until its results arrive.
  // When values are in rows, we don't need an extra row for metric names
  const { colFields: dimFields, valuesIndex, valuesInRows } = data.columnConfig;
  const numHeaderRows = valuesInRows
    ? Math.max(dimFields.length, 1)  // Just dimension rows
    : Math.max(dimFields.length + 1, 1);  // Dimensions + metric row
  // The header row of the metric names; column fields after Σ Values sit one row lower
  const metricRow = valuesIndex >= 0 ? valuesIndex : dimFields.length;
  const rowOfDim = (d) => (valuesInRows || d < metricRow ? d : d + 1);

  const headerRows = [];
  for (let rowIdx = 0; rowIdx < numHeaderRows; rowIdx++) {
    headerRows.push([]);
  }

  /**
   * A leaf's header cells top to bottom: one per column member, plus its metric
   * name when values are in columns. `dims` and `metric` identify the cell, so
   * cells merge only within one group; `group` marks a cell heading a group.
   */
  const entriesOf = (leaf) => {
    const path = leaf.columnPath ?? leaf.path ?? [];
    const entries = path.map((member, d) => ({
      row: rowOfDim(d),
      dim: d,
      value: member,
      dims: path.slice(0, d + 1),
      metric: !valuesInRows && d >= metricRow ? leaf.metric : null,
      group: d + 1 < dimFields.length ? path.slice(0, d + 1) : null
    }));
    if (!valuesInRows) {
      entries.push({ row: metricRow, value: leaf.label || leaf.metric, dims: path.slice(0, metricRow), metric: leaf.metric, group: null, fixedLabel: true });
    }
    return entries.sort((a, b) => a.row - b.row);
  };
  const mergeKeyOf = (entry, suffix = '') => `${columnPathKey(entry.dims)}|${entry.metric ?? ''}${suffix}`;

  leafColumns.forEach((leaf) => {
    if (leaf.isGrandTotal) {
      if (valuesInRows || numHeaderRows === 1) {
        headerRows[0].push({ value: leaf.label || leaf.value || 'Total', rowSpan: numHeaderRows, isGrandTotal: true, fixedLabel: true, leaf });
      } else {
        for (let r = 0; r < numHeaderRows - 1; r++) {
          headerRows[r].push({ value: 'Grand Total', mergeKey: 'grand-total', isGrandTotal: true, fixedLabel: true });
        }
        headerRows[numHeaderRows - 1].push({ value: leaf.label || leaf.metric, isGrandTotal: true, fixedLabel: true, leaf });
      }
      return;
    }

    const entries = entriesOf(leaf);
    entries.forEach((entry, i) => {
      const isLast = i === entries.length - 1;
      const nextRow = isLast ? numHeaderRows : entries[i + 1].row;
      const subtotalBelow = leaf.isSubtotal && nextRow > entry.row + 1;
      const isLeafCell = isLast && !subtotalBelow;
      headerRows[entry.row].push({
        value: entry.value,
        dim: entry.dim,
        // A collapsed group's cells stretch over the rows its hidden members had
        rowSpan: leaf.isCollapsed ? nextRow - entry.row : 1,
        mergeKey: isLeafCell ? null : mergeKeyOf(entry),
        group: entry.group,
        fixedLabel: entry.fixedLabel,
        ...(isLeafCell && { leaf })
      });
      // A subtotal names itself in the rows its members would take
      if (subtotalBelow) {
        headerRows[entry.row + 1].push({
          value: 'Subtotal',
          rowSpan: nextRow - entry.row - 1,
          isSubtotal: true,
          fixedLabel: true,
          mergeKey: isLast ? null : mergeKeyOf(entry, '|subtotal'),
          ...(isLast && { leaf })
        });
      }
    });
  });

  // Neighbouring cells of one group (same path) merge into one spanning cell
  const mergedRows = headerRows.map(row => {
    const merged = [];
    row.forEach(cell => {
      const rowSpan = cell.rowSpan ?? 1;
      const last = merged[merged.length - 1];
      if (cell.mergeKey && last?.mergeKey === cell.mergeKey && last.rowSpan === rowSpan) {
        last.colSpan += 1;
      } else {
        merged.push({ ...cell, colSpan: 1, rowSpan });
      }
    });
    return merged;
  });

  return (
    <>
      {mergedRows.map((mergedRow, rowIdx) => {
        const isFirstRow = rowIdx === 0;
        return (
          <tr key={rowIdx} style={styles.headerRow}>
            {isFirstRow && (
              <th style={{ ...styles.headerCell, ...styles.rowLabelHeader }} rowSpan={numHeaderRows}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gridTemplateRows: `repeat(${numHeaderRows}, 1fr)`,
                  gap: '8px',
                  height: '100%'
                }}>
                  {/* Left column: Spans all rows, flex inside for title top + row fields bottom */}
                  <div style={{
                    gridRow: '1 / -1',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: title ? 'space-between' : 'flex-end'
                  }}>
                    {title && <span style={styles.rowLabelsTitle}>{title}</span>}
                    {rowFields && rowFields.length > 0 && (
                      <div style={{ ...styles.rowFieldsHierarchy, borderTop: 'none', paddingTop: 0 }} title={rowFieldLabels.join(' \\ ')}>
                        {rowFieldLabels.join(' \\ ')}
                      </div>
                    )}
                  </div>

                  {/* Right column: Column fields, one per grid row - from original config */}
                  {Array.from({ length: numHeaderRows }).map((_, idx) => {
                    const fieldName = colFieldLabels[idx] || '';

                    return (
                      <div key={idx} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        borderLeft: '0.5px solid var(--border-color-light)',
                        paddingLeft: '8px'
                      }}>
                        {fieldName && (
                          <div style={{ ...styles.rowFieldsHierarchy, borderTop: 'none', paddingTop: 0 }} title={fieldName}>
                            {fieldName}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </th>
            )}
            {mergedRow.map((h, i) => {
              let headerStyle = h.isGrandTotal ? { ...styles.headerCell, ...styles.grandTotalHeader} :
                                h.isSubtotal ? { ...styles.headerCell, ...styles.subtotalHeader } :
                                { ...styles.headerCell, ...styles.mainHeader };

              // Add bold bottom border to headers that reach the last row
              if (rowIdx + (h.rowSpan || 1) === mergedRows.length) {
                headerStyle = {
                  ...headerStyle,
                  boxShadow: 'inset 0.5px 0 0 0 var(--border-color-light), inset 0 0.5px 0 0 var(--border-color-light), inset 0 -1px 0 0 var(--border-color-medium)'
                };
              }

              const label = h.fixedLabel ? h.value : formatMember(h.value, h.dim);
              const group = h.group && collapse.canCollapse(h.group) ? h.group : null;
              const groupCollapsed = group && collapse.isCollapsed(group);
              const chevron = group && (
                <button
                  type="button"
                  className="pp-expand-btn"
                  style={styles.expandButton}
                  aria-expanded={!groupCollapsed}
                  aria-label={`${groupCollapsed ? 'Expand' : 'Collapse'} ${label}`}
                  onClick={() => collapse.toggle(group)}
                  onContextMenu={(e) => {
                    if (!onGroupContextMenu) return;
                    e.preventDefault();
                    // The menu closes on any contextmenu reaching the document, this one included
                    e.stopPropagation();
                    onGroupContextMenu(e, group);
                  }}
                >
                  <Icon name={groupCollapsed ? 'chevron-right' : 'chevron-down'} style={{ pointerEvents: 'none' }} />
                </button>
              );

              return (
                <HeaderCell
                  key={`${rowIdx}-${i}`}
                  label={label}
                  style={headerStyle}
                  colSpan={h.colSpan}
                  rowSpan={h.rowSpan}
                  leaf={h.leaf ?? null}
                  columnName={h.leaf ? columnName(h.leaf) : ''}
                  sortConfig={sortConfig}
                  onSort={onSort}
                  chevron={chevron}
                />
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
