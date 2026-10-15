import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Icon } from '../shared/Icon';
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
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
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
    const started = performance.now();

    try {
      const result = await onExecuteSQL(sql);
      setResults(adaptQueryResult(result));
    } catch (err) {
      setError(err.message || 'Query execution failed');
      setResults(null);
    } finally {
      setElapsedMs(Math.round(performance.now() - started));
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

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const shortcut = isMac ? '⌘↵' : 'Ctrl+↵';
  const rowCount = results?.numRows ?? 0;

  return (
    <div style={styles.container}>
      <div className="pp-panel-header">
        <span className="pp-panel-title">SQL Playground</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <select
            value={sqlPlaygroundDisplayMode}
            onChange={(e) => onSQLPlaygroundDisplayModeChange(e.target.value)}
            className="pp-select pp-select--sm"
            style={{ width: 'auto' }}
            aria-label="SQL Playground display mode"
          >
            <option value="split-below">Split Below</option>
            <option value="split-right">Split Right</option>
            <option value="full">Full Screen</option>
            <option value="hidden">Hide</option>
          </select>
        </div>
      </div>

      <div style={styles.editorSection}>
        <textarea
          value={sql}
          onChange={(e) => onSQLChange && onSQLChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleExecute();
            }
          }}
          className="pp-textarea pp-textarea--code"
          style={{ minHeight: '96px', maxHeight: '40vh' }}
          aria-label="SQL query"
          placeholder="SELECT * FROM pivot_data LIMIT 100"
          spellCheck={false}
        />
        <div style={styles.statusLine} role="status" aria-live="polite">
          <span className="pp-hint" style={{ flex: 1, minWidth: 0 }}>
            {loading
              ? 'Running…'
              : error
                ? <span style={{ color: 'var(--color-error)' }}>{error}</span>
                : results
                  ? `${rowCount.toLocaleString(locale)} row${rowCount !== 1 ? 's' : ''} · ${elapsedMs} ms`
                  : 'Not run yet'}
          </span>
          {rowCount > 0 && (
            <button onClick={handleExportCSV} className="pp-btn pp-btn--sm">
              <Icon name="download" />
              Export CSV
            </button>
          )}
          <button
            onClick={handleExecute}
            disabled={loading || !sql.trim()}
            className="pp-btn pp-btn--primary pp-btn--sm"
            title={`Run query (${shortcut})`}
          >
            <Icon name="play" />
            {loading ? 'Running…' : 'Run'}
            <kbd style={styles.kbd}>{shortcut}</kbd>
          </button>
        </div>
      </div>

      <div style={styles.gridContainer} className="ag-theme-alpine ag-theme-compact">
        {!gridLoaded ? (
          <div style={styles.loadingGrid}>
            <span className="pp-spinner" aria-hidden="true" />
            Loading grid library...
          </div>
        ) : rowCount > 0 ? (
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
        ) : !loading ? (
          <div style={styles.empty}>
            <span>{error ? 'No rows: the query failed' : results ? 'The query returned no rows' : 'Run a query to see rows'}</span>
            {!results && !error && <span className="pp-hint">{shortcut} in the editor runs it</span>}
          </div>
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
  editorSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    padding: 'var(--space-3)'
  },
  statusLine: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)'
  },
  kbd: {
    marginLeft: 'var(--space-1)',
    fontFamily: 'inherit',
    fontSize: 'var(--text-xs)',
    opacity: 0.75
  },
  gridContainer: {
    flex: 1,
    minHeight: 0,
    padding: '0 var(--space-3) var(--space-3)',
    overflow: 'hidden'
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-1)',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    border: '1px dashed var(--border-color-light)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-muted)',
    fontSize: 'var(--text-md)'
  },
  loadingGrid: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    height: '100%',
    color: 'var(--text-muted)',
    fontSize: 'var(--text-md)'
  }
};
