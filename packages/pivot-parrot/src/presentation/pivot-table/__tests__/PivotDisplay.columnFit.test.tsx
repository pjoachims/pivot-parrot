import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { it, expect, beforeAll, afterAll } from 'vitest';
import PivotDisplay from '../PivotDisplay';
import { createPivotStore, PivotStoreContext, usePivotStore } from '../../../application/state/store';
import { usePivotDisplay } from '../../../application/hooks/usePivotDisplay';
import { columnPathKey } from '../../../application/utils/cubeIndex';
import { cube, type Fact } from '../../../domain/pivot/__tests__/cubeFixture';

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

function Harness({ queryResult, config }: { queryResult: any; config: any }) {
  const collapsed = usePivotStore(s => s.collapsedColumns);
  const expanded = usePivotStore(s => s.expandedColumns);
  const display = usePivotDisplay(queryResult, config, config.values, null, collapsed, expanded);
  if (!display) return null;
  if ('error' in display) return <div>{display.error}</div>;
  return <PivotDisplay data={display} cubeResults={queryResult.cubeResults} rowFields={config.rows} config={config} />;
}

// 3 categories × 40 regions: 120 member columns, 3 subtotals and the grand total make 124.
const facts: Fact[] = ['A', 'B', 'C'].flatMap(category =>
  Array.from({ length: 40 }, (_, r) => ({ year: 2024, category, region: `r${r}`, sales: 1 })));
const config = { rows: ['year'], columns: ['category', 'region'], values: [{ field: 'sales', aggregation: 'sum' }], filters: [] };

function renderWide() {
  const store = createPivotStore(`column-fit-${Math.random()}`);
  const queryResult = { cubeResults: cube(facts, ['year', 'category', 'region']), dtypes: {}, fieldsHash: 'category,region,year' };
  render(
    <PivotStoreContext.Provider value={{ store, instanceKey: 'column-fit' }}>
      <Harness queryResult={queryResult} config={config} />
    </PivotStoreContext.Provider>
  );
  return store;
}

it('shows a table over the column limit with groups folded to fit, and chevrons to open them', () => {
  const store = renderWide();
  expect(screen.queryByText(/Too many columns/)).not.toBeInTheDocument();
  for (const category of ['A', 'B', 'C']) {
    expect(screen.getByRole('button', { name: `Expand ${category}` })).toHaveAttribute('aria-expanded', 'false');
  }
  expect(screen.getByRole('status')).toHaveTextContent('3 column groups collapsed to fit the 100-column limit.');
  expect(store.getState().collapsedColumns).toEqual([]);
  expect(store.getState().expandedColumns).toEqual([]);
});

it('opens folded groups while the table fits, and refuses the one that would not fit', () => {
  const store = renderWide();
  fireEvent.click(screen.getByRole('button', { name: 'Expand A' }));
  fireEvent.click(screen.getByRole('button', { name: 'Expand B' }));
  expect(screen.getByRole('button', { name: 'Collapse A' })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: 'Collapse B' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('1 column group collapsed to fit');

  fireEvent.click(screen.getByRole('button', { name: 'Expand C' }));
  expect(screen.getByRole('button', { name: 'Expand C' })).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('status')).toHaveTextContent('C cannot open: the table would have more than 100 columns. Collapse another column group first.');
  expect(store.getState().expandedColumns).toEqual([columnPathKey(['A']), columnPathKey(['B'])]);

  // A collapsed makes room: nothing needs folding to fit, so C shows open again
  fireEvent.click(screen.getByRole('button', { name: 'Collapse A' }));
  expect(screen.getByRole('button', { name: 'Collapse C' })).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(store.getState().collapsedColumns).toEqual([columnPathKey(['A'])]);
});
