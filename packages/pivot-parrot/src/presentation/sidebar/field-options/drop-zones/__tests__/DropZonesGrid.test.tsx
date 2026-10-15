import React from 'react';
import { render, screen, act } from '@testing-library/react';
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
});
