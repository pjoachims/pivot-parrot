import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { createPivotStore, PivotStoreContext } from '../../../../../application/state/store';
import { fromSchema } from '../../../../../domain/field/FieldItem';
import { FieldKind } from '../../../../../domain/models/types';
import DropZonesGrid from '../DropZonesGrid';

function renderGrid(filters: any[] = []) {
  const store = createPivotStore(`auto-open-${Math.random()}`);
  act(() => {
    store.getState().setAvailableFields([
      ...['region', 'city'].map(name => fromSchema({ name, type: 'string' })),
      fromSchema({ name: 'sales', type: 'double' }),
      { ...fromSchema({ name: 'big_orders', type: 'string' }), kind: FieldKind.CUSTOM_FILTER } as any,
    ]);
    store.getState().setConfig({
      rows: ['region'],
      columns: [],
      filters,
      values: [{ field: 'sales', aggregation: 'Sum' }],
      customMetrics: [],
      customFilters: [],
      customGroupings: [],
    });
  });
  render(
    <PivotStoreContext.Provider value={{ store, instanceKey: 'auto-open' }}>
      <DropZonesGrid />
    </PivotStoreContext.Provider>
  );
  return store;
}

const pill = (field: string) => document.querySelector(`[data-filter-field="${field}"]`);

describe('a field landing in Filters opens its dialog', () => {
  it('opens the filter dialog, anchored on the new pill, for a dimension moved from Rows', async () => {
    const store = renderGrid();
    act(() => store.getState().handleDrop('region', 'rows', 'filters', 0));

    await waitFor(() => expect(store.getState().filterDialog).not.toBeNull());
    expect(store.getState().filterDialog!.field.id).toBe('region');
    expect(store.getState().filterDialog!.anchorEl).toBe(pill('region'));
    expect(store.getState().havingFilterDialog).toBeNull();
  });

  it('opens the HAVING dialog for a measure moved from Values', async () => {
    const store = renderGrid();
    act(() => store.getState().handleDrop('SUM_sales', 'values', 'filters', 0, 0));

    await waitFor(() => expect(store.getState().havingFilterDialog).not.toBeNull());
    expect(store.getState().havingFilterDialog!.field.name).toBe('SUM_sales');
    expect(store.getState().havingFilterDialog!.anchorEl).toBe(pill('SUM_sales'));
    expect(store.getState().filterDialog).toBeNull();
  });

  it('opens nothing for a custom filter or a reorder within Filters', async () => {
    const store = renderGrid([{ field: 'city', type: 'equal' }, { field: 'region', type: 'equal' }]);
    act(() => store.getState().handleDrop('big_orders', 'available', 'filters', 0));
    act(() => store.getState().handleDrop('city', 'filters', 'filters', 2));

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(pill('big_orders')).not.toBeNull();
    expect(store.getState().filterDialog).toBeNull();
    expect(store.getState().havingFilterDialog).toBeNull();
  });
});
