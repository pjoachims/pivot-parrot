import React from 'react';
import { render, screen } from '@testing-library/react';
import { it, expect } from 'vitest';
import { SortMenu } from '../PivotMenus';

it('names the sorted column on one line, with the whole name in a tooltip', () => {
  const columnPath = ['Furniture and other long category names', null, 'East'];
  render(
    <SortMenu
      data={{ columnConfig: { valueFields: ['sum_sales'] } }}
      config={{ values: [{ field: 'sales', aggregation: 'sum' }] }}
      sortConfig={{ valueKey: 'sum_sales', direction: 'desc', columnPath }}
      onSortChange={() => {}}
    />
  );
  const label = screen.getByText(/^In column:/);
  expect(label).toHaveAttribute('title', 'In column: Furniture and other long category names / (Blank) / East');
  expect(label).toHaveStyle({ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
});

it('gives the sorted column name a line of its own, apart from the Use Grand Total button', () => {
  render(
    <SortMenu
      data={{ columnConfig: { valueFields: ['sum_sales'] } }}
      config={{ values: [{ field: 'sales', aggregation: 'sum' }] }}
      sortConfig={{ valueKey: 'sum_sales', direction: 'desc', columnPath: ['Furniture', 'Desk'] }}
      onSortChange={() => {}}
    />
  );
  const label = screen.getByText('In column: Furniture / Desk');
  expect(screen.getByRole('button', { name: 'Use Grand Total' }).parentElement).not.toBe(label.parentElement);
});
