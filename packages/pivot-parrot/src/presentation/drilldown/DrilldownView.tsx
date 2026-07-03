import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getArrowType } from '../../domain/types/ArrowTypes';
import { usePivotStore } from '../../application/state/store';
import { convertForGrid } from '../../application/utils/columnarResult';

// Constants
const COPY_FEEDBACK_DURATION_MS = 2000; // Duration to show "Copied!" feedback

/**
 * DrilldownView Component
 * Shows raw data for a specific pivot cell using ag-grid in a split view
 *
 * `drilldownData` is a columnar result adapter (see application/utils/columnarResult.ts) -
 * either backed by an Arrow Table (local engine) or a plain rows array (remote engine),
 * accessed uniformly via numRows/columnNames/getValue. ag-grid's client-side row model
 * still needs a rowData array, so we hand it tiny ordinal objects (`{ __row: i }`) and
 * read the actual values lazily per cell through per-column valueGetters - the
 * underlying data never gets flattened into per-row objects.
 */
export default function DrilldownView({ drilldownData: result, filters, sql, dtypes = {}, onExportCSV, drilldownDisplayMode, onDrilldownDisplayModeChange, locale = 'en-US' }) {
  const gridRef = useRef(null);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const selectedColumns = usePivotStore((s) => s.drilldownSelectedColumns);
  const setSelectedColumns = usePivotStore((s) => s.setDrilldownSelectedColumns);
  const [menuAbove, setMenuAbove] = useState(false);
  const [copiedSQL, setCopiedSQL] = useState(false);
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const columnButtonRef = useRef(null);
  const [AgGridReact, setAgGridReact] = useState(null);
  const [gridLoaded, setGridLoaded] = useState(false);

  // Load AG Grid dynamically
  useEffect(() => {
    let mounted = true;

    Promise.all([
      import('ag-grid-react').then(m => m.AgGridReact),
      import('ag-grid-community/styles/ag-grid.css'),
      import('ag-grid-community/styles/ag-theme-alpine.css')
    ]).then(([GridComponent]) => {
      if (mounted) {
        setAgGridReact(() => GridComponent);
        setGridLoaded(true);
      }
    }).catch((err) => {
      console.error('Failed to load AG Grid:', err);
    });

    return () => { mounted = false; };
  }, []);

  // Available columns straight from the adapter (Arrow schema or row keys)
  const availableColumns = useMemo(() => {
    if (!result || result.numRows === 0) return [];
    return result.columnNames;
  }, [result]);

  // Initialize selectedColumns when data changes - merge with existing preferences
  useEffect(() => {
    if (availableColumns.length > 0) {
      // Merge existing preferences with new columns
      const merged = {};
      availableColumns.forEach(col => {
        // Keep existing preference if it exists, otherwise default to true
        merged[col] = col in selectedColumns ? selectedColumns[col] : true;
      });
      // Only update if there are changes (new columns appeared)
      const hasNewColumns = availableColumns.some(col => !(col in selectedColumns));
      if (hasNewColumns) {
        setSelectedColumns(merged);
      }
    }
  }, [availableColumns]);

  // ag-grid's client-side row model needs a rowData array, but each entry is
  // just a tiny ordinal object - the real values are read lazily per cell via
  // valueGetter below, straight out of the adapter (Arrow vector or rows array).
  const rowData = useMemo(() => {
    if (!result || result.numRows === 0) return [];
    return Array.from({ length: result.numRows }, (_, i) => ({ __row: i }));
  }, [result]);

  // Create column definitions from selected columns
  const columnDefs = useMemo(() => {
    if (!result || result.numRows === 0) return [];

    return availableColumns
      .filter(key => selectedColumns[key] !== false)
      .map(key => {
        const arrowType = getArrowType(dtypes[key]);

        const colDef: any = {
          field: key,
          headerName: key,
          sortable: true,
          filter: true,
          resizable: true,
          minWidth: 100,
          valueGetter: (params) => convertForGrid(result.getValue(params.data.__row, key), arrowType)
        };

        // Set appropriate filter based on Arrow type category
        if (arrowType?.category === 'temporal') {
          colDef.filter = 'agDateColumnFilter';
          colDef.valueFormatter = (params) => {
            if (!params.value) return '';
            if (params.value instanceof Date) {
              // Use toLocaleDateString for date types, toLocaleString for timestamps
              return arrowType.name === 'timestamp'
                ? params.value.toLocaleString(locale)
                : params.value.toLocaleDateString(locale);
            }
            return params.value;
          };
        } else if (arrowType?.isNumeric) {
          colDef.filter = 'agNumberColumnFilter';
        } else if (arrowType?.category === 'boolean') {
          colDef.filter = 'agSetColumnFilter';
        } else {
          colDef.filter = 'agTextColumnFilter';
        }

        return colDef;
      });
  }, [result, availableColumns, selectedColumns, dtypes, locale]);

  // Default column configuration
  const defaultColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 100
  }), []);

  // Show the actual executed SQL
  const filterDisplay = sql || 'No query executed';

  // Autosize columns when grid is ready
  const onGridReady = (params) => {
    gridRef.current = params.api;
    params.api.sizeColumnsToFit();
  };

  // Autosize on data change
  useEffect(() => {
    if (gridRef.current && result && result.numRows > 0) {
      setTimeout(() => {
        gridRef.current.sizeColumnsToFit();
      }, 100);
    }
  }, [result]);

  // Autosize on column selection change
  useEffect(() => {
    if (gridRef.current) {
      setTimeout(() => {
        gridRef.current.sizeColumnsToFit();
      }, 100);
    }
  }, [selectedColumns]);

  // Autosize on display mode change (split-below -> split-right, etc.)
  useEffect(() => {
    if (gridRef.current) {
      setTimeout(() => {
        gridRef.current.sizeColumnsToFit();
      }, 200); // Longer delay to allow layout to settle
    }
  }, [drilldownDisplayMode]);

  const handleExportCSV = () => {
    if (onExportCSV) {
      onExportCSV(result);
    }
  };

  const handleCopySQL = async () => {
    if (!sql) return;
    try {
      await navigator.clipboard.writeText(sql);
      setCopiedSQL(true);
      setTimeout(() => setCopiedSQL(false), COPY_FEEDBACK_DURATION_MS);
    } catch (err) {
      console.error('Failed to copy SQL:', err);
    }
  };

  // Check available space and position menu above if needed
  const handleColumnMenuClick = () => {
    if (columnButtonRef.current) {
      const rect = columnButtonRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const menuHeight = 400; // max height of menu

      // If not enough space below, show above
      setMenuAbove(spaceBelow < menuHeight && rect.top > menuHeight);
    }
    setShowColumnMenu(!showColumnMenu);
  };

  return (
    <div style={styles.container}>
      {/* Header with display mode menu */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.title}>Drilldown</span>

          {/* Info icon with hover tooltip */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
              className="pp-icon-btn-hover"
              style={styles.infoButton}
              title="Drilldown details"
              aria-label="Drilldown details"
              onMouseEnter={() => setShowInfoTooltip(true)}
              onMouseLeave={() => setShowInfoTooltip(false)}
            >
              <svg style={{ width: '16px', height: '16px', pointerEvents: 'none' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>

            {/* Info tooltip */}
            {showInfoTooltip && (
              <div
                style={styles.infoTooltip}
                onMouseEnter={() => setShowInfoTooltip(true)}
                onMouseLeave={() => setShowInfoTooltip(false)}
              >
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', fontSize: '11px' }}>Filters</div>
                  <div style={{ color: 'var(--text-muted)', lineHeight: '1.5', fontSize: '11px', fontFamily: 'monospace' }}>
                    {filterDisplay}
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px', fontSize: '11px' }}>Rows</div>
                  <div style={{ color: 'var(--text-muted)', lineHeight: '1.5', fontSize: '11px' }}>
                    {result && result.numRows >= 10000
                      ? 'Limited to 10,000 rows (query may have returned more)'
                      : `${result?.numRows || 0} row${result?.numRows !== 1 ? 's' : ''}`}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={styles.headerRight}>
          {sql && (
            <button onClick={handleCopySQL} style={styles.exportButton} title="Copy SQL query">
              {copiedSQL ? '✓ Copied!' : 'Copy SQL'}
            </button>
          )}

          <button onClick={handleExportCSV} style={styles.exportButton}>
            Export CSV
          </button>

          {/* Column selector */}
          <div style={{ position: 'relative' }}>
            <button
              ref={columnButtonRef}
              onClick={handleColumnMenuClick}
              style={styles.exportButton}
              title="Select columns"
            >
              Columns ({availableColumns.filter(col => selectedColumns[col] !== false).length}/{availableColumns.length})
            </button>

            {showColumnMenu && (
              <>
                <div
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 'var(--z-dropdown)' as any
                  }}
                  onClick={() => setShowColumnMenu(false)}
                />
                <div style={{
                  ...styles.columnMenu,
                  ...(menuAbove ? styles.columnMenuAbove : {})
                }}>
                  <div style={styles.columnMenuHeader}>
                    <span>Select Columns</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => {
                          const allSelected = {};
                          availableColumns.forEach(col => {
                            allSelected[col] = true;
                          });
                          setSelectedColumns(allSelected);
                        }}
                        style={styles.columnMenuAction}
                      >
                        All
                      </button>
                      <button
                        onClick={() => {
                          const noneSelected = {};
                          availableColumns.forEach(col => {
                            noneSelected[col] = false;
                          });
                          setSelectedColumns(noneSelected);
                        }}
                        style={styles.columnMenuAction}
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <div style={styles.columnMenuList}>
                    {availableColumns.map(col => (
                      <label key={col} style={styles.columnMenuItem}>
                        <input
                          type="checkbox"
                          checked={selectedColumns[col] !== false}
                          onChange={(e) => {
                            setSelectedColumns({
                              ...selectedColumns,
                              [col]: e.target.checked
                            });
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                        <span className="pp-truncate">{col}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <select
            value={drilldownDisplayMode}
            onChange={(e) => onDrilldownDisplayModeChange(e.target.value)}
            style={styles.displayModeSelect}
          >
            <option value="split-below">Split Below</option>
            <option value="split-right">Split Right</option>
            <option value="full">Full Screen</option>
            <option value="hidden">Hide</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      <div style={styles.gridContainer} className="ag-theme-alpine ag-theme-compact">
        <style>{`
          .ag-theme-compact {
            --ag-font-size: 11px;
            --ag-row-height: 25px;
            --ag-header-height: 28px;
          }
        `}</style>
        {!gridLoaded ? (
          <div style={styles.loading}>
            <span className="pp-spinner" aria-hidden="true" />
            Loading grid library...
          </div>
        ) : rowData && rowData.length > 0 ? (
          <AgGridReact
            ref={gridRef}
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            pagination={true}
            paginationPageSize={100}
            domLayout="normal"
            onGridReady={onGridReady}
            enableCellTextSelection={true}
          />
        ) : (
          <div style={styles.empty}>No data to display</div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%',
    background: 'var(--surface-bg)',
    overflow: 'hidden'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: '1px solid var(--border-color-light)',
    background: 'var(--surface-subtle)'
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
    overflow: 'visible' // Changed from 'hidden' to allow tooltip to show
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  title: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap'
  },
  separator: {
    color: 'var(--border-color-medium)',
    fontSize: '13px',
    userSelect: 'none'
  },
  filterInfo: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  rowCount: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap'
  },
  displayModeSelect: {
    padding: '4px 8px',
    fontSize: '11px',
    border: '1px solid var(--border-color-medium)',
    borderRadius: '4px',
    backgroundColor: 'var(--surface-bg)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    flexShrink: 0
  },
  exportButton: {
    padding: '4px 10px',
    fontSize: '11px',
    color: 'var(--color-accent)',
    border: '1px solid var(--color-accent)',
    borderRadius: '4px',
    backgroundColor: 'var(--surface-bg)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
    flexShrink: 0
  },
  gridContainer: {
    flex: 1,
    padding: '20px',
    overflow: 'hidden'
  },
  empty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-muted)'
  },
  columnMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '4px',
    minWidth: '200px',
    maxWidth: '300px',
    background: 'var(--surface-bg)',
    border: '1px solid var(--border-color-medium)',
    borderRadius: '6px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    zIndex: 'var(--z-dropdown)' as any,
    maxHeight: '400px',
    display: 'flex',
    flexDirection: 'column'
  },
  columnMenuAbove: {
    top: 'auto',
    bottom: '100%',
    marginTop: 0,
    marginBottom: '4px'
  },
  columnMenuHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 10px',
    borderBottom: '1px solid var(--border-color-light)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-secondary)'
  },
  columnMenuAction: {
    padding: '2px 6px',
    fontSize: '10px',
    color: 'var(--color-accent)',
    background: 'transparent',
    border: '1px solid var(--color-accent)',
    borderRadius: '3px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  columnMenuList: {
    overflowY: 'auto',
    maxHeight: '350px',
    padding: '4px'
  },
  columnMenuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 8px',
    fontSize: '11px',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    borderRadius: '3px',
    userSelect: 'none',
    transition: 'background 0.2s'
  },
  infoButton: {
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    background: 'transparent',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    marginLeft: '4px',
    transition: 'background 0.15s'
  },
  infoTooltip: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: '8px',
    minWidth: '280px',
    maxWidth: '400px',
    background: 'var(--surface-bg)',
    border: '1px solid var(--border-color-medium)',
    borderRadius: '6px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.1), 0 4px 10px rgba(0,0,0,0.05)',
    zIndex: 'var(--z-popover)' as any,
    padding: '12px',
    fontSize: '11px',
    color: 'var(--text-secondary)'
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '2rem',
    color: 'var(--text-muted)',
    fontSize: '14px'
  }
};
