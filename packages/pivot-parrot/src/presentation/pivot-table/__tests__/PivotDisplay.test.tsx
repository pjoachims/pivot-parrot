import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import PivotDisplay from '../PivotDisplay';
import { createPivotStore, PivotStoreContext } from '../../../application/state/store';
import { buildPivotDisplayData } from '../../../domain/pivot';

describe('PivotDisplay header', () => {
  it('labels the row and column dimensions with field name overrides', () => {
    const sqlRows = [
      { category_1: 'A', category_2: 'x', region: 'North', sum_net_revenue: 10, _grouping_category_1: 0, _grouping_category_2: 0, _grouping_region: 0 },
      { category_1: 'A', category_2: 'y', region: 'South', sum_net_revenue: 20, _grouping_category_1: 0, _grouping_category_2: 0, _grouping_region: 0 }
    ];
    const config = {
      rows: ['category_1', 'category_2'],
      columns: ['region'],
      values: [{ field: 'net_revenue', aggregation: 'sum' }],
      filters: [],
      fieldNameOverrides: { category_1: 'Kategorie 1', category_2: 'Kategorie 2', region: 'Region' }
    };
    const data = buildPivotDisplayData(sqlRows, config.rows, config.columns, config.values);

    render(
      <PivotStoreContext.Provider value={{ store: createPivotStore('pivot-display-test'), instanceKey: 'pivot-display-test' }}>
        <PivotDisplay data={data} cubeResults={sqlRows} rowFields={config.rows} config={config} />
      </PivotStoreContext.Provider>
    );

    expect(screen.getByText('Kategorie 1 \\ Kategorie 2')).toBeInTheDocument();
    expect(screen.getByText('Region')).toBeInTheDocument();
  });
});
