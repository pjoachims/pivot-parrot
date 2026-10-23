import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ColumnHeaders } from '../../pivot-table/ColumnHeaders';
import { createPivotStore, PivotStoreContext } from '../../../application/state/store';
import { buildPivotDisplayData } from '../../../domain/pivot/index';
import { cube } from '../../../domain/pivot/__tests__/cubeFixture';
import { computeLeafColumns } from '../../../application/utils/columnHelpers';
import { columnPathKey } from '../../../application/utils/cubeIndex';
import { buildPivotGrid, layoutCSV } from '../../../application/utils/export';
import { pivotCellStyle, pivotRange } from '../../../domain/sheet/sheet';

const facts = [
  { region: 'Nord', category: 'Home', product: 'Lamp', sales: 5 },
  { region: 'Nord', category: 'Tech', product: 'Phone', sales: 10 },
  { region: 'Süd', category: 'Home', product: 'Sofa', sales: 900 },
  { region: 'Süd', category: 'Tech', product: 'Laptop', sales: 100 }
];
const values = [{ field: 'sales', aggregation: 'sum' }, { field: 'sales', aggregation: 'avg' }];
const cubeRows = cube(facts, ['region', 'category', 'product']);
const TECH = columnPathKey(['Tech']);

const layouts: Record<string, { rows: string[]; columns: string[] }> = {
  'Σ Values last': { rows: ['region'], columns: ['category', 'product', 'Σ Values'] },
  'Σ Values first': { rows: ['region'], columns: ['Σ Values', 'category', 'product'] },
  'Σ Values between': { rows: ['region'], columns: ['category', 'Σ Values', 'product'] },
  'Σ Values in rows': { rows: ['region', 'Σ Values'], columns: ['category', 'product'] }
};

/** A header cell as both views show it: its text, with ⊟ / ⊞ when it opens or closes a column group. */
type Cell = { text: string; toggle: '' | '⊟' | '⊞' };

/**
 * The table's column headers (ColumnHeaders) as one cell per column and header line, the row-label cell left out:
 * a cell spanning columns repeats its text, one spanning lines leaves the lines below empty, as the sheet writes them.
 */
function tableHeaders(data: any, leaves: any[], rowFields: string[], collapsed: string[]): Cell[][] {
  const collapse = {
    canCollapse: (g: unknown[]) => data.columnConfig.groups.some((x: unknown[]) => columnPathKey(x) === columnPathKey(g)),
    isCollapsed: (g: unknown[]) => collapsed.includes(columnPathKey(g)),
    toggle: () => {}
  };
  const { container, unmount } = render(
    <PivotStoreContext.Provider value={{ store: createPivotStore() } as any}>
      <table><thead>
        <ColumnHeaders data={data} leafColumns={leaves} rowFields={rowFields} rowFieldLabels={rowFields} colFieldLabels={[]}
          title="" styles={{}} dialect={null} dtypes={{}} collapse={collapse} />
      </thead></table>
    </PivotStoreContext.Provider>
  );
  const trs = [...container.querySelectorAll('tr')];
  const out: Cell[][] = trs.map(() => []);
  trs.forEach((tr, r) => {
    let c = 0;
    [...tr.querySelectorAll('th')].slice(r === 0 ? 1 : 0).forEach(th => {
      while (out[r][c]) c++;
      const button = th.querySelector('.pp-expand-btn');
      const toggle = !button ? '' : button.getAttribute('aria-expanded') === 'true' ? '⊟' : '⊞';
      const text = (th.textContent ?? '').replace(/ [↑↓]$/, '');
      for (let dr = 0; dr < th.rowSpan; dr++) {
        for (let dc = 0; dc < th.colSpan; dc++) {
          out[r + dr][c + dc] = dr === 0 ? { text, toggle: dc === 0 ? toggle : '' } : { text: '', toggle: '' };
        }
      }
      c += th.colSpan;
    });
  });
  unmount();
  return out;
}

function sheetOf(layout: string, collapsed: string[], colSubtotals: boolean) {
  const { rows, columns } = layouts[layout];
  const data = buildPivotDisplayData(cubeRows, rows, columns, values, null, {}, collapsed);
  const leaves = computeLeafColumns(data, true, colSubtotals);
  const grid = buildPivotGrid(data, leaves, rows, true, true, { values });
  const range = pivotRange(grid);
  const lines = grid.rows.filter(r => r.kind === 'header').length;
  const sheet: Cell[][] = grid.cells.slice(0, lines).map((line, y) => line.slice(1).map((cell, x) => {
    const group = range.columnGroups.get(String.fromCharCode(66 + x) + (y + 1));
    return { text: String(cell ?? ''), toggle: !group ? '' : group.open ? '⊟' : '⊞' };
  }));
  return { data, leaves, grid, range, sheet, table: tableHeaders(data, leaves, rows, collapsed) };
}

const fold = (cells: Cell[][]) => cells.map(line => line.map(c => c.toggle + c.text));

describe('the sheet\'s column headers are the table\'s, wherever Σ Values sits', () => {
  for (const layout of Object.keys(layouts)) {
    for (const collapsed of [[], [TECH]]) {
      for (const colSubtotals of [true, false]) {
        it(`${layout}, ${collapsed.length ? 'Tech collapsed' : 'all open'}, column subtotals ${colSubtotals ? 'on' : 'off'}`, () => {
          const { sheet, table, leaves } = sheetOf(layout, collapsed, colSubtotals);
          expect(sheet).toHaveLength(table.length);
          // The grand-total columns are named apart: the sheet writes "Grand Total" once above its metric.
          const shown = (cells: Cell[][]) => fold(cells).map(line => line.filter((_, x) => !leaves[x].isGrandTotal));
          expect(shown(sheet)).toEqual(shown(table));
        });
      }
    }
  }

  it('Σ Values first: the metric line on top, each group\'s toggle on the line of its member, as in the table', () => {
    const { sheet, range } = sheetOf('Σ Values first', [TECH], false);
    expect(fold(sheet)).toEqual([
      ['sum_sales', 'sum_sales', 'sum_sales', 'Grand Total', 'avg_sales', 'avg_sales', 'avg_sales', 'Grand Total'],
      ['⊟Home', 'Home', '⊞Tech', '', '⊟Home', 'Home', '⊞Tech', ''],
      ['Lamp', 'Sofa', '', 'sum_sales', 'Lamp', 'Sofa', '', 'avg_sales']
    ]);
    expect(range.columnGroups.get('D2')).toEqual({ key: TECH, open: false });
    expect(pivotCellStyle(range, 3, 1)?.role).toBe('header');
  });

  it('Σ Values between: a collapsed group keeps its metrics on the metric line, a subtotal names itself below them', () => {
    const { sheet, grid } = sheetOf('Σ Values between', [TECH], true);
    expect(fold(sheet)).toEqual([
      ['⊟Home', 'Home', 'Home', 'Home', 'Home', 'Home', '⊞Tech', 'Tech', 'Grand Total', 'Grand Total'],
      ['sum_sales', 'sum_sales', 'sum_sales', 'avg_sales', 'avg_sales', 'avg_sales', 'sum_sales', 'avg_sales', '', ''],
      ['Lamp', 'Sofa', 'Subtotal', 'Lamp', 'Sofa', 'Subtotal', '', '', 'sum_sales', 'avg_sales']
    ]);
    expect(grid.columns).toEqual(['label', 'value', 'value', 'subtotal', 'value', 'value', 'subtotal', 'value', 'value', 'total', 'total']);
  });

  it('the "Visual Layout" CSV writes the same header lines', () => {
    const config = { rows: ['region'], columns: ['Σ Values', 'category', 'product'], values };
    const data = buildPivotDisplayData(cubeRows, config.rows, config.columns, values);
    expect(layoutCSV(data, config).split(/\r?\n/).slice(0, 3).map(l => l.split(',').slice(0, 4))).toEqual([
      ['Row Labels', 'sum_sales', 'sum_sales', 'sum_sales'],
      ['', 'Home', 'Home', 'Home'],
      ['', 'Lamp', 'Sofa', 'Subtotal']
    ]);
  });
});
