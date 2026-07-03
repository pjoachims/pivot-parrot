import { useState } from 'react';
import { DataEngine } from '../../infrastructure/data-engines/DataEngine';

// Type definition for query result
interface QueryResult {
  data?: any[];
  table?: any;
  sql?: string;
  executionTime?: number;
  rowCount?: number;
  columnCount?: number;
  dtypes?: Record<string, string>;
}

/**
 * Custom hook to manage SQL playground functionality
 */
export function useSQLPlayground(dataEngine: DataEngine) {
  const [sqlQuery, setSQLQuery] = useState<string>('SELECT * FROM pivot_data LIMIT 100');

  async function executeSQL(sql: string): Promise<QueryResult> {
    const engine = dataEngine;
    await engine.init();

    // Request the Arrow format - DuckDBWASMEngine keeps the query result
    // columnar (no per-row materialization); engines that can't produce an
    // Arrow Table (remote) silently fall back to rows, and adaptQueryResult
    // (called by SQLPlayground) handles either shape identically.
    const result = await engine.executeQuery(sql, false, 'query', { format: 'arrow' });
    return result;
  }

  return {
    sqlQuery,
    setSQLQuery,
    executeSQL
  };
}
