import { useState, useRef, useEffect } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import { Pivot } from 'pivot-parrot';
// CSS is now bundled into the JS automatically - no need to import separately
import { SAMPLE_DATA } from './sampleData';
import DataSource from './DataSource';

function App() {
  // Data state
  const [data, setData] = useState(SAMPLE_DATA);
  const [dataSource, setDataSource] = useState('Sample Data');
  const [rowCount, setRowCount] = useState(SAMPLE_DATA.length);
  const [dataEngine, setDataEngine] = useState(null);
  const [originalFile, setOriginalFile] = useState(null); // Store original file for re-reading

  // Pivot key to force remount when data changes
  const [pivotKey, setPivotKey] = useState(0);

  // Auto-update state
  const [autoUpdate, setAutoUpdate] = useState(true);

  // CSV decimal separator option
  const [decimalSeparator, setDecimalSeparator] = useState('.');

  // Ref to access Pivot methods
  const pivotRef = useRef(null);

  // Pivot configuration state
  const [pivotConfig, setPivotConfig] = useState({
    filters: [],
    rows: ['date', 'region'],
    columns: ['category'],
    values: [{ field: 'sales', aggregation: 'sum' }, { field: 'qty', aggregation: 'sum' } ],
    customMetrics: [{
        id: 'avg_sale_price',
        name: 'Avg Sale Price',
        expr: 'SUM(sales) / NULLIF(SUM(qty), 0)'
    }],
    customGroupings: [
      {
        id: 'is_high_value',
        name: 'Is High Value',
        expr: 'sales > 500'
      },
      {
        id: 'value_tier',
        name: 'Value Tier',
        expr: 'CASE WHEN {{Is High Value}} THEN \'Premium\' ELSE \'Standard\' END'
      }
    ],
    customFilters: []
  });

  // SQL Playground state (demo feature)
  const [sqlPlaygroundOpen, setSqlPlaygroundOpen] = useState(false);
  const [sqlQueryInput, setSqlQueryInput] = useState('SELECT * FROM pivot_data LIMIT 10');
  const [sqlResults, setSqlResults] = useState(null);
  const [sqlExecuting, setSqlExecuting] = useState(false);
  const [sqlError, setSqlError] = useState(null);

  // Theme lives in the library now (toggle is in the pivot toolbar, see
  // PivotDisplayHeader.tsx) - this just seeds data-theme on mount so the
  // shell renders themed from the first paint. Stored choice wins;
  // otherwise follow the OS. No React state: the toolbar owns changes
  // after this by writing document.documentElement.dataset.theme directly.
  useEffect(() => {
    const stored = localStorage.getItem('pp-theme');
    document.documentElement.dataset.theme =
      stored === 'dark' || stored === 'light'
        ? stored
        : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }, []);

  function handleDataChange(newData, fields, fileName, file = null) {
    // Store the original file so we can re-read it later
    setOriginalFile(file);

    setData(newData);
    setDataSource(fileName);
    setRowCount(Array.isArray(newData) ? newData.length : 0);

    // Clear SQL playground results
    setSqlResults(null);
    setSqlError(null);

    // Clear pivot config when new data is loaded
    setPivotConfig({
      filters: [],
      rows: [],
      columns: [],
      values: [],
      customMetrics: [],
      customFilters: [],
      customGroupings: []
    });

    // Force Pivot remount and refresh
    setPivotKey(prev => prev + 1);
  }

  function handleResetToSample() {
    setData(SAMPLE_DATA);
    setDataSource('Sample Data');
    setRowCount(SAMPLE_DATA.length);
    setOriginalFile(null); // Clear file reference

    // Restore sample config
    setPivotConfig({
      filters: [],
      rows: ['date', 'region'],
      columns: ['category'],
      values: [{ field: 'sales', aggregation: 'sum' }],
      customMetrics: [],
      customGroupings: [
        {
          id: 'is_high_value',
          name: 'Is High Value',
          expr: 'sales > 500'
        },
        {
          id: 'value_tier',
          name: 'Value Tier',
          expr: 'CASE WHEN {{Is High Value}} THEN \'Premium\' ELSE \'Standard\' END'
        }
      ],
      customFilters: []
    });
    setPivotKey(prev => prev + 1); // Force Pivot remount
  }

  async function handleReloadData() {
    // Clear SQL playground results
    setSqlResults(null);
    setSqlError(null);

    // Re-read file from scratch if available
    if (originalFile) {
      const arrayBuffer = await originalFile.arrayBuffer();
      setData(arrayBuffer);
    } else if (Array.isArray(data)) {
      // For sample data, just clone the array
      setData([...data]);
    }

    // Force Pivot remount and refresh
    setPivotKey(prev => prev + 1);
  }

  // Databricks connection removed - use RemoteDataEngine directly if needed

  async function handleExecuteSQL() {
    const dataEngine = pivotRef.current?.getDataEngine();
    if (!dataEngine) {
      setSqlError('Database not initialized');
      return;
    }

    setSqlExecuting(true);
    setSqlError(null);
    setSqlResults(null);

    try {
      const result = await dataEngine.executeQuery(sqlQueryInput, false);
      setSqlResults(result.data);
    } catch (err) {
      setSqlError(err.message);
    } finally {
      setSqlExecuting(false);
    }
  }

  return (
    <div style={styles.root}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>🦜 Pivot Parrot</h1>
          <p style={styles.subtitle}>
            Data: {dataSource} • {rowCount.toLocaleString()} rows
          </p>
        </div>
        <div style={styles.headerActions}>
          <button
            style={styles.headerButton}
            onClick={() => setSqlPlaygroundOpen(!sqlPlaygroundOpen)}
          >
            {sqlPlaygroundOpen ? '📊 Hide SQL' : '⚡ SQL Playground'}
          </button>
          <button
            style={styles.headerButton}
            onClick={() => pivotRef.current?.downloadTestFixture?.()}
            title="Download test fixture zip with config, cube results, and expected output"
          >
            📦 Test Fixture
          </button>
        </div>
      </header>

      {/* Data Source Controls */}
      <div style={styles.dataSourceSection}>
        <DataSource
          onDataChange={handleDataChange}
          onResetToSample={handleResetToSample}
          onReloadData={handleReloadData}
          decimalSeparator={decimalSeparator}
          onDecimalSeparatorChange={setDecimalSeparator}
          dataSource={dataSource}
        />
      </div>

      {/* Main Pivot Component */}
      <Pivot
        key={pivotKey}
        ref={pivotRef}
        config={{
          dataEngine: dataEngine,
          duckdb: dataEngine ? null : duckdb,
          data: data,
          initialConfig: pivotConfig,
          settings: {
            autoUpdate: autoUpdate,
            devMode: true
          },
          callbacks: {
            onAutoUpdateChange: setAutoUpdate
          }
        }}
      />

      {/* SQL Playground (Demo Feature) */}
      {sqlPlaygroundOpen && (
        <div style={styles.sqlPlayground}>
          <h3 style={styles.sqlPlaygroundTitle}>SQL Playground</h3>
          <p style={styles.sqlPlaygroundHint}>
            Query the <code>pivot_data</code> table directly with DuckDB SQL
          </p>

          <div style={styles.sqlInputSection}>
            <textarea
              style={styles.sqlTextarea}
              value={sqlQueryInput}
              onChange={(e) => setSqlQueryInput(e.target.value)}
              placeholder="Enter SQL query..."
              rows={4}
            />
            <button
              style={styles.executeButton}
              onClick={handleExecuteSQL}
              disabled={sqlExecuting}
            >
              {sqlExecuting ? 'Executing...' : '▶ Execute'}
            </button>
          </div>

          {sqlError && (
            <div style={styles.error}>
              <strong>SQL Error:</strong> {sqlError}
            </div>
          )}

          {sqlResults && (
            <div style={styles.sqlResultsSection}>
              <div style={styles.sqlResultsHeader}>
                Results: {sqlResults.length} rows
              </div>
              <div style={styles.sqlResultsTable}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {Object.keys(sqlResults[0] || {}).map(key => (
                        <th key={key} style={styles.tableHeader}>{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sqlResults.slice(0, 100).map((row, i) => (
                      <tr key={i} style={i % 2 === 0 ? styles.tableRowEven : styles.tableRowOdd}>
                        {Object.values(row).map((val, j) => (
                          <td key={j} style={styles.tableCell}>
                            {val === null ? '(null)' : String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sqlResults.length > 100 && (
                  <div style={styles.truncated}>
                    Showing first 100 of {sqlResults.length} rows
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Themed entirely via the library's design tokens (pivot-parrot's
// styles.css sets data-theme-aware var() values) - no light/dark branching
// needed here, it just follows document.documentElement's data-theme.
const styles = {
  root: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--surface-bg)',
    overflow: 'hidden'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 1.5rem',
    background: 'var(--surface-bg)',
    color: 'var(--text-primary)',
    borderBottom: '1px solid var(--border-color-medium)',
    boxShadow: 'none',
    flexShrink: 0
  },
  title: {
    margin: 0,
    fontSize: '1.5rem',
    fontWeight: 700
  },
  subtitle: {
    margin: '0.25rem 0 0 0',
    fontSize: '0.875rem',
    opacity: 1,
    color: 'var(--text-muted)'
  },
  headerActions: {
    display: 'flex',
    gap: '0.5rem'
  },
  headerButton: {
    padding: '0.5rem 1rem',
    background: 'transparent',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 0,
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 500,
    fontFamily: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace',
    transition: 'all 0.2s'
  },
  dataSourceSection: {
    flexShrink: 0
  },
  sqlPlayground: {
    padding: '1.5rem',
    background: 'var(--surface-bg)',
    borderTop: '1px solid var(--border-color-medium)',
    maxHeight: '400px',
    overflow: 'auto',
    flexShrink: 0
  },
  sqlPlaygroundTitle: {
    margin: '0 0 0.5rem 0',
    fontSize: '1.125rem',
    fontWeight: 600,
    color: 'var(--text-primary)'
  },
  sqlPlaygroundHint: {
    margin: '0 0 1rem 0',
    fontSize: '0.875rem',
    color: 'var(--text-muted)'
  },
  sqlInputSection: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1rem'
  },
  sqlTextarea: {
    flex: 1,
    padding: '0.75rem',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 0,
    fontSize: '0.875rem',
    fontFamily: 'monospace',
    resize: 'vertical',
    background: 'var(--surface-subtle)',
    color: 'var(--text-primary)'
  },
  executeButton: {
    padding: '0.75rem 1.5rem',
    background: 'var(--color-accent)',
    color: 'var(--text-inverse)',
    border: 'none',
    borderRadius: 0,
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 700,
    alignSelf: 'flex-start'
  },
  error: {
    padding: '0.75rem',
    background: 'var(--color-error-bg)',
    border: '1px solid var(--color-error-border)',
    borderRadius: 0,
    fontSize: '0.875rem',
    color: 'var(--color-error)',
    marginBottom: '1rem'
  },
  sqlResultsSection: {
    marginTop: '1rem'
  },
  sqlResultsHeader: {
    marginBottom: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--text-secondary)'
  },
  sqlResultsTable: {
    maxHeight: '300px',
    overflow: 'auto',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 0
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem'
  },
  tableHeader: {
    padding: '0.75rem',
    background: 'var(--surface-subtle)',
    borderBottom: '1px solid var(--border-color-medium)',
    textAlign: 'left',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    position: 'sticky',
    top: 0
  },
  tableRowEven: {
    background: 'var(--surface-bg)'
  },
  tableRowOdd: {
    background: 'var(--surface-subtle)'
  },
  tableCell: {
    padding: '0.75rem',
    borderBottom: '1px solid var(--border-color-light)'
  },
  truncated: {
    padding: '0.75rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--text-muted)',
    background: 'var(--surface-subtle)',
    borderTop: '1px solid var(--border-color-medium)'
  }
};

export default App;
