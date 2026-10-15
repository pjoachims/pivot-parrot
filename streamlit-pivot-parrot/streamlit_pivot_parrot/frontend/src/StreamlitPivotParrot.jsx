import { useEffect, useRef, useState, useMemo } from 'react';
import { Streamlit } from 'streamlit-component-lib';
import { Pivot, RemoteDataEngine } from 'pivot-parrot';
import * as duckdb from '@duckdb/duckdb-wasm';
import { executePivotQuery, resolveQueryResults, rejectQueryResults, cancelPivotQuery } from './queries';

const LOG_PREFIX = '[StreamlitPivot]';

/**
 * StreamlitPivotParrot - Clean Streamlit wrapper for Pivot
 *
 * Architecture:
 * - All hooks at top (no conditional calls)
 * - Refs for stable config (set once, never changes)
 * - State for reactive data (updates on Streamlit events)
 * - Memoized pivot config (recreated only when data changes)
 */
export function StreamlitPivotParrot() {
  // =========================================================================
  // STATE (reactive data that changes)
  // =========================================================================
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [initialConfig, setInitialConfig] = useState(null);

  // =========================================================================
  // REFS (stable data set once, never changes)
  // =========================================================================
  const configRef = useRef(null);
  const remoteEngineRef = useRef(null);
  const initializedRef = useRef({
    data: false,
    config: false
  });

  // =========================================================================
  // PIVOT CONFIG (memoized, recreated only when dependencies change)
  // =========================================================================
  const pivotConfig = useMemo(() => {
    if (!ready || !configRef.current) {
      return null;
    }

    return {
      instanceKey: configRef.current.instanceKey,
      mode: configRef.current.mode,
      dataEngine: remoteEngineRef.current,
      duckdb: duckdb,
      data: data,
      initialConfig: initialConfig,
      settings: {
        autoUpdate: configRef.current.autoUpdate,
        enableSQLPlayground: configRef.current.mode === 'local' && configRef.current.enableSQLPlayground,
        locale: configRef.current.locale
      },
      engineSettings: {
        pivotTimeout: configRef.current.pivotTimeout,
        uniqueValuesTimeout: configRef.current.uniqueValuesTimeout,
        drilldownTimeout: configRef.current.drilldownTimeout
      }
    };
  }, [ready, data, initialConfig]);

  // =========================================================================
  // HELPERS
  // =========================================================================
  const base64ToUint8Array = (base64) => {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  // =========================================================================
  // READY STATE WATCHER (sets ready when data is available)
  // =========================================================================
  useEffect(() => {
    if (!ready && configRef.current) {
      const canRender = configRef.current.mode === 'remote'
        ? (configRef.current.fields !== null)
        : (data !== null);

      if (canRender) {
        setReady(true);
      }
    }
  }, [data, ready]);

  // =========================================================================
  // FRAME HEIGHT UPDATER (tells Streamlit the iframe height)
  // =========================================================================
  useEffect(() => {
    if (ready && configRef.current) {
      Streamlit.setFrameHeight(configRef.current.height);
    }
  }, [ready]);

  // =========================================================================
  // STREAMLIT EVENT HANDLER (runs once on mount)
  // =========================================================================
  useEffect(() => {
    const onRender = async (event) => {
      const args = event.detail.args;

      // ===================================================================
      // STEP 1: Initialize config (once, on first render)
      // ===================================================================
      if (!configRef.current) {

        const sessionConfig = args.sessionConfig || {};
        const componentConfig = args.componentConfig || {};
        const userPreferences = args.userPreferences || {};
        const engineConfig = args.engineConfig || {};

        configRef.current = {
          mode: sessionConfig.mode || 'local',
          instanceKey: sessionConfig.instanceKey || 'pivot_default',
          fields: sessionConfig.fields || null,
          height: componentConfig.height ?? 800,
          locale: componentConfig.locale || 'en-US',
          pivotTimeout: componentConfig.pivotTimeout ?? 60000,
          uniqueValuesTimeout: componentConfig.uniqueValuesTimeout ?? 20000,
          drilldownTimeout: componentConfig.drilldownTimeout ?? 30000,
          timeoutEnabled: componentConfig.timeoutEnabled ?? false,
          autoUpdate: userPreferences.autoUpdate ?? true,
          autoExecute: userPreferences.autoExecute ?? false,
          dialect: engineConfig.dialect || 'duckdb',
          enableSQLPlayground: engineConfig.enableSQLPlayground ?? true,
        };

        // Create remote engine if needed
        if (configRef.current.mode === 'remote') {

          remoteEngineRef.current = new RemoteDataEngine({
            dialect: configRef.current.dialect,
            defaultTable: 'pivot_data',
            timeout: configRef.current.pivotTimeout,
            schema: configRef.current.fields,
            executeQuery: async (request) => {
              return executePivotQuery({
                instanceKey: configRef.current.instanceKey,
                sql: request.sql,
                timeout: request.timeout
              });
            },
            cancelQuery: configRef.current.timeoutEnabled
              ? () => cancelPivotQuery(configRef.current.instanceKey)
              : undefined
          });
        }
      }

      // ===================================================================
      // STEP 2: Load initial data (only once)
      // ===================================================================
      if (!initializedRef.current.data) {
        if (args.sampleData || args.arrowBytes) {
          try {
            console.log(`${LOG_PREFIX} 📊 Loading data (${args.sampleData ? 'sample' : 'full'})`);
            const bytes = base64ToUint8Array(args.sampleData || args.arrowBytes);
            setData(bytes);
            setError(null);
            initializedRef.current.data = true;
            console.log(`${LOG_PREFIX} ✅ Data loaded (${bytes.length} bytes)`);
          } catch (err) {
            console.error(`${LOG_PREFIX} ❌ Failed to load data:`, err);
            setError(`Failed to load data: ${err.message}`);
          }
        } else if (configRef.current?.mode === 'remote' && configRef.current?.fields) {
          console.log(`${LOG_PREFIX} 📋 Schema-only remote mode (no sample data)`);
          setData(null);
          setError(null);
          initializedRef.current.data = true;
          // In remote mode, we're ready as soon as we have fields (no data needed)
          if (!ready) {
            console.log(`${LOG_PREFIX} ✅ Remote mode ready (schema-only)`);
            setReady(true);
          }
        }
      }

      // ===================================================================
      // STEP 3: Set initial pivot config from Python (only once)
      // ===================================================================
      if (!initializedRef.current.config && args.initial_config?.config) {
        console.log(`${LOG_PREFIX} ⚙️  Initial config received from Python`);
        setInitialConfig(args.initial_config);
        initializedRef.current.config = true;
      }

      // ===================================================================
      // STEP 4: Handle query responses (remote mode)
      // ===================================================================
      if (args.queryResponse) {
        const { requestId, status, error: errorInfo } = args.queryResponse;
        console.log(`${LOG_PREFIX} 🔄 Query response: ${status} (requestId: ${requestId})`);

        if (status === 'error') {
          const error = new Error(errorInfo?.message || 'Query failed');
          error.type = errorInfo?.type;
          rejectQueryResults(requestId, error, configRef.current.instanceKey);
          console.error(`${LOG_PREFIX} ❌ Query failed:`, error.message);
        } else if (status === 'success' && args.cubeResults) {
          try {
            const bytes = base64ToUint8Array(args.cubeResults);
            const apache_arrow = await import('apache-arrow');
            const table = apache_arrow.tableFromIPC(bytes);
            resolveQueryResults(requestId, {
              rows: table.toArray(),
              schema: table.schema
            }, configRef.current.instanceKey);
            console.log(`${LOG_PREFIX} ✅ Query results delivered (${table.numRows} rows)`);
          } catch (err) {
            console.error(`${LOG_PREFIX} ❌ Failed to parse query results:`, err);
            rejectQueryResults(requestId, err, configRef.current.instanceKey);
          }
        }
      }

    };

    Streamlit.events.addEventListener(Streamlit.RENDER_EVENT, onRender);
    Streamlit.setComponentReady();
    console.log(`${LOG_PREFIX} 👂 Event listener registered`);

    return () => {
      console.log(`${LOG_PREFIX} 🧹 Cleanup - component unmounting`);
      Streamlit.events.removeEventListener(Streamlit.RENDER_EVENT, onRender);
      if (remoteEngineRef.current?.cancelCurrentQuery) {
          remoteEngineRef.current.cancelCurrentQuery();
      }
    };
  }, []);

  // =========================================================================
  // RENDER
  // =========================================================================

  // Error state
  if (error) {
    console.log(`${LOG_PREFIX} 💥 Rendering error state`);
    return (
      <div style={styles.error}>
        <strong>Error:</strong> {error}
      </div>
    );
  }

  // Loading state
  if (!ready || !pivotConfig) {
    console.log(`${LOG_PREFIX} ⏳ Rendering loading state`);
    return (
      <div style={styles.loading}>
        Loading pivot table...
      </div>
    );
  }

  // Main component
  console.log(`${LOG_PREFIX} 🎨 Rendering Pivot component`, {
    height: configRef.current.height,
    hasPivotConfig: !!pivotConfig,
    pivotConfigKeys: pivotConfig ? Object.keys(pivotConfig) : []
  });

  return (
    <div style={{ width: '100%', height: `${configRef.current.height}px` }}>
      <Pivot config={pivotConfig} />
    </div>
  );
}

// ===========================================================================
// STYLES
// ===========================================================================
const styles = {
  error: {
    padding: '2rem',
    textAlign: 'center',
    color: '#dc2626',
    background: '#fee2e2',
    borderRadius: '8px',
    margin: '1rem'
  },
  loading: {
    padding: '2rem',
    textAlign: 'center',
    color: '#666'
  }
};
