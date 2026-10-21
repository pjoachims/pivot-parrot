import { it, expect } from 'vitest';
import { buildPivotDisplayData } from '../index';
import { toPlainJSON, fromPlainJSON } from '../../snapshot/json';

const g = (region: number, year: number) => ({ _grouping_region: region, _grouping_year: year });

// Totals favour North; 2024 alone favours South, and the null-year column favours East.
const sqlRows: any[] = [
  { region: 'North', year: 2023n, sum_sales: 90, ...g(0, 0) },
  { region: 'North', year: 2024n, sum_sales: 10, ...g(0, 0) },
  { region: 'South', year: 2023n, sum_sales: 5, ...g(0, 0) },
  { region: 'South', year: 2024n, sum_sales: 40, ...g(0, 0) },
  { region: 'East', year: null, sum_sales: 20, ...g(0, 0) },
  { region: 'North', year: null, sum_sales: 100, ...g(0, 1) },
  { region: 'South', year: null, sum_sales: 45, ...g(0, 1) },
  { region: 'East', year: null, sum_sales: 20, ...g(0, 1) },
  { region: null, year: 2023n, sum_sales: 95, ...g(1, 0) },
  { region: null, year: 2024n, sum_sales: 50, ...g(1, 0) },
  { region: null, year: null, sum_sales: 20, ...g(1, 0) },
  { region: null, year: null, sum_sales: 165, ...g(1, 1) }
];
const values = [{ field: 'sales', aggregation: 'sum' }];
const order = (sortConfig: any) =>
  buildPivotDisplayData(sqlRows, ['region'], ['year'], values, sortConfig).rowGroups.map((r: any) => r.label);

it('sorts rows by the Grand Total column when no column is named', () => {
  expect(order({ valueKey: 'sum_sales', direction: 'desc' })).toEqual(['North', 'South', 'East']);
});

it('sorts rows by the named column, not by their total', () => {
  expect(order({ valueKey: 'sum_sales', direction: 'desc', columnPath: [2024n] })).toEqual(['South', 'North', 'East']);
  expect(order({ valueKey: 'sum_sales', direction: 'asc', columnPath: [2024n] })).toEqual(['North', 'South', 'East']);
});

it('sorts by a null member column', () => {
  expect(order({ valueKey: 'sum_sales', direction: 'desc', columnPath: [null] })[0]).toBe('East');
});

it('sorts by the same column after the sort is saved as JSON and read back', () => {
  const saved = JSON.parse(JSON.stringify(toPlainJSON({ valueKey: 'sum_sales', direction: 'desc', columnPath: [2024n] })));
  expect(order(fromPlainJSON(saved))).toEqual(['South', 'North', 'East']);
});

it('keeps the row order when the column no longer exists', () => {
  const unsorted = order(null);
  expect(order({ valueKey: 'sum_sales', direction: 'desc', columnPath: [1999] })).toEqual(unsorted);
});
