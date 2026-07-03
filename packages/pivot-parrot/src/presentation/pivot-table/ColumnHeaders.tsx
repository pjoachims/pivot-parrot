import React from 'react';

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
 * Column Headers Component
 * Renders the complex hierarchical column headers for the pivot table
 */
export function ColumnHeaders({
  data,
  leafColumns,
  rowFields,
  colFields,
  title,
  styles,
  dialect,
  dtypes
}) {
  // Debug: expose leaf columns
  if (typeof window !== 'undefined') {
    window.debugLeafColumns = leafColumns;
  }

  // Helper: extract field name (handles FieldItem objects and 'Σ Values' string)
  const getFieldName = (f) => typeof f === 'string' ? f : (f.name || f.id);

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
                  <div style={{ ...styles.rowFieldsHierarchy, borderTop: 'none', paddingTop: 0 }}>
                    {rowFields.map(getFieldName).join(' \\ ')}
                  </div>
                )}
              </div>

              {/* Right column: Column fields, one per grid row - from original config */}
              {Array.from({ length: specialNumRows }).map((_, idx) => {
                const field = colFields[idx] || '';
                const fieldName = getFieldName(field);

                return (
                  <div key={idx} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    borderLeft: '0.5px solid var(--border-color-light)',
                    paddingLeft: '8px'
                  }}>
                    {fieldName && (
                      <div style={{ ...styles.rowFieldsHierarchy, borderTop: 'none', paddingTop: 0 }}>
                        {fieldName}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </th>
          {leafColumns.map((leaf, i) => (
            <th key={i} style={{ ...styles.headerCell, ...styles.mainHeader, boxShadow: 'inset 0.5px 0 0 0 var(--border-color-light), inset 0 0.5px 0 0 var(--border-color-light), inset 0 -1px 0 0 var(--border-color-medium)' }}>
              <div>{leaf.label || leaf.metric || leaf.value}</div>
            </th>
          ))}
        </tr>
      </>
    );
  }

  // When values are in rows, we don't need an extra row for metric names
  const valuesInRows = rowFields && rowFields.some(f => f === 'Σ Values');
  const numHeaderRows = valuesInRows
    ? Math.max(data.columnConfig.colFields.length, 1)  // Just dimension rows
    : Math.max(data.columnConfig.colFields.length + 1, 1);  // Dimensions + metric row

  const headerRows = [];
  for (let rowIdx = 0; rowIdx < numHeaderRows; rowIdx++) {
    headerRows.push([]);
  }

  // Process each leaf column
  leafColumns.forEach((leaf, leafIdx) => {
    const path = leaf.path || [];

    if (leaf.isGrandTotal) {
      // Grand Total column
      if (valuesInRows || numHeaderRows === 1) {
        // Values in rows OR no column dimensions: just show the label once
        headerRows[0].push({
          value: leaf.label || leaf.value || 'Total',
          colSpan: 1,
          rowSpan: 1,
          isGrandTotal: true,
          isSubtotal: false,
          shared: true  // Allow merging multiple grand total headers
        });
      } else {
        // Values in columns with multiple header rows
        // Fill all rows except the last with "Grand Total"
        for (let r = 0; r < numHeaderRows - 1; r++) {
          headerRows[r].push({
            value: 'Grand Total',
            shared: true,
            isSubtotal: false,
            isGrandTotal: true
          });
        }
        // Last row: metric name
        headerRows[numHeaderRows - 1].push({
          value: leaf.label || leaf.metric,
          isSubtotal: false,
          isGrandTotal: true
        });
      }
    } else if (leaf.isSubtotal) {
      // Subtotal column - use displayPath just like detail columns
      const displayPath = leaf.displayPath || path;
      const subtotalDepth = path.length; // Depth of this subtotal

      // Add displayPath values to their respective rows
      displayPath.forEach((p, idx) => {
        if (idx < headerRows.length) {
          headerRows[idx].push({
            value: p,
            shared: true,
            isSubtotal: false,
            isGrandTotal: false
          });
        }
      });

      // If displayPath doesn't fill all header rows, add "Subtotal" label for remaining rows
      if (displayPath.length < numHeaderRows) {
        headerRows[displayPath.length].push({
          value: 'Subtotal',
          colSpan: 1,
          rowSpan: numHeaderRows - displayPath.length,
          isSubtotal: true,
          isGrandTotal: false
        });
      }
    } else {
      // Regular detail column
      // Use displayPath if available (contains labels), otherwise fall back to path (contains IDs)
      const displayPath = leaf.displayPath || path;

      displayPath.forEach((p, idx) => {
        // Safety check: only add to rows that exist
        if (idx < headerRows.length) {
          headerRows[idx].push({
            value: p,
            shared: true,
            isSubtotal: false,
            isGrandTotal: false
          });
        }
      });
    }
  });

  // Helper to compare header values
  const compareHeaderValues = (val1, val2) => val1 === val2;

  // Merge consecutive identical headers in each row
  const mergedRows = headerRows.map((row, rowIdx) => {
    const merged = [];
    let i = 0;
    while (i < row.length) {
      const cell = row[i];
      if (cell.shared) {
        let span = 1;
        while (i + span < row.length && row[i + span].shared && compareHeaderValues(row[i + span].value, cell.value)) {
          span++;
        }
        // Mark first cell of each unique value at this level
        merged.push({ ...cell, colSpan: span, rowSpan: 1, isFirstOfLevel: i === 0 || merged.length === 0 || !compareHeaderValues(merged[merged.length - 1].value, cell.value), fieldLevel: rowIdx });
        i += span;
      } else {
        merged.push({ ...cell, isFirstOfLevel: false });
        i++;
      }
    }
    return merged;
  });

  const hasColFields = data.columnConfig.colFields.length > 0;

  // Track which field level we're on for each merged row
  let fieldLevelForRow = [];
  if (hasColFields) {
    // First row is field level 0
    fieldLevelForRow.push(0);
    // Subsequent rows increment field level
    for (let i = 1; i < mergedRows.length; i++) {
      const fieldIdx = i;
      if (fieldIdx < data.columnConfig.colFields.length) {
        fieldLevelForRow.push(fieldIdx);
      } else {
        fieldLevelForRow.push(null); // No field for this row
      }
    }
  }

  return (
    <>
      {mergedRows.map((mergedRow, rowIdx) => {
        const isFirstRow = rowIdx === 0;
        const isLastRow = rowIdx === mergedRows.length - 1;
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
                      <div style={{ ...styles.rowFieldsHierarchy, borderTop: 'none', paddingTop: 0 }}>
                        {rowFields.map(getFieldName).join(' \\ ')}
                      </div>
                    )}
                  </div>

                  {/* Right column: Column fields, one per grid row - from original config */}
                  {Array.from({ length: numHeaderRows }).map((_, idx) => {
                    const field = colFields[idx] || '';
                    const fieldName = getFieldName(field);

                    return (
                      <div key={idx} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        borderLeft: '0.5px solid var(--border-color-light)',
                        paddingLeft: '8px'
                      }}>
                        {fieldName && (
                          <div style={{ ...styles.rowFieldsHierarchy, borderTop: 'none', paddingTop: 0 }}>
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

              // Add bold bottom border to last row headers
              if (isLastRow) {
                headerStyle = {
                  ...headerStyle,
                  boxShadow: 'inset 0.5px 0 0 0 var(--border-color-light), inset 0 0.5px 0 0 var(--border-color-light), inset 0 -1px 0 0 var(--border-color-medium)'
                };
              }

              // Get the field for this level to use for formatting
              const field = colFields[rowIdx] || null;
              const formattedValue = formatHeaderValue(h.value, field, dialect, dtypes);

              const cellKey = `${rowIdx}-${i}`;
              if (h.rowSpan && h.rowSpan > 1) {
                return (
                  <th key={cellKey} style={headerStyle} colSpan={h.colSpan || 1} rowSpan={h.rowSpan}>
                    <div>{formattedValue}</div>
                  </th>
                );
              }
              return (
                <th key={cellKey} style={headerStyle} colSpan={h.colSpan || 1}>
                  <div>{formattedValue}</div>
                </th>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
