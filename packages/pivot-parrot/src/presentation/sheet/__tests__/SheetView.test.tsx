import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import SheetView from '../SheetView';
import { gridOf } from '../../../domain/sheet/__tests__/gridOf';

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
  const ui = (g: any[][], c: Record<string, string>) => <SheetView grid={gridOf(g)} cells={c} onCellsChange={onCellsChange} />;
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

it('the pivot range is read-only; typing next to it reports the new cells', () => {
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

describe('point mode', () => {
  const type = (input: HTMLInputElement, text: string) => {
    act(() => {
      input.value += text;
      input.setSelectionRange(input.value.length, input.value.length);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const key = (input: HTMLInputElement, k: string, shiftKey = false) =>
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true })); });
  const click = (td: HTMLElement, shiftKey = false) =>
    act(() => { td.dispatchEvent(new MouseEvent('mousedown', { shiftKey, buttons: 1, bubbles: true, cancelable: true })); });
  const outlined = (sheet: ReturnType<typeof mount>) =>
    [...sheet.container.querySelectorAll('.pp-sheet-ref')].map(el => (el as HTMLElement).dataset.ref);
  const edit = async (sheet: ReturnType<typeof mount>, x: number, y: number) => {
    const td = sheet.ws().getCellFromCoords(x, y);
    click(td);
    act(() => sheet.ws().openEditor(td, true));
    await act(() => new Promise(r => setTimeout(r)));
    return { td, input: td.children[0] as HTMLInputElement };
  };

  it('a click and arrow keys put references into the formula, outlined while editing', async () => {
    const sheet = mount(q1, {});
    const { td, input } = await edit(sheet, 3, 1);
    type(input, '=');
    click(sheet.ws().getCellFromCoords(1, 1));
    expect(input.value).toBe('=B2');
    expect(sheet.ws().edition).not.toBeNull();
    type(input, '/');
    key(input, 'ArrowLeft');
    key(input, 'ArrowLeft');
    key(input, 'ArrowDown');
    key(input, 'ArrowDown');
    expect(input.value).toBe('=B2/B4');
    expect(outlined(sheet)).toEqual(['B2', 'B4']);

    act(() => sheet.ws().closeEditor(td, true));
    expect(sheet.ws().getValue('D2', true)).toBe('0.6');
    expect(sheet.onCellsChange).toHaveBeenLastCalledWith({ D2: '=B2/B4' });
  });

  it('shift extends the picked reference to a range', async () => {
    const sheet = mount(q1, {});
    const { td, input } = await edit(sheet, 3, 1);
    type(input, '=SUM(');
    click(sheet.ws().getCellFromCoords(1, 1));
    click(sheet.ws().getCellFromCoords(1, 2), true);
    expect(input.value).toBe('=SUM(B2:B3');
    key(input, 'ArrowDown', true);
    expect(input.value).toBe('=SUM(B2:B4');
    type(input, ')');
    act(() => sheet.ws().closeEditor(td, true));
    expect(sheet.ws().getValue('D2', true)).toBe('400');
  });

  it('where no reference may go, a click leaves the editor as jspreadsheet does', async () => {
    const sheet = mount(q1, {});
    const { input } = await edit(sheet, 3, 1);
    type(input, '=B2*2');
    click(sheet.ws().getCellFromCoords(1, 2));
    expect(sheet.ws().edition).toBeNull();
    expect(sheet.ws().getValue('D2', true)).toBe('240');
  });

  const options = (sheet: ReturnType<typeof mount>) =>
    [...sheet.container.querySelectorAll('[role="option"]')].map(el => [el.querySelector('.pp-sheet-function-name')!.textContent, el.getAttribute('aria-selected')]);

  it('a formula with German names and semicolons computes', async () => {
    const sheet = mount(q1, {});
    const { td, input } = await edit(sheet, 3, 1);
    type(input, '=SUMME(B2;B3)');
    act(() => sheet.ws().closeEditor(td, true));
    expect(sheet.ws().getValue('D2', true)).toBe('200');
    expect(sheet.onCellsChange).toHaveBeenLastCalledWith({ D2: '=SUMME(B2;B3)' });
  });

  it('a typed name prefix lists the functions; Tab inserts the name as typed', async () => {
    const sheet = mount(q1, {});
    const { td, input } = await edit(sheet, 3, 1);
    type(input, '=');
    expect(options(sheet)).toEqual([]);
    type(input, 'mit');
    expect(options(sheet)).toEqual([['MITTELWERT AVERAGE', 'true']]);
    key(input, 'Tab');
    expect(input.value).toBe('=MITTELWERT(');
    expect(input.selectionStart).toBe(12);
    expect(options(sheet)).toEqual([]);
    expect(sheet.ws().edition).not.toBeNull();

    type(input, 'B2;B3)');
    act(() => sheet.ws().closeEditor(td, true));
    expect(sheet.ws().getValue('D2', true)).toBe('100');
  });

  it('while the list is open, arrows move its highlight, Enter inserts, Escape closes it; the editor stays open', async () => {
    const sheet = mount(q1, {});
    const { input } = await edit(sheet, 3, 1);
    type(input, '=B2+ROUND');
    expect(options(sheet)).toEqual([['ROUND RUNDEN', 'true'], ['ROUNDUP AUFRUNDEN', 'false'], ['ROUNDDOWN ABRUNDEN', 'false']]);
    key(input, 'ArrowDown');
    key(input, 'ArrowDown');
    key(input, 'ArrowDown');
    key(input, 'ArrowUp');
    expect(options(sheet).map(([, selected]) => selected)).toEqual(['false', 'true', 'false']);
    expect(input.value).toBe('=B2+ROUND');
    key(input, 'Enter');
    expect(input.value).toBe('=B2+ROUNDUP(');
    expect(sheet.ws().edition).not.toBeNull();

    type(input, 'B2;0)+MA');
    expect(options(sheet)).toEqual([['MAX', 'true']]);
    key(input, 'Escape');
    expect(options(sheet)).toEqual([]);
    expect(sheet.ws().edition).not.toBeNull();
    expect(sheet.onCellsChange).not.toHaveBeenCalled();
  });

  it('a click on a listed function inserts it', async () => {
    const sheet = mount(q1, {});
    const { input } = await edit(sheet, 3, 1);
    type(input, '=WU');
    const option = sheet.container.querySelector('[role="option"]') as HTMLElement;
    act(() => { option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    act(() => { option.click(); });
    expect(input.value).toBe('=WURZEL(');
    expect(sheet.ws().edition).not.toBeNull();
  });

  it('the formula bar lists the functions too; Enter inserts instead of committing', () => {
    const sheet = mount(q1, {});
    act(() => sheet.ws().updateSelectionFromCoords(3, 1, 3, 1));
    const bar = sheet.getByLabelText('Formula') as HTMLInputElement;
    fireEvent.change(bar, { target: { value: '=su', selectionStart: 3 } });
    expect(options(sheet)).toEqual([['SUM SUMME', 'true']]);
    fireEvent.keyDown(bar, { key: 'Enter' });
    expect(bar.value).toBe('=SUM(');
    expect(sheet.onCellsChange).not.toHaveBeenCalled();

    fireEvent.change(bar, { target: { value: '=SUM(B2:B3)' } });
    fireEvent.keyDown(bar, { key: 'Enter' });
    expect(sheet.ws().getValue('D2', true)).toBe('200');
  });

  it('a selected formula cell shows its references outlined', () => {
    const sheet = mount(q1, { D2: '=B2/SUM(B2:B3)' });
    act(() => sheet.ws().updateSelectionFromCoords(3, 1, 3, 1));
    expect(outlined(sheet)).toEqual(['B2', 'B2:B3']);
    act(() => sheet.ws().updateSelectionFromCoords(0, 0, 0, 0));
    expect(outlined(sheet)).toEqual([]);
  });
});
