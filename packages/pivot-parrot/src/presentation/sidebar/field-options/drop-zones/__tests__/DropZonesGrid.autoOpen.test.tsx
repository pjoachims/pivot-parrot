import React from 'react';
import { render, act, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPivotStore, PivotStoreContext } from '../../../../../application/state/store';
import { fromSchema } from '../../../../../domain/field/FieldItem';
import { FieldKind } from '../../../../../domain/models/types';
import DropZonesGrid from '../DropZonesGrid';
import { DialogsManager } from '../../../dialogs/DialogsManager';
import { FilterPillsProvider } from '../../../filterPills';

// jsdom has no layout: each filter pill reports a box that sits lower the later it is in Filters,
// and a fixed element sits where its left/top put it.
const box = (left: number, top: number, width: number, height: number) =>
  ({ left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON() {} }) as DOMRect;
const realRect = HTMLElement.prototype.getBoundingClientRect;
beforeAll(() => {
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (this.dataset.filterField !== undefined) {
      const index = [...document.querySelectorAll('[data-filter-field]')].indexOf(this);
      return box(20, 100 + index * 40, 200, 30);
    }
    if (this.style.position === 'fixed') return box(parseFloat(this.style.left), parseFloat(this.style.top), 320, 200);
    return realRect.call(this);
  };
});
afterAll(() => {
  HTMLElement.prototype.getBoundingClientRect = realRect;
});

function renderGrid(filters: any[] = [], extraFields: string[] = []) {
  const store = createPivotStore(`auto-open-${Math.random()}`);
  act(() => {
    store.getState().setAvailableFields([
      ...['region', 'city', ...extraFields].map(name => fromSchema({ name, type: 'string' })),
      fromSchema({ name: 'sales', type: 'double' }),
      { ...fromSchema({ name: 'big_orders', type: 'string' }), kind: FieldKind.CUSTOM_FILTER } as any,
    ]);
    store.getState().setConfig({
      rows: ['region', ...extraFields],
      columns: [],
      filters,
      values: [{ field: 'sales', aggregation: 'Sum' }],
      customMetrics: [],
      customFilters: [],
      customGroupings: [],
    });
  });
  render(
    <PivotStoreContext.Provider value={{ store, instanceKey: 'auto-open' }}>
      <FilterPillsProvider>
        <DropZonesGrid />
        <DialogsManager dataEngine={null} snapshots={[]} />
      </FilterPillsProvider>
    </PivotStoreContext.Provider>
  );
  return store;
}

const pill = (field: string) =>
  [...document.querySelectorAll<HTMLElement>('[data-filter-field]')].find(el => el.dataset.filterField === field)!;

/** The open dialog sits 8px right of the pill, level with its top. */
function expectDialogBeside(field: string) {
  const rect = pill(field).getBoundingClientRect();
  const dialog = screen.getByRole('dialog');
  expect(dialog.style.left).toBe(`${rect.right + 8}px`);
  expect(dialog.style.top).toBe(`${rect.top}px`);
}

describe('a field landing in Filters opens its dialog', () => {
  it('opens the filter dialog, anchored on the new pill, for a dimension moved from Rows', () => {
    const store = renderGrid([{ field: 'city', type: 'equal' }]);
    act(() => store.getState().handleDrop('region', 'rows', 'filters', 1));

    expect(store.getState().filterDialog!.field.id).toBe('region');
    expect(store.getState().havingFilterDialog).toBeNull();
    expect(screen.getByRole('dialog', { name: /Filter: region/ })).toBeInTheDocument();
    expectDialogBeside('region');
  });

  it('opens the HAVING dialog for a measure moved from Values', () => {
    const store = renderGrid([{ field: 'city', type: 'equal' }]);
    act(() => store.getState().handleDrop('SUM_sales', 'values', 'filters', 1, 0));

    expect(store.getState().havingFilterDialog!.field.name).toBe('SUM_sales');
    expect(store.getState().filterDialog).toBeNull();
    expectDialogBeside('SUM_sales');
  });

  it('anchors on the pill of a field whose name holds quotes and brackets', () => {
    const odd = 'say "hi" [x]';
    const store = renderGrid([{ field: 'city', type: 'equal' }], [odd]);
    act(() => store.getState().handleDrop(odd, 'rows', 'filters', 1));

    expect(store.getState().filterDialog!.field.id).toBe(odd);
    expectDialogBeside(odd);
  });

  it('a click on a pill opens its dialog beside that pill, in the same shape', () => {
    const store = renderGrid([{ field: 'city', type: 'equal', value: 'Paris' }, { field: 'region', type: 'equal' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit filter for city' }));

    expect(store.getState().filterDialog).toMatchObject({ existingFilter: { field: 'city', value: 'Paris' }, anchorFieldId: 'city' });
    expectDialogBeside('city');
  });

  it('opens nothing for a custom filter or a reorder within Filters', () => {
    const store = renderGrid([{ field: 'city', type: 'equal' }, { field: 'region', type: 'equal' }]);
    act(() => store.getState().handleDrop('big_orders', 'available', 'filters', 0));
    act(() => store.getState().handleDrop('city', 'filters', 'filters', 2));

    expect(pill('big_orders')).toBeDefined();
    expect(store.getState().filterDialog).toBeNull();
    expect(store.getState().havingFilterDialog).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
