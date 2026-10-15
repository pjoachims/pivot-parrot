import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { buildPivotSQL } from '../../domain/query/sql/buildPivotSQL';
import { buildCubeIndex } from '../utils/cubeIndex';
import { createLogger } from '../utils/logger';
import { usePivotStore } from '../state/store';
import { SIGMA_VALUES_ID } from '../../domain/models/types';

const logger = createLogger('PivotCalculation');

/**
 * Custom hook to manage pivot calculation logic
 * Handles SQL generation, caching, and display data building
 *
 * @param executionConfig - The committed config to execute (from execution boundary)
 * @param engine - The execution engine (queryEngine || dataEngine from parent)
 * @param isRemoteMode - Whether running in remote mode (no local dataHash needed)
 * @param onExecutionComplete - Optional callback when execution finishes (for commitConfig)
 */
export function usePivotCalculation({
  executionConfig,
  engine,
  isRemoteMode = false,
  onExecutionComplete
}) {
  // Read all needed state from store
  const dataHash = usePivotStore((s) => s.dataHash);
  const detectedTypes = usePivotStore((s) => s.detectedTypes);
  const availableFields = usePivotStore((s) => s.availableFields);
  const addToSqlHistory = usePivotStore((s) => s.addToSqlHistory);

  // Local state
  const [dtypes, setDtypes] = useState({});
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState(null);
  // Results keyed by the final SQL, scoped to one dataset: the SQL carries
  // every expression behind the config, the scope carries the data.
  const cubeCache = useMemo(() => new Map(), [engine, dataHash]);
  const abortControllerRef = useRef(null);
  const [calculationStartTime, setCalculationStartTime] = useState(null);
  const maxCacheSize = 5;

  // Query result: atomically consistent snapshot of config + data + dtypes + fieldsHash
  const [queryResult, setQueryResult] = useState(null);
  const revisionRef = useRef(0);

  // Enrich executionConfig values inline with custom metric details
  const enrichedValues = useMemo(() => {
    if (!executionConfig) return [];
    return executionConfig.values.map(v => {
      if (v.isCustom) {
        const metric = (executionConfig.customMetrics || []).find(m => m.id === v.field);
        if (metric) {
          return { ...v, name: metric.name, expr: metric.expr, format: metric.format };
        }
      }
      return v;
    });
  }, [executionConfig?.values, executionConfig?.customMetrics]);

  /**
   * Compute fields hash for cache key (order-independent)
   */
  const computeFieldsHash = useCallback((config) => {
    return [
      ...config.rows.map(f => typeof f === 'string' ? f : f.id).filter(f => f !== SIGMA_VALUES_ID),
      ...config.columns.map(f => typeof f === 'string' ? f : f.id).filter(f => f !== SIGMA_VALUES_ID)
    ].sort().join(',');
  }, []);

  /**
   * Build cube index for fast lookups
   */
  const buildIndex = useCallback((data, config) => {
    const rowFieldNames = config.rows.map(f => typeof f === 'string' ? f : f.id);
    const colFieldNames = config.columns.map(f => typeof f === 'string' ? f : f.id);
    const allFieldNames = [...rowFieldNames, ...colFieldNames].filter(f => f !== SIGMA_VALUES_ID);
    return buildCubeIndex(data, allFieldNames);
  }, []);

  /**
   * Set query result with cube index attached
   */
  const setResultWithIndex = useCallback((config, data, resultDtypes) => {
    const fieldsHash = computeFieldsHash(config);
    const cubeIndex = buildIndex(data, config);

    try {
      data._cubeIndex = cubeIndex;
    } catch (e) {
      // Array may be frozen from cache
    }

    revisionRef.current += 1;
    setQueryResult({
      config,
      cubeResults: data,
      dtypes: resultDtypes,
      revision: revisionRef.current,
      fieldsHash
    });
    setDtypes(resultDtypes);
  }, [computeFieldsHash, buildIndex]);

  const calculatePivot = useCallback(async (previewMode = false, previewConfig = null) => {
    const configToUse = previewMode && previewConfig ? previewConfig : executionConfig;

    logger.debug('Calculate pivot called', {
      previewMode,
      hasDataHash: !!dataHash,
      hasConfig: !!configToUse,
      hasEngine: !!engine,
      isRemoteMode,
      valuesCount: configToUse?.values?.length
    });

    // Early exit checks
    if (!configToUse) {
      logger.debug('Skipping: no config available');
      return;
    }
    if (!engine) {
      logger.debug('Skipping: no engine');
      return;
    }
    if (!isRemoteMode && !dataHash) {
      logger.debug('Skipping: no dataHash');
      return;
    }
    if (!configToUse.values.length) {
      logger.debug('Skipping: no values configured');
      if (!previewMode) {
        setQueryResult(null);
        setError(null);
      }
      return;
    }

    // Cancel any existing calculation (only for non-preview mode)
    if (!previewMode && abortControllerRef.current) {
      abortControllerRef.current.abort();
      // Also ask the engine to cancel its in-flight query so it releases the
      // query mutex promptly instead of blocking the fresh query behind it.
      // Not all engines support real cancellation (e.g. DuckDB WASM's
      // synchronous connection can't be interrupted mid-query) - guard for
      // engines that don't implement it.
      engine?.cancelCurrentQuery?.();
    }

    const controller = previewMode ? null : new AbortController();
    if (!previewMode) {
      abortControllerRef.current = controller;
    }

    if (!previewMode) {
      setCalculating(true);
      setCalculationStartTime(Date.now());
      setError(null);
    }

    try {
      if (controller?.signal.aborted) {
        throw new Error('Calculation cancelled');
      }

      const dialect = engine.getDialect();

      const { sql } = buildPivotSQL({
        config: configToUse,
        dialect,
        availableFields,
        detectedTypes: detectedTypes as Record<string, string>,
        tableName: 'pivot_data',
        disableSubtotals: false
      });

      const finalSQL = sql;

      // Preview mode - just return SQL
      if (previewMode) {
        return finalSQL;
      }

      // Validate SQL
      if (!finalSQL || finalSQL.trim() === '') {
        logger.warn('Empty SQL generated, skipping execution');
        setCalculating(false);
        return;
      }

      const cached = cubeCache.get(finalSQL);
      if (cached) {
        logger.debug('Cache hit', { rowCount: cached.cubeResults.length });
        setResultWithIndex(executionConfig, cached.cubeResults, cached.dtypes || {});
        setCalculating(false);
        onExecutionComplete?.(executionConfig, cached.cubeResults);
        return;
      }

      // Execute query
      if (controller?.signal.aborted) {
        throw new Error('Calculation cancelled');
      }

      const result = await engine.executeQuery(finalSQL, true, 'pivot');

      if (controller?.signal.aborted) {
        throw new Error('Calculation cancelled');
      }

      // Add to SQL history
      addToSqlHistory(
        finalSQL,
        'pivot',
        result.data?.slice(0, 3),
        result.dtypes,
        result.rowCount
      );

      setCalculating(false);
      setCalculationStartTime(null);

      logger.debug('Query complete', { rowCount: result.data.length });

      // Set result
      setResultWithIndex(executionConfig, result.data, result.dtypes || {});

      // Update cache
      if (cubeCache.size >= maxCacheSize) {
        const firstKey = cubeCache.keys().next().value;
        cubeCache.delete(firstKey);
      }
      cubeCache.set(finalSQL, { cubeResults: result.data, dtypes: result.dtypes });

      onExecutionComplete?.(executionConfig, result.data);

    } catch (err) {
      if (!controller?.signal.aborted) {
        setError(err.message);
      }
      setCalculating(false);
      setCalculationStartTime(null);
    } finally {
      if (controller && controller === abortControllerRef.current) {
        abortControllerRef.current = null;
      }
    }
  }, [dataHash, executionConfig, engine, isRemoteMode, detectedTypes, availableFields, cubeCache, setResultWithIndex, addToSqlHistory, onExecutionComplete]);

  // Auto-calculate when executionConfig changes
  useEffect(() => {
    if (!executionConfig) {
      logger.debug('Skipping auto-execute: no executionConfig committed');
      return;
    }
    logger.info('Auto-executing pivot query');
    calculatePivot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionConfig]); // Intentionally omit calculatePivot to prevent infinite loop

  // Restore from cached snapshot data (no SQL execution)
  const restoreFromCache = useCallback((restoredConfig, cachedCubeResults, cachedDtypes = {}) => {
    logger.debug('Restoring from snapshot', { rowCount: cachedCubeResults.length });
    setResultWithIndex(restoredConfig, cachedCubeResults, cachedDtypes);
    onExecutionComplete?.(restoredConfig, cachedCubeResults);
  }, [setResultWithIndex, onExecutionComplete]);

  const cubeResults = queryResult?.cubeResults || null;

  return {
    queryResult,
    enrichedValues,
    cubeResults,
    dtypes,
    calculating,
    calculationStartTime,
    error,
    calculatePivot,
    setError,
    restoreFromCache
  };
}
