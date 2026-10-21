import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { it, expect, beforeAll, afterAll } from 'vitest';
import PivotDisplay from '../PivotDisplay';
import { createPivotStore, PivotStoreContext, usePivotStore } from '../../../application/state/store';
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
// By total North leads; in 2024 South leads.
const sqlRows: any[] = [
  { region: 'North', year: 2023, sum_sales: 90, ...g(0, 0) },
  { region: 'North', year: 2024, sum_sales: 10, ...g(0, 0) },
  { region: 'South', year: 2023, sum_sales: 5, ...g(0, 0) },
  { region: 'South', year: 2024, sum_sales: 40, ...g(0, 0) },
  { region: 'North', year: null, sum_sales: 100, ...g(0, 1) },
  { region: 'South', year: null, sum_sales: 45, ...g(0, 1) },
  { region: null, year: 2023, sum_sales: 95, ...g(1, 0) },
  { region: null, year: 2024, sum_sales: 50, ...g(1, 0) },
  { region: null, year: null, sum_sales: 145, ...g(1, 1) }
];

function Harness({ config }: { config: any }) {
  const sortConfig = usePivotStore(s => s.sortConfig);
  const data = buildPivotDisplayData(sqlRows, config.rows, config.columns, config.values, sortConfig);
  return <PivotDisplay data={data} cubeResults={sqlRows} rowFields={config.rows} config={config} />;
}

function renderPivot(config: any) {
  const store = createPivotStore(`column-sort-${Math.random()}`);
  render(
    <PivotStoreContext.Provider value={{ store, instanceKey: 'column-sort' }}>
      <Harness config={config} />
    </PivotStoreContext.Provider>
  );
  return store;
}

const regionOrder = () => screen.getAllByText(/^(North|South)$/).map(el => el.textContent);
const headerOf = (button: HTMLElement) => button.closest('th')!;

it('a leaf column header cycles the rows through desc, asc and off for that column', () => {
  const store = renderPivot({ rows: ['region'], columns: ['year'], values: [{ field: 'sales', aggregation: 'sum' }], filters: [] });
  const unsorted = regionOrder();
  const col2024 = () => screen.getByRole('button', { name: /^Sort by .*, 2024$/ });

  fireEvent.click(col2024());
  expect(store.getState().sortConfig).toEqual({ valueKey: 'sum_sales', direction: 'desc', columnPath: [2024] });
  expect(headerOf(col2024())).toHaveAttribute('aria-sort', 'descending');
  expect(regionOrder()).toEqual(['South', 'North']);

  fireEvent.click(col2024());
  expect(headerOf(col2024())).toHaveAttribute('aria-sort', 'ascending');
  expect(regionOrder()).toEqual(['North', 'South']);

  fireEvent.click(col2024());
  expect(store.getState().sortConfig).toEqual({ valueKey: null, direction: 'desc' });
  expect(headerOf(col2024())).not.toHaveAttribute('aria-sort');
  expect(regionOrder()).toEqual(unsorted);
});

it('another column starts at desc, and the Grand Total column sorts without a column path', () => {
  const store = renderPivot({ rows: ['region'], columns: ['year'], values: [{ field: 'sales', aggregation: 'sum' }], filters: [] });
  fireEvent.click(screen.getByRole('button', { name: /^Sort by .*, 2024$/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Sort by .*, 2024$/ }));

  const total = screen.getByRole('button', { name: /^Sort by .*, Grand Total$/ });
  fireEvent.click(total);
  expect(store.getState().sortConfig).toEqual({ valueKey: 'sum_sales', direction: 'desc', columnPath: undefined });
  expect(headerOf(screen.getByRole('button', { name: /, 2024$/ }))).not.toHaveAttribute('aria-sort');
  expect(regionOrder()).toEqual(['North', 'South']);
});

it('with Σ Values in rows a column header sorts by the first value', () => {
  const store = renderPivot({ rows: ['region', 'Σ Values'], columns: ['year'], values: [{ field: 'sales', aggregation: 'sum' }], filters: [] });
  const col2024 = screen.getByRole('button', { name: 'Sort by 2024' });
  fireEvent.click(col2024);
  expect(store.getState().sortConfig).toEqual({ valueKey: 'sum_sales', direction: 'desc', columnPath: [2024] });
  expect(within(headerOf(col2024)).getByText('2024')).toBeInTheDocument();
  expect(headerOf(col2024)).toHaveAttribute('aria-sort', 'descending');
});
