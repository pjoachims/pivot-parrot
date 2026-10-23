import { describe, it, expect } from 'vitest';
import { cellAddress, columnLabel, composeSheet, editCell, parseAddress, pivotRange as rangeOf, summarize } from '../sheet';
import { gridOf } from './gridOf';

const pivotRange = (cells: any[][]) => rangeOf(gridOf(cells));

const grid = [
  ['Row Labels', 'Sum of sales', 'Share'],
  ['Nord', 120, { percent: 0.6 }],
  ['Süd', 80, { percent: 0.4 }],
  ['Grand Total', 200, { percent: 1 }]
];

describe('addresses', () => {
  it('names columns like a spreadsheet and reads them back', () => {
    expect([0, 25, 26, 27, 701, 702].map(columnLabel)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
    for (const [x, y] of [[0, 0], [27, 9], [702, 41]]) expect(parseAddress(cellAddress(x, y))).toEqual({ x, y });
    for (const bad of ['', 'a1', 'A0', '1A', 'A1:B2']) expect(parseAddress(bad)).toBeNull();
  });
});

describe('pivotRange', () => {
  it('writes the layout from A1, a percentage as its fraction, and keeps a label starting with = as text', () => {
    const range = pivotRange([...grid, ['=x', null, 7n]]);
    expect(range.rows).toBe(5);
    expect(range.cols).toBe(3);
    expect(range.values[1]).toEqual(['Nord', 120, 0.6]);
    expect(range.values[4]).toEqual(["'=x", '', 7]);
    expect([...range.percent]).toEqual(['C2', 'C3', 'C4']);
  });
});

describe('composeSheet', () => {
  it('puts the user cells next to the pivot and pads to the minimum size', () => {
    const { data, covered } = composeSheet(pivotRange(grid), { E2: '=B2/B4', F9: 'x' }, 8, 10);
    expect(data).toHaveLength(10);
    expect(data[0]).toHaveLength(8);
    expect(data[1].slice(0, 5)).toEqual(['Nord', 120, 0.6, '', '=B2/B4']);
    expect(data[8][5]).toBe('x');
    expect(covered).toEqual([]);
  });

  it('a user cell the pivot grows over is hidden, not lost, and is back once the pivot shrinks', () => {
    const cells = { D2: 'mine' };
    const wide = pivotRange(grid.map(r => [...r, 1]));
    expect(composeSheet(wide, cells)).toMatchObject({ covered: ['D2'] });
    expect(composeSheet(wide, cells).data[1][3]).toBe(1);
    expect(composeSheet(pivotRange(grid), cells).data[1][3]).toBe('mine');
  });

  it('a pivot that shrinks leaves no stale result behind', () => {
    const { data } = composeSheet(pivotRange(grid.slice(0, 2)), {}, 3, 4);
    expect(data.slice(2)).toEqual([['', '', ''], ['', '', '']]);
  });
});

describe('editCell', () => {
  const range = pivotRange(grid);

  it('the pivot range is read-only', () => {
    const cells = { E1: 'a' };
    expect(editCell(range, cells, 'B2', '999')).toBe(cells);
    expect(editCell(range, cells, 'C4', '')).toBe(cells);
  });

  it('typing next to the pivot stores the raw input, and clearing a cell removes it', () => {
    const next = editCell(range, {}, 'D2', '=B2/B4');
    expect(next).toEqual({ D2: '=B2/B4' });
    expect(editCell(range, next, 'D2', '')).toEqual({});
    expect(editCell(range, next, 'D2', '=B2/B4')).toBe(next);
  });
});

describe('summarize', () => {
  it('counts what is not empty and sums and averages the numbers, like the Excel status bar', () => {
    expect(summarize([120, '80', 'Nord', '', null, '0.5'])).toEqual({ count: 4, numbers: 3, sum: 200.5, average: 200.5 / 3 });
    expect(summarize(['a', ''])).toEqual({ count: 1, numbers: 0, sum: 0, average: null });
  });
});
