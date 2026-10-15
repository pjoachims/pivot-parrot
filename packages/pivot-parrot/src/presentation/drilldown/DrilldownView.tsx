import React, { useState, useEffect, useMemo, useRef } from 'react';
import { usePivotStore } from '../../application/state/store';
import { gridColumnDef } from '../shared/gridColumn';
import { Icon } from '../shared/Icon';
import { fieldDisplayName } from '../../domain/field/fieldDisplayName';

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
  const config = usePivotStore((s) => s.config);
  const availableFields = usePivotStore((s) => s.availableFields);
  const dialect = usePivotStore((s) => s.dialect);
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
      .map(key => gridColumnDef(key, fieldDisplayName(key, config, availableFields), dtypes[key], locale, dialect, row => result.getValue(row, key)));
  }, [result, availableColumns, selectedColumns, dtypes, locale, dialect, config, availableFields]);

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
      onExportCSV(result, locale);
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
      <div className="pp-panel-header">
        <div style={styles.headerLeft}>
          <span className="pp-panel-title">Drilldown</span>

          {/* Info icon with hover tooltip */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
              className="pp-icon-btn"
              title="Drilldown details"
              aria-label="Drilldown details"
              onMouseEnter={() => setShowInfoTooltip(true)}
              onMouseLeave={() => setShowInfoTooltip(false)}
            >
              <Icon name="info" style={{ pointerEvents: 'none' }} />
            </button>

            {/* Info tooltip */}
            {showInfoTooltip && (
              <div
                className="pp-menu"
                style={styles.infoTooltip}
                onMouseEnter={() => setShowInfoTooltip(true)}
                onMouseLeave={() => setShowInfoTooltip(false)}
              >
                <div style={{ marginBottom: 'var(--space-3)' }}>
                  <div className="pp-section-title" style={{ marginBottom: 'var(--space-1)' }}>Filters</div>
                  <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {filterDisplay}
                  </div>
                </div>
                <div>
                  <div className="pp-section-title" style={{ marginBottom: 'var(--space-1)' }}>Rows</div>
                  <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
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
            <button onClick={handleCopySQL} className="pp-btn pp-btn--sm" title="Copy SQL query">
              <Icon name={copiedSQL ? 'check' : 'copy'} />
              {copiedSQL ? 'Copied' : 'Copy SQL'}
            </button>
          )}

          <button onClick={handleExportCSV} className="pp-btn pp-btn--sm">
            <Icon name="download" />
            Export CSV
          </button>

          {/* Column selector */}
          <div style={{ position: 'relative' }}>
            <button
              ref={columnButtonRef}
              onClick={handleColumnMenuClick}
              className="pp-btn pp-btn--sm"
              aria-expanded={showColumnMenu}
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
                <div className="pp-menu" style={{
                  ...styles.columnMenu,
                  ...(menuAbove ? styles.columnMenuAbove : {})
                }}>
                  <div style={styles.columnMenuHeader}>
                    <span className="pp-section-title">Select Columns</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => {
                          const allSelected = {};
                          availableColumns.forEach(col => {
                            allSelected[col] = true;
                          });
                          setSelectedColumns(allSelected);
                        }}
                        className="pp-btn pp-btn--quiet pp-btn--sm"
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
                        className="pp-btn pp-btn--quiet pp-btn--sm"
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <div style={styles.columnMenuList}>
                    {availableColumns.map(col => (
                      <label key={col} className="pp-check pp-row-hover" style={styles.columnMenuItem}>
                        <input
                          type="checkbox"
                          checked={selectedColumns[col] !== false}
                          onChange={(e) => {
                            setSelectedColumns({
                              ...selectedColumns,
                              [col]: e.target.checked
                            });
                          }}
                        />
                        <span className="pp-truncate">{fieldDisplayName(col, config, availableFields)}</span>
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
            className="pp-select pp-select--sm"
            style={{ width: 'auto' }}
            aria-label="Drilldown display mode"
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
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    flex: 1
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)'
  },
  gridContainer: {
    flex: 1,
    padding: 'var(--space-3)',
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
    marginTop: 'var(--space-1)',
    minWidth: '220px',
    maxWidth: '300px',
    zIndex: 'var(--z-dropdown)' as any,
    maxHeight: '400px',
    display: 'flex',
    flexDirection: 'column',
    paddingTop: 0
  },
  columnMenuAbove: {
    top: 'auto',
    bottom: '100%',
    marginTop: 0,
    marginBottom: 'var(--space-1)'
  },
  columnMenuHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-1) var(--space-1) var(--space-1) var(--space-3)',
    borderBottom: '1px solid var(--border-color-light)'
  },
  columnMenuList: {
    overflowY: 'auto',
    maxHeight: '350px',
    padding: 'var(--space-1) 0'
  },
  columnMenuItem: {
    display: 'flex',
    minHeight: 'var(--control-h-sm)',
    padding: '0 var(--space-3)',
    color: 'var(--text-primary)'
  },
  infoTooltip: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: 'var(--space-1)',
    minWidth: '280px',
    maxWidth: '400px',
    zIndex: 'var(--z-popover)' as any,
    padding: 'var(--space-3)'
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    padding: '2rem',
    color: 'var(--text-muted)',
    fontSize: 'var(--text-md)'
  }
};
