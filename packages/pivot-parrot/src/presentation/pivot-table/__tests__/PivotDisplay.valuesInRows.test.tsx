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

const g = (region: number, city: number) => ({ _grouping_region: region, _grouping_city: city });
const sqlRows = [
  { region: 'Nord', city: 'Kiel', sum_sales: 1, sum_orders: 10, ...g(0, 0) },
  { region: 'Nord', city: 'Hamburg', sum_sales: 2, sum_orders: 20, ...g(0, 0) },
  { region: 'Nord', city: null, sum_sales: 3, sum_orders: 30, ...g(0, 1) },
  { region: null, city: 'Kiel', sum_sales: 1, sum_orders: 10, ...g(1, 0) },
  { region: null, city: 'Hamburg', sum_sales: 2, sum_orders: 20, ...g(1, 0) },
  { region: null, city: null, sum_sales: 3, sum_orders: 30, ...g(1, 1) }
];
const values = [{ field: 'sales', aggregation: 'sum' }, { field: 'orders', aggregation: 'sum' }];

function expandEverything() {
  let button;
  while ((button = screen.queryAllByRole('button', { name: /^Expand / })[0])) fireEvent.click(button);
}

function bodyRows(rows: string[]) {
  const config = { rows, columns: [], values, filters: [] };
  const data = buildPivotDisplayData(sqlRows, rows, [], values);
  render(
    <PivotStoreContext.Provider value={{ store: createPivotStore('values-in-rows-' + rows.join()), instanceKey: 'values-in-rows-' + rows.join() }}>
      <PivotDisplay data={data} cubeResults={sqlRows} rowFields={rows} config={config} />
    </PivotStoreContext.Provider>
  );
  expandEverything();
  return Array.from(document.querySelectorAll('tbody tr'))
    .map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent?.trim()))
    .filter(cells => cells.length > 1);
}

it('Σ Values between two row fields: metric rows show their total under each member', () => {
  const rows = bodyRows(['region', 'Σ Values', 'city']);
  expect(rows.slice(0, 7).map(cells => cells[1])).toEqual(['', '3', '1', '2', '30', '10', '20']);
});

it('Σ Values first of three row fields: member rows show their total under each metric', () => {
  const rows = bodyRows(['Σ Values', 'region', 'city']);
  expect(rows.slice(0, 8).map(cells => cells[1])).toEqual(['3', '3', '1', '2', '30', '30', '10', '20']);
});
