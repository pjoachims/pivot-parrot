import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import PivotDisplay from '../PivotDisplay';
import { createPivotStore, PivotStoreContext } from '../../../application/state/store';
import { buildPivotDisplayData } from '../../../domain/pivot';
import { cubeRows, expected, leafMembers } from '../../../application/utils/__tests__/salesCube';

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

const values = [{ field: 'qty', aggregation: 'sum' }, { field: 'price', aggregation: 'sum' }];

function renderTable(rows: string[], columns: string[], subtotals: string) {
  const config = { rows, columns, values, filters: [], subtotals, grandTotals: 'both' };
  const dims = [...rows, ...columns].filter(f => f !== 'Σ Values');
  const data = buildPivotDisplayData(cubeRows(dims), rows, columns, values);
  const key = `cv-${rows.join()}-${columns.join()}-${subtotals}`;
  const { container } = render(
    <PivotStoreContext.Provider value={{ store: createPivotStore(key), instanceKey: key }}>
      <PivotDisplay data={data} cubeResults={[]} rowFields={rows} config={config} />
    </PivotStoreContext.Provider>
  );
  return { data, container };
}

/** The shown leaf columns, in order: every column leaf, less subtotals unless column subtotals are on. */
function shownLeaves(data, subtotals: string) {
  const showSub = subtotals === 'col' || subtotals === 'both';
  const out = [];
  const walk = nodes => nodes.forEach(n => {
    if (n.children?.length) return walk(n.children);
    if (!(n.isSubtotal && !n.isGrandTotal && !showSub)) out.push(n);
  });
  walk(data.columnConfig.hierarchy);
  return out;
}

const num = (s: string) => Number(s.replace(/[^\d.-]/g, ''));

function cellsOf(container: HTMLElement, label: string): number[] {
  const span = [...container.querySelectorAll('tbody td > span')].find(el => el.textContent === label);
  expect(span, `row ${label}`).toBeTruthy();
  return [...span!.closest('tr')!.querySelectorAll('td')].slice(1).map(td => num(td.textContent ?? ''));
}

describe.each([
  [['category', 'product', 'Σ Values'], 'row'],
  [['category', 'product', 'Σ Values'], 'none'],
  [['Σ Values', 'category', 'product'], 'none'],
  [['category', 'product', 'Σ Values'], 'both'],
  [['category', 'Σ Values'], 'none'],
])('table with columns %j, subtotals %s', (columns, subtotals) => {
  it('shows in every cell the aggregate of its row and its column', () => {
    const { data, container } = renderTable(['region'], columns as string[], subtotals as string);
    const leaves = shownLeaves(data, subtotals as string);
    const wrong = [];
    for (const region of ['North', 'South', 'Grand Total']) {
      const cells = cellsOf(container, region);
      expect(cells.length).toBe(leaves.length);
      leaves.forEach((leaf, i) => {
        const want = expected(region === 'Grand Total' ? null : region, leafMembers(leaf), leaf.metric);
        if (cells[i] !== want) wrong.push(`${region} ${JSON.stringify(leafMembers(leaf))} ${leaf.metric}: shows ${cells[i]}, is ${want}`);
      });
    }
    expect(wrong).toEqual([]);
  });
});

describe('table with Σ Values in rows, columns category > product, subtotals none', () => {
  it('shows in every grand-total cell the aggregate of its metric and its column', () => {
    const { data, container } = renderTable(['region', 'Σ Values'], ['category', 'product'], 'none');
    const leaves = shownLeaves(data, 'none');
    const wrong = [];
    for (const gt of data.grandTotal) {
      const cells = cellsOf(container, `Grand Total - ${gt.metricLabel}`);
      expect(cells.length).toBe(leaves.length);
      leaves.forEach((leaf, i) => {
        const want = expected(null, leafMembers(leaf), gt.metric);
        if (cells[i] !== want) wrong.push(`${gt.metric} ${JSON.stringify(leafMembers(leaf))}: shows ${cells[i]}, is ${want}`);
      });
    }
    expect(wrong).toEqual([]);
  });
});
