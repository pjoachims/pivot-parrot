import { useState, useRef } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import duckdbEhWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdbEhWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import { Pivot } from 'pivot-parrot';
// CSS is now bundled into the JS automatically - no need to import separately
import { SAMPLE_DATA } from './sampleData';

// Browsers with wasm exception handling (all current ones) load eh from the page.
// Only older browsers fall back to mvp, so it stays on jsDelivr instead of adding 38 MB to the deploy.
const DUCKDB_BUNDLES = {
  mvp: duckdb.getJsDelivrBundles().mvp,
  eh: { mainModule: duckdbEhWasm, mainWorker: duckdbEhWorker }
};

const SAMPLE_CONFIG = {
  filters: [],
  rows: ['date', 'region'],
  columns: ['category'],
  values: [{ field: 'sales', aggregation: 'sum' }, { field: 'qty', aggregation: 'sum' }],
  customMetrics: [{
    id: 'avg_sale_price',
    name: 'Avg Sale Price',
    expr: 'SUM(sales) / NULLIF(SUM(qty), 0)',
    path: ['Pricing']
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
};

const EMPTY_CONFIG = {
  filters: [],
  rows: [],
  columns: [],
  values: [],
  customMetrics: [],
  customGroupings: [],
  customFilters: []
};

function App() {
  // Data state
  const [data, setData] = useState(SAMPLE_DATA);
  const [dataSource, setDataSource] = useState('Sample Data');
  const [rowCount, setRowCount] = useState(SAMPLE_DATA.length);
  const [originalFile, setOriginalFile] = useState(null); // Store original file for re-reading

  // Pivot key to force remount when data changes
  const [pivotKey, setPivotKey] = useState(0);

  // Auto-update state
  const [autoUpdate, setAutoUpdate] = useState(true);

  // Ref to access Pivot methods
  const pivotRef = useRef(null);

  // Pivot configuration state
  const [pivotConfig, setPivotConfig] = useState(SAMPLE_CONFIG);

  // SQL Playground state (demo feature)
  const [sqlPlaygroundOpen, setSqlPlaygroundOpen] = useState(false);
  const [sqlQueryInput, setSqlQueryInput] = useState('SELECT * FROM pivot_data LIMIT 10');
  const [sqlResults, setSqlResults] = useState(null);
  const [sqlExecuting, setSqlExecuting] = useState(false);
  const [sqlError, setSqlError] = useState(null);

  const isCustomCSV = dataSource !== 'Sample Data';

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;

    try {
      // Use ArrayBuffer for better memory efficiency
      const arrayBuffer = await file.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        throw new Error('No data found in CSV');
      }

      setOriginalFile(file);
      setData(arrayBuffer);
      setDataSource(file.name);
      setRowCount(0);
      setSqlResults(null);
      setSqlError(null);
      setPivotConfig(EMPTY_CONFIG);
      setPivotKey(prev => prev + 1); // Force Pivot remount
    } catch (error) {
      console.error('CSV upload error:', error);
      alert(`Error loading CSV: ${error.message}`);
    }
  }

  function handleResetToSample() {
    setData(SAMPLE_DATA);
    setDataSource('Sample Data');
    setRowCount(SAMPLE_DATA.length);
    setOriginalFile(null);
    setSqlResults(null);
    setSqlError(null);
    setPivotConfig(SAMPLE_CONFIG);
    setPivotKey(prev => prev + 1); // Force Pivot remount
  }

  async function handleReloadData() {
    setSqlResults(null);
    setSqlError(null);

    // Re-read file from scratch if available
    if (originalFile) {
      const arrayBuffer = await originalFile.arrayBuffer();
      setData(arrayBuffer);
    } else if (Array.isArray(data)) {
      setData([...data]);
    }
    setPivotKey(prev => prev + 1); // Force Pivot remount
  }

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
    <div className="shell">
      <header className="shell-header">
        <h1 className="brand">
          <span aria-hidden="true">🦜</span>
          PIVOT_PARROT<span className="brand-cursor" aria-hidden="true">▮</span>
        </h1>
        <div className="shell-status">
          // <strong>{dataSource.toLowerCase()}</strong>
          {rowCount > 0 && <> · {rowCount.toLocaleString()} rows</>} · duckdb-wasm
        </div>

        <div className="shell-actions">
          <label className="btn btn-accent">
            ↑ upload csv
            <input type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
          {isCustomCSV && (
            <button className="btn" onClick={handleReloadData} title="Re-read the uploaded file from disk">
              ↻ reload
            </button>
          )}
          <button className="btn" onClick={handleResetToSample} title="Restore the sample dataset and config">
            sample data
          </button>
          <span className="rule" />
          <button
            className="btn"
            aria-pressed={sqlPlaygroundOpen}
            onClick={() => setSqlPlaygroundOpen(!sqlPlaygroundOpen)}
          >
            $ sql
          </button>
          <button
            className="btn"
            onClick={() => pivotRef.current?.downloadTestFixture?.()}
            title="Download test fixture zip with config, cube results, and expected output"
          >
            fixture ↓
          </button>
        </div>
      </header>

      {/* Main Pivot Component */}
      <Pivot
        key={pivotKey}
        ref={pivotRef}
        config={{
          duckdb: duckdb,
          duckdbBundles: DUCKDB_BUNDLES,
          data: data,
          initialConfig: pivotConfig,
          settings: {
            autoUpdate: autoUpdate,
            enableSheetMode: true,
            devMode: true
          },
          callbacks: {
            onAutoUpdateChange: setAutoUpdate
          }
        }}
      />

      {/* SQL Playground (Demo Feature) */}
      {sqlPlaygroundOpen && (
        <section className="sql-drawer">
          <div className="sql-head">
            <h2>$ sql</h2>
            <span className="hint">query the <strong>pivot_data</strong> table directly with duckdb</span>
            <kbd>⌘⏎ run</kbd>
          </div>

          <div className="sql-body">
            <div className="sql-input-row">
              <textarea
                className="sql-input"
                value={sqlQueryInput}
                onChange={(e) => setSqlQueryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleExecuteSQL();
                  }
                }}
                placeholder="SELECT * FROM pivot_data LIMIT 10"
                rows={3}
                spellCheck={false}
              />
              <button className="btn btn-accent" onClick={handleExecuteSQL} disabled={sqlExecuting}>
                {sqlExecuting ? 'running…' : '▶ run'}
              </button>
            </div>

            {sqlError && (
              <div className="sql-error" role="alert">
                <strong>error:</strong> {sqlError}
              </div>
            )}

            {sqlResults && (
              <div className="sql-results">
                <table>
                  <thead>
                    <tr>
                      {Object.keys(sqlResults[0] || {}).map(key => (
                        <th key={key}>{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sqlResults.slice(0, 100).map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((val, j) => (
                          <td key={j}>{val === null ? '(null)' : String(val)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="meta">
                  {sqlResults.length > 100
                    ? `showing first 100 of ${sqlResults.length} rows`
                    : `${sqlResults.length} rows`}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default App;
