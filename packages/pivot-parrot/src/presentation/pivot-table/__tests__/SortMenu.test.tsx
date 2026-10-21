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
