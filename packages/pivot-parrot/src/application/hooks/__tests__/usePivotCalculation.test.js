import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { usePivotCalculation } from '../usePivotCalculation';
import { createPivotStore, PivotStoreContext } from '../../state/store';
import { DuckDBDialect } from '../../../domain/query/dialects/DuckDBDialect';

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

describe('usePivotCalculation cube cache', () => {
  let engine;
  let store;
  let wrapper;

  beforeEach(() => {
    engine = {
      getDialect: () => new DuckDBDialect(),
      executeQuery: vi.fn(async (sql) => ({ data: [{ region: 'A', m_a: sql.length }], dtypes: {}, rowCount: 1 }))
    };
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
    await waitFor(() => expect(engine.executeQuery).toHaveBeenCalledTimes(1));

    rerender({ config: withMetricB('count(sales)') });
    await waitFor(() => expect(engine.executeQuery).toHaveBeenCalledTimes(2));
    expect(engine.executeQuery.mock.calls[1][0]).toContain('count(sales)');
  });

  it('re-queries when the data changes under the same config', async () => {
    const { result } = render(withMetricB('sum(sales)'));
    await waitFor(() => expect(engine.executeQuery).toHaveBeenCalledTimes(1));

    act(() => store.setState({ dataHash: 'data-2' }));
    await act(() => result.current.calculatePivot());
    expect(engine.executeQuery).toHaveBeenCalledTimes(2);
  });

  it('serves the same SQL over the same data from the cache', async () => {
    const { result } = render(withMetricB('sum(sales)'));
    await waitFor(() => expect(engine.executeQuery).toHaveBeenCalledTimes(1));

    await act(() => result.current.calculatePivot());
    expect(engine.executeQuery).toHaveBeenCalledTimes(1);
    expect(result.current.cubeResults).toHaveLength(1);
  });
});
