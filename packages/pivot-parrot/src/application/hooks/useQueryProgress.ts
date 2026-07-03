import { useState, useEffect } from 'react';
import type { DataEngine } from '../../infrastructure/data-engines/DataEngine';

/**
 * Hook to subscribe to query execution progress from a DataEngine
 */
export function useQueryProgress(dataEngine: DataEngine | null) {
  const [queryInfo, setQueryInfo] = useState<{
    sql: string;
    startTime: number;
    elapsed: number;
    type: 'pivot' | 'uniqueValues' | 'drilldown' | 'query';
  } | null>(null);

  useEffect(() => {
    if (!dataEngine) {
      setQueryInfo(null);
      return;
    }

    // Subscribe to query start/stop events
    const unsubscribe = dataEngine.subscribeToQueries((info) => {
      setQueryInfo(info);
    });

    // Poll for elapsed time updates while query is running
    const interval = setInterval(() => {
      const current = dataEngine.getCurrentQuery();
      if (current) {
        setQueryInfo(current as any);
      }
    }, 100);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [dataEngine]);

  return queryInfo;
}
