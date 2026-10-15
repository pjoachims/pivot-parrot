import React, { useState, useRef, useMemo, useEffect } from 'react';
import ErrorBanner from '../shared/ErrorBanner';
import { gridColumnDef } from '../shared/gridColumn';
import { usePivotStore } from '../../application/state/store';
import { adaptQueryResult, toRows, type ColumnarResult } from '../../application/utils/columnarResult';

/**
 * SQLPlayground Component
 * SQL query editor with results displayed in ag-grid
 *
 * `results` is a columnar result adapter (see application/utils/columnarResult.ts) -
 * either backed by an Arrow Table (local engine) or a plain rows array (remote engine).
 * ag-grid still needs a rowData array, so we hand it tiny ordinal objects (`{ __row: i }`)
 * and read the actual values lazily per cell via per-column valueGetters.
 */
export default function SQLPlayground({
  sql = 'SELECT * FROM pivot_data LIMIT 100',
  onSQLChange,
  onExecuteSQL,
  sqlPlaygroundDisplayMode,
  onSQLPlaygroundDisplayModeChange,
  locale = 'en-US'
}) {
  const dialect = usePivotStore((s) => s.dialect);
  const [results, setResults] = useState<ColumnarResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const gridRef = useRef(null);
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

  // ag-grid's client-side row model needs a rowData array, but each entry is
  // just a tiny ordinal object - the real values are read lazily per cell via
  // valueGetter below, straight out of the adapter (Arrow vector or rows array).
  const rowData = useMemo(() => {
    if (!results || results.numRows === 0) return [];
    return Array.from({ length: results.numRows }, (_, i) => ({ __row: i }));
  }, [results]);

  // Create column definitions from the adapter's columns/dtypes
  const columnDefs = useMemo(() => {
    if (!results || results.numRows === 0) return [];

    return results.columnNames.map(key => gridColumnDef(key, key, results.dtypes[key], locale, dialect, row => results.getValue(row, key)));
  }, [results, locale, dialect]);

  // Default column configuration
  const defaultColDef = useMemo(() => ({
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 100
  }), []);

  // Autosize columns when grid is ready
  const onGridReady = (params) => {
    gridRef.current = params.api;
    params.api.sizeColumnsToFit();
  };

  // Autosize on data change
  useEffect(() => {
    if (gridRef.current && results && results.numRows > 0) {
      setTimeout(() => {
        gridRef.current.sizeColumnsToFit();
      }, 100);
    }
  }, [results]);

  const handleExecute = async () => {
    if (!sql.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const result = await onExecuteSQL(sql);
      setResults(adaptQueryResult(result));
    } catch (err) {
      setError(err.message || 'Query execution failed');
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!results || results.numRows === 0) return;

    // Convert to CSV (materializing the full result is unavoidable here -
    // CSV export has to touch every cell anyway)
    const headers = results.columnNames;
    const rows = toRows(results).map(row =>
      headers.map(h => {
        const val = row[h];
        const strVal = val === null || val === undefined ? '' : String(val);
        // Escape commas and quotes
        return strVal.includes(',') || strVal.includes('"')
          ? `"${strVal.replace(/"/g, '""')}"`
          : strVal;
      }).join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');

    // Download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'query_results.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <div style={styles.container}>
      {/* Header with display mode menu */}
      <div style={styles.header}>
        <h3 style={styles.title}>SQL Playground</h3>

        {/* Display Mode Menu */}
        <div style={styles.displayModeMenu}>
          <select
            value={sqlPlaygroundDisplayMode}
            onChange={(e) => onSQLPlaygroundDisplayModeChange(e.target.value)}
            style={styles.displayModeSelect}
          >
            <option value="split-below">Split Below</option>
            <option value="split-right">Split Right</option>
            <option value="full">Full Screen</option>
            <option value="hidden">Hide</option>
          </select>
        </div>
      </div>

      {/* SQL Editor */}
      <div style={styles.editorSection}>
        <textarea
          value={sql}
          onChange={(e) => onSQLChange && onSQLChange(e.target.value)}
          style={styles.textarea}
          placeholder="Enter SQL query..."
          spellCheck={false}
        />
        <div style={styles.editorToolbar}>
          <button
            onClick={handleExecute}
            disabled={loading}
            style={styles.executeButton}
          >
            {loading ? 'Executing...' : 'Execute'}
          </button>
          {results && results.numRows > 0 && (
            <>
              <span style={styles.resultCount}>
                {results.numRows} row{results.numRows !== 1 ? 's' : ''}
              </span>
              <button onClick={handleExportCSV} style={styles.exportButton}>
                Export CSV
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <ErrorBanner title="Error" message={error} style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none' }} />
      )}

      {/* Results Grid */}
      <div style={styles.gridContainer} className="ag-theme-alpine">
        {!gridLoaded ? (
          <div style={styles.loadingGrid}>
            <span className="pp-spinner" aria-hidden="true" />
            Loading grid library...
          </div>
        ) : results && results.numRows > 0 ? (
          <AgGridReact
            ref={gridRef}
            rowData={rowData}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            pagination={true}
            paginationPageSize={100}
            domLayout="normal"
            onGridReady={onGridReady}
          />
        ) : !loading && !error ? (
          <div style={styles.empty}>Execute a query to see results</div>
        ) : null}
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
    padding: '16px 20px',
    borderBottom: '1px solid var(--border-color-light)',
    background: 'var(--surface-subtle)'
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--text-primary)'
  },
  displayModeMenu: {
    display: 'flex',
    alignItems: 'center'
  },
  displayModeSelect: {
    padding: '6px 10px',
    fontSize: 'var(--text-base)',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--surface-bg)',
    cursor: 'pointer'
  },
  editorSection: {
    display: 'flex',
    flexDirection: 'column',
    borderBottom: '1px solid var(--border-color-light)',
    background: 'var(--surface-bg)'
  },
  textarea: {
    width: '100%',
    minHeight: '120px',
    padding: '12px',
    fontSize: 'var(--text-base)',
    fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
    border: 'none',
    resize: 'vertical',
    lineHeight: '1.5'
  },
  editorToolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px',
    borderTop: '1px solid var(--border-color-light)',
    background: 'var(--surface-subtle)'
  },
  executeButton: {
    padding: '6px 16px',
    fontSize: 'var(--text-base)',
    color: 'var(--text-inverse)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--color-accent)',
    cursor: 'pointer',
    fontWeight: 500,
    transition: 'background-color 0.2s'
  },
  resultCount: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginLeft: 'auto'
  },
  exportButton: {
    padding: '6px 12px',
    fontSize: 'var(--text-base)',
    color: 'var(--color-accent)',
    border: '1px solid var(--color-accent)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--surface-bg)',
    cursor: 'pointer',
    transition: 'all 0.2s'
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
    color: 'var(--text-muted)',
    fontSize: '14px'
  },
  loadingGrid: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    height: '100%',
    color: 'var(--text-muted)',
    fontSize: '14px'
  }
};
