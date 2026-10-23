import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { it, expect, beforeAll, afterAll } from 'vitest';
import PivotSheet from '../PivotSheet';
import PivotDisplay from '../../pivot-table/PivotDisplay';
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
const data = buildPivotDisplayData(sqlRows, config.rows, config.columns, config.values);

function setup() {
  const store = createPivotStore(`pivot-sheet-toggle-${Math.random()}`);
  const ui = (mode: 'sheet' | 'table') => (
    <PivotStoreContext.Provider value={{ store, instanceKey: 'pivot-sheet-toggle', sheetMode: true }}>
      {mode === 'sheet'
        ? <PivotSheet data={data} cubeResults={sqlRows} dtypes={{}} dialect={null} config={config} onOpenSQL={null} />
        : <PivotDisplay data={data} cubeResults={sqlRows} rowFields={config.rows} config={config} />}
    </PivotStoreContext.Provider>
  );
  const view = render(ui('sheet'));
  const ws = () => (view.container.querySelector('.pp-sheet-grid .jss_container') as any).jssWorksheet;
  const labels = () => {
    const out: string[] = [];
    for (let y = 0; y < 6; y++) out.push(String(ws().getValueFromCoords(0, y)).trim());
    return out;
  };
  return { store, view, ws, labels, show: (mode: 'sheet' | 'table') => view.rerender(ui(mode)) };
}

const press = (el: Element) => act(() => { fireEvent.mouseDown(el); });

it('a toggle in the sheet opens the group, and the table shows the same open rows', async () => {
  const sheet = setup();
  const expand = await screen.findByRole('button', { name: 'Expand Nord' });
  expect(sheet.labels()).toEqual(['Row Labels', 'Nord', 'Süd', 'Grand Total', '', '']);
  expect(sheet.ws().isReadOnly(0, 1)).toBe(true);

  press(expand);
  expect(sheet.labels()).toEqual(['Row Labels', 'Nord', 'Kiel', 'Süd', 'Grand Total', '']);
  expect(screen.getByRole('button', { name: 'Collapse Nord' })).toHaveAttribute('aria-expanded', 'true');
  expect(sheet.ws().getCellFromCoords(0, 2).dataset.role).toBe('rowLabel');
  expect(sheet.ws().getCellFromCoords(1, 1).dataset.role).toBe('subtotal');
  expect(sheet.ws().getCellFromCoords(1, 4).dataset.role).toBe('grandTotal');
  expect(sheet.ws().getCellFromCoords(2, 2).dataset.role).toBeUndefined();

  sheet.show('table');
  expect(screen.getByText('Kiel')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Collapse Nord' }));
  expect(screen.queryByText('Kiel')).not.toBeInTheDocument();

  sheet.show('sheet');
  await screen.findByRole('button', { name: 'Expand Nord' });
  expect(sheet.labels()).toEqual(['Row Labels', 'Nord', 'Süd', 'Grand Total', '', '']);
});

it('a toggle while the cell editor is open does not toggle: the click picks its cell, as in Excel', async () => {
  const sheet = setup();
  const expand = await screen.findByRole('button', { name: 'Expand Nord' });
  const td = sheet.ws().getCellFromCoords(3, 1);
  act(() => sheet.ws().openEditor(td, true));
  await act(() => new Promise(r => setTimeout(r)));
  const input = td.children[0] as HTMLInputElement;
  act(() => {
    input.value = '=';
    input.setSelectionRange(1, 1);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  press(expand);
  expect(input.value).toBe('=A2');
  expect(sheet.store.getState().expanded).toEqual({});
});

it('a formula with a fixed address points at another row once a group above it closes (a known limit)', async () => {
  const sheet = setup();
  press(await screen.findByRole('button', { name: 'Expand Nord' }));
  act(() => sheet.ws().setValueFromCoords(3, 2, '=B3'));
  expect(sheet.ws().getValue('D3', true)).toBe('10');

  press(screen.getByRole('button', { name: 'Collapse Nord' }));
  expect(sheet.labels()[2]).toBe('Süd');
  expect(sheet.ws().getValue('D3', true)).toBe('20');
});
