import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { createPivotStore, PivotStoreContext } from '../../../../../application/state/store';
import { fromSchema } from '../../../../../domain/field/FieldItem';
import DropZonesGrid from '../DropZonesGrid';

describe('DropZonesGrid', () => {
  it('labels chips with field name overrides', () => {
    const store = createPivotStore('drop-zones-test');
    act(() => {
      store.getState().setAvailableFields(
        ['category_1', 'region', 'channel', 'net_revenue'].map(name => fromSchema({ name, type: 'string' }))
      );
      store.getState().setConfig({
        rows: ['category_1'],
        columns: ['region'],
        filters: [{ field: 'channel' }],
        values: [{ field: 'net_revenue', aggregation: 'sum' }],
        customMetrics: [],
        customFilters: [],
        customGroupings: [],
        fieldNameOverrides: {
          category_1: 'Kategorie 1',
          region: 'Region',
          channel: 'Kanal',
          net_revenue: 'Nettoumsatz'
        }
      });
    });

    render(
      <PivotStoreContext.Provider value={{ store, instanceKey: 'drop-zones-test' }}>
        <DropZonesGrid />
      </PivotStoreContext.Provider>
    );

    expect(screen.getByText('Kategorie 1')).toBeInTheDocument();
    expect(screen.getByText('Region')).toBeInTheDocument();
    expect(screen.getByText('Kanal')).toBeInTheDocument();
    expect(screen.getByText('sum of Nettoumsatz')).toBeInTheDocument();
    expect(screen.queryByText('category_1')).not.toBeInTheDocument();
  });

  it('shows a relative date filter by its label, never by resolved dates', () => {
    const store = createPivotStore('drop-zones-relative');
    act(() => {
      store.getState().setAvailableFields(['order_date', 'ship_date'].map(name => fromSchema({ name, type: 'date32' })));
      store.getState().setConfig({
        rows: [],
        columns: [],
        filters: [
          { field: 'order_date', type: 'relative_date', relative: { mode: 'last', n: 7, unit: 'day' } },
          { field: 'ship_date', type: 'relative_date', relative: { mode: 'previous', n: 1, unit: 'month' }, isNot: true },
        ],
        values: [],
      });
    });

    render(
      <PivotStoreContext.Provider value={{ store, instanceKey: 'drop-zones-relative' }}>
        <DropZonesGrid />
      </PivotStoreContext.Provider>
    );

    expect(screen.getByText('order_date: Last 7 days')).toBeInTheDocument();
    expect(screen.getByText('ship_date: not Previous month')).toBeInTheDocument();
  });

  it('removes a filter from its chip', () => {
    const store = createPivotStore('drop-zones-remove-filter');
    act(() => {
      store.getState().setAvailableFields(['channel', 'region'].map(name => fromSchema({ name, type: 'string' })));
      store.getState().setConfig({
        rows: ['region'],
        columns: [],
        filters: [{ field: 'channel', type: 'one_of', selectedValues: ['web'] }],
        values: [],
      });
    });

    render(
      <PivotStoreContext.Provider value={{ store, instanceKey: 'drop-zones-remove-filter' }}>
        <DropZonesGrid />
      </PivotStoreContext.Provider>
    );

    fireEvent.click(screen.getByRole('button', { name: /^Remove channel/ }));
    expect(store.getState().config.filters).toEqual([]);
    expect(store.getState().config.rows).toEqual(['region']);
  });
});
