import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { usePivotCalculation } from '../usePivotCalculation';
import { createPivotStore, PivotStoreContext } from '../../state/store';
import { RemoteDataEngine } from '../../../infrastructure/data-engines/RemoteDataEngine';

const region = { id: 'region', name: 'region', dtype: 'string', kind: 'base_field' };

const withMetricB = (bExpr) => ({
  rows: [region],
  columns: [],
  values: [{ field: 'm_a', isCustom: true, expr: '{{m_b}} * 2' }],
  customMetrics: [
    { id: 'm_a', name: 'A', expr: '{{m_b}} * 2' },
    { id: 'm_b', name: 'B', expr: bExpr }
  ],
  filters: []
});

describe('usePivotCalculation and the engine cache', () => {
  let engine;
  let backend;
  let store;
  let wrapper;

  beforeEach(() => {
    backend = vi.fn(async ({ sql }) => ({ rows: [{ region: 'A', m_a: sql.length }], schema: null }));
    engine = new RemoteDataEngine({ dialect: 'duckdb', executeQuery: backend });
    store = createPivotStore();
    store.setState({ dataHash: 'data-1', availableFields: [region], detectedTypes: { region: 'string', sales: 'int32' } });
    wrapper = ({ children }) => React.createElement(
      PivotStoreContext.Provider,
      { value: { store, instanceKey: 'test' } },
      children
    );
  });

  const render = (executionConfig) => renderHook(
    ({ config }) => usePivotCalculation({ executionConfig: config, engine }),
    { wrapper, initialProps: { config: executionConfig } }
  );

  it('re-queries when a referenced metric changes behind an unchanged value', async () => {
    const { rerender } = render(withMetricB('sum(sales)'));
    await waitFor(() => expect(backend).toHaveBeenCalledTimes(1));

    rerender({ config: withMetricB('count(sales)') });
    await waitFor(() => expect(backend).toHaveBeenCalledTimes(2));
    expect(backend.mock.calls[1][0].sql).toContain('count(sales)');
  });

  it('serves the same SQL from the cache until the engine clears it', async () => {
    const { result } = render(withMetricB('sum(sales)'));
    await waitFor(() => expect(backend).toHaveBeenCalledTimes(1));

    await act(() => result.current.calculatePivot());
    expect(backend).toHaveBeenCalledTimes(1);
    expect(result.current.cubeResults).toHaveLength(1);

    engine.clearCache();
    await act(() => result.current.calculatePivot());
    expect(backend).toHaveBeenCalledTimes(2);
  });

  it('re-runs the committed config when the data version changes', async () => {
    const config = withMetricB('sum(sales)');
    const { rerender } = renderHook(
      ({ dataVersion }) => usePivotCalculation({ executionConfig: config, dataVersion, engine }),
      { wrapper, initialProps: { dataVersion: 1 } }
    );
    await waitFor(() => expect(backend).toHaveBeenCalledTimes(1));

    engine.clearCache();
    rerender({ dataVersion: 2 });
    await waitFor(() => expect(backend).toHaveBeenCalledTimes(2));
  });
});
