import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { it, expect, vi, beforeAll, afterAll } from 'vitest';
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

type Fact = Record<string, string | number>;

/** Every grouping set of `dims` over `facts`, shaped like the engine's CUBE rows. */
function cube(facts: Fact[], dims: string[]): any[] {
  const rows = new Map<string, any>();
  for (let mask = 0; mask < 1 << dims.length; mask++) {
    for (const fact of facts) {
      const row: any = {};
      dims.forEach((d, i) => {
        const grouped = (mask >> i) & 1;
        row[d] = grouped ? null : fact[d];
        row[`_grouping_${d}`] = grouped;
      });
      const key = JSON.stringify(row);
      const acc = rows.get(key) ?? { ...row, sum_sales: 0, count_orders: 0 };
      acc.sum_sales += fact.sales as number;
      acc.count_orders += 1;
      rows.set(key, acc);
    }
  }
  return [...rows.values()];
}

function Harness({ sqlRows, config }: { sqlRows: any[]; config: any }) {
  const sortConfig = usePivotStore(s => s.sortConfig);
  const collapsed = usePivotStore(s => s.collapsedColumns);
  const data = buildPivotDisplayData(sqlRows, config.rows, config.columns, config.values, sortConfig, {}, collapsed);
  return <PivotDisplay data={data} cubeResults={sqlRows} rowFields={config.rows} config={config} />;
}

function renderPivot(facts: Fact[], config: any) {
  const store = createPivotStore(`column-groups-${Math.random()}`);
  const dims = [...config.rows, ...config.columns].filter((f: string) => f !== 'Σ Values');
  render(
    <PivotStoreContext.Provider value={{ store, instanceKey: 'column-groups' }}>
      <Harness sqlRows={cube(facts, dims)} config={{ filters: [], ...config }} />
    </PivotStoreContext.Provider>
  );
  return store;
}

/** Each header row covers every data column once, counting cells spanning down from rows above. */
function expectHeaderGrid() {
  const headerRows = [...document.querySelectorAll('thead tr')];
  const columnCount = document.querySelector('tbody tr')!.querySelectorAll('td').length;
  const carried: number[] = new Array(headerRows.length).fill(0);
  headerRows.forEach((tr, r) => {
    let covered = carried[r];
    tr.querySelectorAll('th').forEach(th => {
      const span = Number(th.getAttribute('colspan') ?? 1);
      const rows = Number(th.getAttribute('rowspan') ?? 1);
      covered += span;
      for (let below = r + 1; below < r + rows; below++) carried[below] += span;
    });
    expect(covered, `header row ${r}`).toBe(columnCount);
  });
}

const headerCells = (text: string) =>
  [...document.querySelectorAll('thead th')].filter(th => th.textContent === text);

const twoGroups: Fact[] = [
  { region: 'East', group: 'A', item: 'x', sales: 1 },
  { region: 'East', group: 'A', item: 'y', sales: 2 },
  { region: 'East', group: 'B', item: 'y', sales: 4 },
  { region: 'East', group: 'B', item: 'z', sales: 8 }
];

it('header cells merge within one group only, never across groups that share a label', () => {
  renderPivot(twoGroups, { rows: ['region'], columns: ['group', 'item', 'Σ Values'], values: [{ field: 'sales', aggregation: 'sum' }], subtotals: 'row' });
  const ys = headerCells('y');
  expect(ys).toHaveLength(2);
  ys.forEach(th => expect(th).not.toHaveAttribute('colspan', '2'));
  expect(headerCells('A')[0]).toHaveAttribute('colspan', '2');
  expectHeaderGrid();
});

const sales: Fact[] = [
  { year: 2023, category: 'Furniture', region: 'East', sales: 700 },
  { year: 2024, category: 'Furniture', region: 'East', sales: 400 },
  { year: 2024, category: 'Furniture', region: 'West', sales: 1200 },
  { year: 2023, category: 'Office', region: 'East', sales: 30 },
  { year: 2024, category: 'Office', region: 'West', sales: 70 }
];
const twoValues = [{ field: 'sales', aggregation: 'sum' }, { field: 'orders', aggregation: 'count' }];

it('the chevron on a group header collapses the group to one column per value, and expands it again', () => {
  const store = renderPivot(sales, { rows: ['year'], columns: ['category', 'region'], values: twoValues });
  const furnitureHeader = () => headerCells('Furniture')[0] ?? screen.getByRole('button', { name: /Furniture/ }).closest('th')!;
  expect(furnitureHeader()).toHaveAttribute('colspan', '6');
  headerCells('Grand Total').forEach(th => expect(th).toHaveAttribute('colspan', '2'));

  fireEvent.click(screen.getByRole('button', { name: 'Collapse Furniture' }));

  expect(store.getState().collapsedColumns).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Expand Furniture' })).toHaveAttribute('aria-expanded', 'false');
  expect(furnitureHeader()).toHaveAttribute('colspan', '2');
  expect(furnitureHeader()).toHaveAttribute('rowspan', '2');
  expect(screen.getAllByRole('button', { name: /^Sort by .*, Furniture$/ })).toHaveLength(2);
  const grandTotalRow = screen.getByText('Grand Total', { selector: 'td span, td' }).closest('tr')!;
  expect(within(grandTotalRow).getAllByRole('cell')[1]).toHaveTextContent('2300');
  expectHeaderGrid();

  fireEvent.click(screen.getByRole('button', { name: 'Expand Furniture' }));
  expect(furnitureHeader()).toHaveAttribute('colspan', '6');
  expectHeaderGrid();
});

it('the chevron menu folds and unfolds a whole level', () => {
  const store = renderPivot(sales, { rows: ['year'], columns: ['category', 'region'], values: twoValues });
  const reachedDocument = vi.fn();
  document.addEventListener('contextmenu', reachedDocument);
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Collapse Office' }));
  document.removeEventListener('contextmenu', reachedDocument);
  // The open menu closes on a contextmenu reaching the document
  expect(reachedDocument).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Fold category' }));
  expect(screen.getByRole('button', { name: 'Expand Furniture' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Expand Office' })).toBeInTheDocument();
  expectHeaderGrid();

  fireEvent.contextMenu(screen.getByRole('button', { name: 'Expand Office' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Unfold all' }));
  expect(store.getState().collapsedColumns).toEqual([]);
});

it.each([
  ['values after the columns', ['category', 'region']],
  ['values first', ['Σ Values', 'category', 'region']],
  ['values between the columns', ['category', 'Σ Values', 'region']]
])('collapsed headers stay aligned with %s', (_, columns) => {
  renderPivot(sales, { rows: ['year'], columns, values: twoValues });
  expectHeaderGrid();
  fireEvent.click(screen.getAllByRole('button', { name: 'Collapse Furniture' })[0]);
  expectHeaderGrid();
});

it('a collapsed group shows while column subtotals are hidden', () => {
  renderPivot(sales, { rows: ['year'], columns: ['category', 'region'], values: twoValues, subtotals: 'row' });
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Furniture' }));
  expect(screen.getAllByRole('button', { name: /^Sort by .*, Furniture$/ })).toHaveLength(2);
  expectHeaderGrid();
});

it('collapsed headers stay aligned with Σ Values in rows', () => {
  renderPivot(sales, { rows: ['year', 'Σ Values'], columns: ['category', 'region'], values: twoValues });
  expectHeaderGrid();
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Furniture' }));
  expect(screen.getByRole('button', { name: 'Sort by Furniture' })).toBeInTheDocument();
  expectHeaderGrid();
});

it('lays headers out from the data while a new config waits for its results', () => {
  const config = { rows: ['year'], columns: ['category', 'region'], values: twoValues, filters: [] };
  const sqlRows = cube(sales, ['year', 'category', 'region']);
  const data = buildPivotDisplayData(sqlRows, config.rows, config.columns, config.values);
  const pending = { ...config, columns: ['product', 'category', 'region', 'Σ Values'] };
  render(
    <PivotStoreContext.Provider value={{ store: createPivotStore(`stale-${Math.random()}`), instanceKey: 'stale' }}>
      <PivotDisplay data={data} cubeResults={sqlRows} rowFields={pending.rows} config={pending} />
    </PivotStoreContext.Provider>
  );
  expectHeaderGrid();
});
