import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { it, expect, beforeAll, afterAll } from 'vitest';
import PivotDisplay from '../PivotDisplay';
import { createPivotStore, PivotStoreContext } from '../../../application/state/store';
import { buildPivotDisplayData } from '../../../domain/pivot';

// jsdom has no layout; give the virtualised table a viewport so its rows render.
const sizes = { offsetHeight: 800, offsetWidth: 1200 };
const saved: Record<string, PropertyDescriptor | undefined> = {};
beforeAll(() => {
  for (const [prop, value] of Object.entries(sizes)) {
    saved[prop] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop);
    Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value });
  }
});
afterAll(() => {
  for (const [prop, descriptor] of Object.entries(saved)) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, prop, descriptor);
    else delete (HTMLElement.prototype as any)[prop];
  }
});

const sqlRows = [
  { region: 'Nord', city: 'Kiel', sum_sales: 10, _grouping_region: 0, _grouping_city: 0 },
  { region: 'Nord', city: null, sum_sales: 10, _grouping_region: 0, _grouping_city: 1 },
  { region: 'Süd', city: 'München', sum_sales: 20, _grouping_region: 0, _grouping_city: 0 },
  { region: 'Süd', city: null, sum_sales: 20, _grouping_region: 0, _grouping_city: 1 },
  { region: null, city: null, sum_sales: 30, _grouping_region: 1, _grouping_city: 1 }
];
const config = { rows: ['region', 'city'], columns: [], values: [{ field: 'sales', aggregation: 'sum' }], filters: [] };
const store = createPivotStore('pivot-expansion-test');

function view(sortConfig: any) {
  const data = buildPivotDisplayData(sqlRows, config.rows, config.columns, config.values, sortConfig);
  return (
    <PivotStoreContext.Provider value={{ store, instanceKey: 'pivot-expansion-test' }}>
      <PivotDisplay data={data} cubeResults={sqlRows} rowFields={config.rows} config={config} />
    </PivotStoreContext.Provider>
  );
}

it('an expanded member stays expanded, and no other opens, when the rows reorder', () => {
  const { rerender } = render(view({ valueKey: 'sum_sales', direction: 'asc' }));
  fireEvent.click(screen.getByRole('button', { name: 'Expand Nord' }));
  expect(screen.getByText('Kiel')).toBeInTheDocument();

  rerender(view({ valueKey: 'sum_sales', direction: 'desc' }));

  expect(screen.getByText('Kiel')).toBeInTheDocument();
  expect(screen.queryByText('München')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Expand Süd' })).toBeInTheDocument();
});
