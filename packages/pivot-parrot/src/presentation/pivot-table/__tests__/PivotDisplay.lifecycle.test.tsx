import React from 'react';
import { render } from '@testing-library/react';
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

const g = (region: number, year: number) => ({ _grouping_region: region, _grouping_year: year });
const sqlRows: any[] = [
  { region: 'North', year: 2023, sum_sales: 90, ...g(0, 0) },
  { region: null, year: 2023, sum_sales: 5, ...g(0, 0) },
  { region: 'North', year: null, sum_sales: 90, ...g(0, 1) },
  { region: null, year: null, sum_sales: 5, ...g(0, 1) },
  { region: null, year: 2023, sum_sales: 95, ...g(1, 0) },
  { region: null, year: null, sum_sales: 95, ...g(1, 1) }
];
const config = { rows: ['region'], columns: ['year'], values: [{ field: 'sales', aggregation: 'sum' }], filters: [] };
const data = buildPivotDisplayData(sqlRows, config.rows, config.columns, config.values);

function renderDisplay(props: { data: any; config?: any }) {
  const store = createPivotStore(`lifecycle-${Math.random()}`);
  const ui = (p: { data: any; config?: any }) => (
    <PivotStoreContext.Provider value={{ store, instanceKey: 'lifecycle' }}>
      <PivotDisplay data={p.data} cubeResults={sqlRows} rowFields={config.rows} config={p.config ?? config} />
    </PivotStoreContext.Provider>
  );
  const view = render(ui(props));
  return { ...view, rerender: (p: { data: any; config?: any }) => view.rerender(ui(p)) };
}

it('puts no debug globals on window, so pivots on one page cannot clobber each other', () => {
  renderDisplay({ data });
  renderDisplay({ data });
  expect('debugLeafColumns' in window).toBe(false);
  expect('togglePivotDebug' in window).toBe(false);
});
