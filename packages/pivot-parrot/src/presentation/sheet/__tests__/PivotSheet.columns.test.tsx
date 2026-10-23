import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import PivotSheet from '../PivotSheet';
import PivotDisplay from '../../pivot-table/PivotDisplay';
import { createPivotStore, PivotStoreContext, usePivotStore } from '../../../application/state/store';
import { usePivotDisplay } from '../../../application/hooks/usePivotDisplay';
import { columnPathKey } from '../../../application/utils/cubeIndex';
import { layoutCSV } from '../../../application/utils/export';
import { rowKey } from '../../../application/utils/treeOperations';
import { cube } from '../../../domain/pivot/__tests__/cubeFixture';

// jsdom has no layout; give the virtualised table a viewport so its rows render.
const sizes = { offsetHeight: 800, offsetWidth: 1600 };
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

const facts = [
  { region: 'Nord', city: 'Kiel', category: 'Home', product: 'Lamp', sales: 5 },
  { region: 'Nord', city: 'Kiel', category: 'Tech', product: 'Phone', sales: 10 },
  { region: 'Nord', city: 'Hamburg', category: 'Tech', product: 'Phone', sales: 30 },
  { region: 'Nord', city: 'Hamburg', category: 'Tech', product: 'Laptop', sales: 200 },
  { region: 'Süd', city: 'München', category: 'Home', product: 'Sofa', sales: 900 },
  { region: 'Süd', city: 'München', category: 'Tech', product: 'Phone', sales: 20 },
  { region: 'Süd', city: 'Ulm', category: 'Tech', product: 'Laptop', sales: 100 },
  { region: 'Süd', city: 'Ulm', category: 'Tech', product: 'Laptop', sales: 300 },
  { region: 'Süd', city: 'Ulm', category: 'Tech', product: 'Laptop', sales: 300 }
];
const values = [{ field: 'sales', aggregation: 'sum' }, { field: 'sales', aggregation: 'avg' }];
const rows = ['region', 'city'];
const columns = ['category', 'product'];
const cubeResults = cube(facts, [...rows, ...columns]);
const queryResult = { cubeResults, dtypes: {}, fieldsHash: [...rows, ...columns].sort().join(',') };
const TECH = columnPathKey(['Tech']);
const HEADER_ROWS = 3;

type Settings = { subtotals?: string; grandTotals?: string };

/** What Pivot does: the display data built from the store's column folds, shown as the table or the sheet. */
function Harness({ config, mode, onData }: { config: any; mode: 'sheet' | 'table'; onData: (data: any) => void }) {
  const collapsed = usePivotStore(s => s.collapsedColumns);
  const expanded = usePivotStore(s => s.expandedColumns);
  const data = usePivotDisplay(queryResult, config, values, null, collapsed, expanded);
  if (!data || 'error' in data) return null;
  onData(data);
  return mode === 'sheet'
    ? <PivotSheet data={data} cubeResults={cubeResults} dtypes={{}} dialect={null} config={config} onOpenSQL={null} />
    : <PivotDisplay data={data} cubeResults={cubeResults} rowFields={rows} config={config} />;
}

function setup(settings: Settings = {}) {
  const config = { rows, columns, values, filters: [], ...settings };
  const store = createPivotStore(`pivot-sheet-columns-${Math.random()}`);
  let data: any;
  const ui = (mode: 'sheet' | 'table') => (
    <PivotStoreContext.Provider value={{ store, instanceKey: 'pivot-sheet-columns', sheetMode: true }}>
      <Harness config={config} mode={mode} onData={d => { data = d; }} />
    </PivotStoreContext.Provider>
  );
  const view = render(ui('table'));
  const ws = () => (view.container.querySelector('.pp-sheet-grid .jss_container') as any)?.jssWorksheet;
  const rowOf = (label: string) => rowKey(data.rowGroups.find((g: any) => g.label === label));
  return { config, store, view, ws, data: () => data, rowOf, show: (mode: 'sheet' | 'table') => view.rerender(ui(mode)) };
}

// Both views format numbers their own way; compare them as numbers to two decimals.
const norm = (text: string) => {
  const t = text.replace(/[⊞⊟]/g, '').trim().replace(/,/g, '');
  return t !== '' && Number.isFinite(Number(t)) ? Number(t).toFixed(2) : t;
};

/** The table's body as text rows: the row label, then each column's value. */
const tableBody = (container: HTMLElement) =>
  [...container.querySelectorAll('tbody tr')]
    .map(tr => [...tr.querySelectorAll('td')].map(td => norm(td.textContent ?? '')))
    .filter(r => r.length > 1);

/** The sheet's pivot body, as wide as the table's; the column after it must be outside the pivot. */
const sheetBody = (ws: any, width: number) => {
  const out: string[][] = [];
  for (let y = HEADER_ROWS; ws.getCellFromCoords(0, y)?.dataset.role; y++) {
    expect(ws.getCellFromCoords(width, y).dataset.role, `column ${width} is past the pivot`).toBeUndefined();
    out.push(Array.from({ length: width }, (_, x) => norm(ws.getCellFromCoords(x, y).textContent ?? '')));
  }
  return out;
};

async function openSheet(t: ReturnType<typeof setup>) {
  t.show('sheet');
  await waitFor(() => expect(t.ws()).toBeTruthy());
}

async function sheetOf(t: ReturnType<typeof setup>, width: number) {
  await openSheet(t);
  return sheetBody(t.ws(), width);
}

const press = (el: Element) => act(() => { fireEvent.mouseDown(el); });

describe('a column group collapses in the table and in the sheet, with one state', () => {
  it('collapsed in the table, the sheet shows Tech collapsed, and the sheet reopens it for the table', async () => {
    const t = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Tech' }));
    expect(t.store.getState().collapsedColumns).toEqual([TECH]);
    expect(screen.queryByText('Laptop')).not.toBeInTheDocument();
    const table = tableBody(t.view.container);

    expect(await sheetOf(t, table[0].length)).toEqual(table);
    const expand = await screen.findByRole('button', { name: 'Expand Tech' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(t.ws().getCellFromCoords(Number(expand.closest('td')!.dataset.x), 0).dataset.role).toBe('header');

    press(expand);
    expect(t.store.getState().collapsedColumns).toEqual([]);
    expect(await screen.findByRole('button', { name: 'Collapse Tech' })).toBeInTheDocument();

    t.show('table');
    expect(screen.getAllByText('Laptop').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Collapse Tech' })).toBeInTheDocument();
  });

  it('the innermost column level has no toggle', async () => {
    const t = setup();
    await openSheet(t);
    expect(await screen.findByRole('button', { name: 'Collapse Home' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Laptop/ })).not.toBeInTheDocument();
  });

  it('a collapse while the cell editor is open does not toggle: the click picks the header cell', async () => {
    const t = setup();
    await openSheet(t);
    const collapse = await screen.findByRole('button', { name: 'Collapse Tech' });
    const td = t.ws().getCellFromCoords(16, 4);
    act(() => t.ws().openEditor(td, true));
    await act(() => new Promise(r => setTimeout(r)));
    const input = td.children[0] as HTMLInputElement;
    act(() => {
      input.value = '=';
      input.setSelectionRange(1, 1);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const address = collapse.closest('td')!;
    press(collapse);
    expect(input.value).toBe(`=${String.fromCharCode(65 + Number(address.dataset.x))}${Number(address.dataset.y) + 1}`);
    expect(t.store.getState().collapsedColumns).toEqual([]);
  });

  it('a formula with a fixed address points at another column once a column group left of it closes (a known limit)', async () => {
    const t = setup();
    await openSheet(t);
    // H4: Tech's Laptop sum in Nord's row (after Home's products and Home's subtotal).
    act(() => t.ws().setValueFromCoords(1, 12, '=H4'));
    expect(t.ws().getValue('B13', true)).toBe('200');
    press(await screen.findByRole('button', { name: 'Collapse Home' }));
    // Home is now one column per metric and has no subtotal, so H4 is Tech's subtotal sum for Nord.
    await waitFor(() => expect(t.ws().getValue('B13', true)).toBe('240'));
  });
});

const SETTINGS = ['both', 'row', 'col', 'none'];
const COMBOS = SETTINGS.flatMap(subtotals => SETTINGS.map(grandTotals => ({ subtotals, grandTotals })));

describe('the sheet shows the table\'s totals', () => {
  it.each(COMBOS)('subtotals $subtotals, grand totals $grandTotals: table = sheet, all closed, with Tech collapsed and Nord open', async (settings) => {
    const t = setup(settings);
    const closed = tableBody(t.view.container);
    expect(await sheetOf(t, closed[0].length)).toEqual(closed);

    act(() => {
      t.store.getState().setColumnFolds({ collapsed: [TECH], expanded: [] });
      t.store.getState().toggleExpanded(t.rowOf('Nord'));
    });
    t.show('table');
    const table = tableBody(t.view.container);
    expect(await sheetOf(t, table[0].length)).toEqual(table);
    // Home's two products and its subtotal (when shown), Tech as one column per metric, the grand total (when shown).
    const colSubtotals = settings.subtotals === 'col' || settings.subtotals === 'both';
    const grandTotalCol = settings.grandTotals === 'col' || settings.grandTotals === 'both';
    expect(table[0].length).toBe(1 + 4 + (colSubtotals ? 2 : 0) + 2 + (grandTotalCol ? 2 : 0));
    expect(table.some(r => r[0] === 'Grand Total')).toBe(settings.grandTotals === 'row' || settings.grandTotals === 'both');
    expect(table.find(r => r[0] === 'Kiel')).toBeDefined();
  });

  it.each(COMBOS)('subtotals $subtotals, grand totals $grandTotals: the Visual Layout CSV is the sheet with every row group open, Tech collapsed in both', async (settings) => {
    const t = setup(settings);
    act(() => {
      t.store.getState().setColumnFolds({ collapsed: [TECH], expanded: [] });
      t.store.getState().toggleExpanded(t.rowOf('Nord'));
      t.store.getState().toggleExpanded(t.rowOf('Süd'));
    });
    const csv = layoutCSV(t.data(), t.config).split('\n').map(line => line.split(',').map(norm));
    expect(csv[0]).toContain('Tech');
    expect(csv[0]).not.toContain('Laptop');
    expect(await sheetOf(t, csv[0].length)).toEqual(csv.slice(HEADER_ROWS));
  });
});
