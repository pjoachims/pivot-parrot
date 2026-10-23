import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import SheetView from '../SheetView';

const q1 = [
  ['Row Labels', 'Sum of sales'],
  ['Nord', 120],
  ['Süd', 80],
  ['Grand Total', 200]
];
const q2 = [
  ['Row Labels', 'Sum of sales'],
  ['Nord', 300],
  ['Süd', 100],
  ['Grand Total', 400]
];

function mount(grid: any[][], cells: Record<string, string>) {
  const onCellsChange = vi.fn();
  const ui = (g: any[][], c: Record<string, string>) => <SheetView grid={g} cells={c} onCellsChange={onCellsChange} />;
  const view = render(ui(grid, cells));
  const host = view.container.querySelector('.pp-sheet-grid') as any;
  const ws = () => (host.querySelector('.jss_container') as any).jssWorksheet;
  return { ...view, ws, onCellsChange, rerenderWith: (g: any[][], c: Record<string, string>) => view.rerender(ui(g, c)) };
}

it('formulas next to the pivot compute from its cells, and recompute when the pivot changes', () => {
  const cells = { D2: '=B2/B4', D4: '=SUM(B2:B3)', E2: '=IF(D2>0.5,"gut","")' };
  const sheet = mount(q1, cells);
  expect(sheet.ws().getValue('D2', true)).toBe('0.6');
  expect(sheet.ws().getValue('D4', true)).toBe('200');
  expect(sheet.ws().getValue('E2', true)).toBe('gut');

  sheet.rerenderWith(q2, cells);
  expect(sheet.ws().getValue('D2', true)).toBe('0.75');
  expect(sheet.ws().getValue('D4', true)).toBe('400');
  expect(sheet.ws().getValue('E2', true)).toBe('gut');
});

it('the pivot range is read-only and greyed; typing next to it reports the new cells', () => {
  const sheet = mount(q1, {});
  const ws = sheet.ws();
  expect(ws.isReadOnly(1, 1)).toBe(true);
  expect(ws.getCellFromCoords(1, 1).classList.contains('readonly')).toBe(true);
  expect(ws.isReadOnly(2, 1)).toBe(false);

  act(() => ws.setValueFromCoords(1, 1, 999));
  expect(ws.getValueFromCoords(1, 1)).toBe(120);
  expect(sheet.onCellsChange).not.toHaveBeenCalled();

  act(() => ws.setValueFromCoords(2, 1, '=B2*2'));
  expect(sheet.onCellsChange).toHaveBeenLastCalledWith({ C2: '=B2*2' });
  expect(ws.getValue('C2', true)).toBe('240');
});

it('numbers show formatted while formulas, chained ones too, compute with the raw values', () => {
  const sheet = mount([['Row Labels', 'Sum'], ['Nord', 1234.5678]], { C2: '=B2*2', D2: '=C2+1' });
  const shown = (x: number, y: number) => sheet.ws().getCellFromCoords(x, y);
  expect(shown(1, 1).textContent).toBe('1,234.57');
  expect(shown(2, 1).textContent).toBe('2,469.1356');
  expect(shown(3, 1).textContent).toBe('2,470.1356');
  expect(shown(3, 1).dataset.raw).toBe('2470.1356');
});

it('a formula typed in lower case computes, and the cell and the state hold it in upper case', () => {
  const sheet = mount(q1, {});
  const ws = sheet.ws();
  act(() => ws.setValueFromCoords(3, 1, '=b2/b4'));
  expect(ws.getValue('D2', true)).toBe('0.6');
  expect(ws.getValueFromCoords(3, 1)).toBe('=B2/B4');
  expect(sheet.onCellsChange).toHaveBeenCalledTimes(1);
  expect(sheet.onCellsChange).toHaveBeenLastCalledWith({ D2: '=B2/B4' });

  act(() => ws.setValueFromCoords(4, 1, '=if(b2>100,"gut","")'));
  expect(ws.getValueFromCoords(4, 1)).toBe('=IF(B2>100,"gut","")');
  expect(ws.getValue('E2', true)).toBe('gut');
  act(() => ws.setValueFromCoords(5, 1, '=concatenate("sag ""hi""",a2)'));
  expect(ws.getValueFromCoords(5, 1)).toBe('=CONCATENATE("sag ""hi""",A2)');
});
