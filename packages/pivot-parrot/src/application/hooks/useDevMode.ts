/* eslint-disable no-console -- dev mode's job is printing to the console */
/**
 * Dev Mode Hook
 * Exposes debugging utilities to window.__pivotParrot when dev mode is enabled
 *
 * Usage in console:
 *   __pivotParrot.printPerformance()  // Show profiler report
 *   __pivotParrot.printQueries()      // Show query history
 *   __pivotParrot.exportState()       // Download debug state as JSON
 *   __pivotParrot.getChartData()      // Get transformed chart data (easy!)
 *   __pivotParrot.profiler            // Access profiler directly
 */

import { useEffect, useRef } from 'react';
import { profiler } from '../../domain/query/utils/profiler';
import { buildChartData } from '../../presentation/charts/chartUtils';

export interface QueryRecord {
  timestamp: number;
  sql: string;
  duration: number;
  rowCount: number;
  type: 'pivot' | 'drilldown' | 'unique_values' | 'load_data';
  error?: string;
}

export interface DataStats {
  rowCount: number;
  columnCount: number;
  dtypes: Record<string, string>;
  memoryEstimate: string;
}

export interface DevModeAPI {
  // Core instances
  profiler: typeof profiler;
  dataEngine?: any;

  // Data
  queryHistory: QueryRecord[];
  dataStats: DataStats | null;
  config: any;
  displayData?: any;    // Built pivot display structure
  chartConfig?: any;    // Current chart configuration
  cubeResults?: any;    // Raw SQL query results

  // Helper functions
  printPerformance: () => void;
  printQueries: () => void;
  getLastSQL: () => string | undefined; // Get the last executed SQL query
  exportState: () => void;
  clearQueryHistory: () => void;
  buildChartData: typeof buildChartData; // Transform function (call manually)
  getChartData: () => any; // Convenience function - pre-filled with current state

  // Profiler controls
  enableVerbose: () => void;
  disableVerbose: () => void;
  resetProfiler: () => void;

  // Advanced
  version: string;
  _internal: {
    queryHistory: QueryRecord[];
  };
}

declare global {
  interface Window {
    __pivotParrot?: DevModeAPI;
  }
}

interface UseDevModeProps {
  enabled: boolean;
  dataEngine?: any;
  config: any;
  cubeResults?: any;
  dtypes?: Record<string, string>;
  sqlHistory?: any[];  // Query history from usePivotCalculation
  displayData?: any;   // Built pivot display data
  chartConfig?: any;   // Current chart configuration
}

export function useDevMode({ enabled, dataEngine, config, cubeResults, dtypes, sqlHistory = [], displayData, chartConfig }: UseDevModeProps) {
  const hasLoggedWelcome = useRef(false);

  useEffect(() => {
    if (!enabled) {
      // Clean up
      delete window.__pivotParrot;
      hasLoggedWelcome.current = false; // Reset so message shows again if re-enabled
      return;
    }

    // Calculate data stats
    const dataStats: DataStats | null = cubeResults ? {
      rowCount: cubeResults.rowCount || 0,
      columnCount: cubeResults.columnCount || 0,
      dtypes: dtypes || {},
      memoryEstimate: estimateMemorySize(cubeResults)
    } : null;

    // Helper to download JSON
    // Handles BigInt values that cannot be JSON stringified
    const downloadJSON = (data: any, filename: string) => {
      const json = JSON.stringify(data, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      , 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };

    // Expose API
    window.__pivotParrot = {
      // Core
      profiler,
      dataEngine,

      // Data
      queryHistory: sqlHistory,
      dataStats,
      config,
      displayData,      // Built pivot display (rows, columns, grand totals, etc.)
      chartConfig,      // Current chart configuration
      cubeResults,      // Raw SQL query results

      // Helpers
      buildChartData,   // Function to transform chart data (call manually)
      getChartData: () => {
        // Convenience function - pre-filled with current state
        if (!chartConfig || !cubeResults || !config) {
          console.warn('⚠️  Missing chart data. Ensure chartConfig, cubeResults, and config are available.');
          return null;
        }
        return buildChartData(
          cubeResults,
          chartConfig,
          config,
          dtypes || {},
          dataEngine?.getDialect?.() ?? dataEngine?.dialect
        );
      },
      printPerformance: () => {
        console.log('\n📊 Performance Report\n');
        profiler.printTable();
      },

      printQueries: () => {
        console.log('\n📝 Query History\n');
        if (sqlHistory.length === 0) {
          console.log('No queries recorded yet');
          return;
        }
        console.table(sqlHistory.map(q => ({
          time: q.timestamp,
          type: q.queryType || 'query',
          rows: q.rowCount || 0,
          sql: q.sql.substring(0, 100) + (q.sql.length > 100 ? '...' : '')
        })));
      },

      getLastSQL: () => {
        if (sqlHistory.length === 0) return undefined;
        return sqlHistory[sqlHistory.length - 1].sql;
      },

      exportState: () => {
        const state = {
          timestamp: new Date().toISOString(),
          config,
          profilerReport: profiler.getReport(),
          queryHistory: sqlHistory,
          dataStats,
          displayData,
          chartConfig,
          cubeResults: cubeResults ? {
            rowCount: cubeResults.rowCount,
            columnCount: cubeResults.columnCount,
            sample: cubeResults.data?.slice(0, 5) // First 5 rows as sample
          } : null,
          version: '0.1.1'
        };
        downloadJSON(state, `pivot-parrot-debug-${Date.now()}.json`);
        console.log('✅ Debug state exported');
      },

      clearQueryHistory: () => {
        console.log('⚠️  Query history is managed by the calculation hook and cannot be cleared from dev mode');
      },

      // Profiler controls
      enableVerbose: () => {
        profiler.setVerbose(true);
        console.log('✅ Verbose profiling enabled');
      },

      disableVerbose: () => {
        profiler.setVerbose(false);
        console.log('✅ Verbose profiling disabled');
      },

      resetProfiler: () => {
        profiler.reset();
        console.log('✅ Profiler reset');
      },

      // Metadata
      version: '0.1.1',
      _internal: {
        queryHistory: sqlHistory
      }
    };

    // Log welcome message (only once)
    if (!hasLoggedWelcome.current) {
      console.log('%c🛠️ Pivot Parrot Dev Mode', 'font-size: 14px; font-weight: bold; color: #3b82f6');
      console.log('Access debugging utilities via: %cwindow.__pivotParrot', 'font-family: monospace; background: #f3f4f6; padding: 2px 4px; border-radius: 3px');
      console.log('\nQuick commands:');
      console.log('  %c__pivotParrot.printPerformance()%c  - Show performance report', 'font-family: monospace; color: #059669', '');
      console.log('  %c__pivotParrot.printQueries()%c      - Show query history', 'font-family: monospace; color: #059669', '');
      console.log('  %c__pivotParrot.exportState()%c       - Download debug state', 'font-family: monospace; color: #059669', '');
      console.log('  %c__pivotParrot.getChartData()%c      - Get transformed chart data', 'font-family: monospace; color: #059669', '');
      hasLoggedWelcome.current = true;
    }

    // Cleanup
    return () => {
      delete window.__pivotParrot;
    };
  }, [enabled, dataEngine, config, cubeResults, dtypes, sqlHistory, displayData, chartConfig]);
}

/**
 * Estimate memory size of an object (rough approximation)
 * Handles BigInt values that cannot be JSON stringified
 */
function estimateMemorySize(obj: any): string {
  try {
    // Use JSON.stringify with replacer to handle BigInt
    const json = JSON.stringify(obj, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
    const bytes = new TextEncoder().encode(json).length;

    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  } catch {
    // Fallback if serialization fails
    return 'Unknown';
  }
}
