import React from 'react';
import { createRoot } from 'react-dom/client';
import { Pivot, RemoteDataEngine } from 'pivot-parrot';
import * as duckdb from '@duckdb/duckdb-wasm';
import { tableFromIPC } from 'apache-arrow';
import 'pivot-parrot/base-reset.css';
import 'pivot-parrot/sidebar/styles.css';

function installPlotlyLoader() {
  if (typeof window === 'undefined') {
    return;
  }

  let plotlyPromise = null;
  // Always (re)install: an older widget bundle on the same page may have left
  // a stale loader behind, and the page-global survives kernel restarts.
  window.__pivotParrotLoadPlotly = () => {
    if (window.Plotly) {
      return Promise.resolve({ default: window.Plotly });
    }
    if (plotlyPromise) {
      return plotlyPromise;
    }

    plotlyPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/plotly.js-dist-min@2.35.2/plotly.min.js';
      script.async = true;
      script.onload = () => {
        if (window.Plotly) {
          resolve({ default: window.Plotly });
        } else {
          reject(new Error('Plotly loaded but window.Plotly is unavailable'));
        }
      };
      script.onerror = () => reject(new Error('Failed to load Plotly from CDN'));
      document.head.appendChild(script);
    });

    // Don't cache failures: a transient network error would otherwise break
    // charts until the page is reloaded.
    plotlyPromise.catch(() => { plotlyPromise = null; });

    return plotlyPromise;
  };
}

installPlotlyLoader();

function toUint8Array(value) {
  if (!value) {
    return new Uint8Array();
  }

  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof DataView) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  return new Uint8Array(value);
}

function syncConfig(model, config) {
  model.set('config', JSON.parse(JSON.stringify(config)));
  model.save_changes();
}

function getLocalPivotConfig(model) {
  return {
    instanceKey: model.get('instance_key'),
    mode: 'local',
    dataEngine: null,
    duckdb: duckdb,
    data: toUint8Array(model.get('arrow_bytes')),
    initialConfig: model.get('initial_config'),
    settings: {
      autoUpdate: model.get('auto_update'),
      autoExecute: model.get('auto_execute'),
      enableSQLPlayground: model.get('enable_sql_playground'),
      locale: model.get('locale')
    },
    engineSettings: {
      dialect: model.get('dialect')
    },
    callbacks: {
      onConfigChange: (config) => syncConfig(model, config)
    }
  };
}

function getRemotePivotConfig(model, dataEngine) {
  const sampleData = toUint8Array(model.get('sample_data'));
  const pivotTimeout = model.get('pivot_timeout') * 1000;

  return {
    instanceKey: model.get('instance_key'),
    mode: 'remote',
    dataEngine,
    duckdb: duckdb,
    data: sampleData.byteLength ? sampleData : null,
    initialConfig: model.get('initial_config'),
    settings: {
      autoUpdate: model.get('auto_update'),
      autoExecute: model.get('auto_execute'),
      enableSQLPlayground: false,
      locale: model.get('locale')
    },
    engineSettings: {
      dialect: model.get('dialect'),
      pivotTimeout
    },
    callbacks: {
      onConfigChange: (config) => syncConfig(model, config)
    }
  };
}

function getPivotConfig(model, executeQuery) {
  if (model.get('mode') !== 'remote') {
    return getLocalPivotConfig(model);
  }

  const pivotTimeout = model.get('pivot_timeout') * 1000;
  const engine = new RemoteDataEngine({
    dialect: model.get('dialect'),
    defaultTable: 'pivot_data',
    timeout: pivotTimeout,
    schema: model.get('fields'),
    executeQuery
  });

  return getRemotePivotConfig(model, engine);
}

export default {
  async render({ model, el }) {
    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = `${model.get('height')}px`;
    // Keep right-click inside the widget: JupyterLab's notebook context menu
    // listens on the document and would otherwise cover the pivot's own
    // drilldown/context menus (which handle the event deeper in this subtree).
    el.addEventListener('contextmenu', (e) => e.stopPropagation());
    el.appendChild(container);

    const root = createRoot(container);
    const pendingRequests = new Map();
    let requestCounter = 0;

    const handleCustomMessage = (content, buffers = []) => {
      if (!content || content.type !== 'query_result') {
        return;
      }

      const pending = pendingRequests.get(content.requestId);
      if (!pending) {
        return;
      }
      pendingRequests.delete(content.requestId);

      if (content.status === 'error') {
        const error = new Error(content.error?.message || 'Query failed');
        error.type = content.error?.type;
        pending.reject(error);
        return;
      }

      try {
        const table = tableFromIPC(toUint8Array(buffers[0]));
        pending.resolve({
          rows: table.toArray(),
          schema: table.schema
        });
      } catch (error) {
        pending.reject(error);
      }
    };

    const executeQuery = (request) => {
      const requestId = `${model.get('instance_key')}_${++requestCounter}`;
      return new Promise((resolve, reject) => {
        pendingRequests.set(requestId, { resolve, reject });
        model.send({
          type: 'execute_query',
          requestId,
          sql: request.sql,
          timeout: request.timeout
        });
      });
    };

    model.on('msg:custom', handleCustomMessage);

    const renderPivot = () => {
      container.style.height = `${model.get('height')}px`;
      root.render(
        <React.StrictMode>
          <Pivot config={getPivotConfig(model, executeQuery)} />
        </React.StrictMode>
      );
    };

    renderPivot();

    model.on('change:height', renderPivot);
    model.on('change:arrow_bytes', renderPivot);
    model.on('change:initial_config', renderPivot);
    model.on('change:auto_update', renderPivot);
    model.on('change:enable_sql_playground', renderPivot);
    model.on('change:auto_execute', renderPivot);
    model.on('change:dialect', renderPivot);
    model.on('change:mode', renderPivot);
    model.on('change:fields', renderPivot);
    model.on('change:sample_data', renderPivot);
    model.on('change:pivot_timeout', renderPivot);

    return () => {
      const disposedError = new Error('Widget disposed before query completed');
      for (const pending of pendingRequests.values()) {
        pending.reject(disposedError);
      }
      pendingRequests.clear();

      model.off('change:height', renderPivot);
      model.off('change:arrow_bytes', renderPivot);
      model.off('change:initial_config', renderPivot);
      model.off('change:auto_update', renderPivot);
      model.off('change:enable_sql_playground', renderPivot);
      model.off('change:auto_execute', renderPivot);
      model.off('change:dialect', renderPivot);
      model.off('change:mode', renderPivot);
      model.off('change:fields', renderPivot);
      model.off('change:sample_data', renderPivot);
      model.off('change:pivot_timeout', renderPivot);
      model.off('msg:custom', handleCustomMessage);
      root.unmount();
      container.remove();
    };
  }
};
