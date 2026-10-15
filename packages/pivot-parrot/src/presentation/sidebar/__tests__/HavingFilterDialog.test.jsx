import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HavingFilterDialog } from '../dialogs/HavingFilterDialog';
import { buildFilter } from '../../../domain/query/sql/filters';
import { DuckDBDialect } from '../../../domain/query/dialects/DuckDBDialect';

const field = { name: 'SUM_sales' };

it('"Not equal" is an equal filter negated, which SQL generation knows', () => {
  const onApply = vi.fn();
  render(<HavingFilterDialog field={field} displayName="Sum of sales" onApply={onApply} onClose={() => {}} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'not_equal' } });
  fireEvent.change(screen.getByPlaceholderText(/numeric value/i), { target: { value: '10' } });
  fireEvent.click(screen.getByText('Apply'));

  const filter = onApply.mock.calls[0][0];
  expect(filter).toMatchObject({ field: 'SUM_sales', type: 'equal', isNot: true, value: '10', filterType: 'having' });
  expect(buildFilter({ ...filter, field: 'sum(sales)' }).toSQL(new DuckDBDialect(), false)).toContain('NOT');
});

it('reopens a negated equal filter as "Not equal"', () => {
  render(<HavingFilterDialog field={field} displayName="Sum of sales" existingFilter={{ type: 'equal', isNot: true, value: '10' }} onApply={() => {}} onClose={() => {}} />);
  expect(screen.getByRole('combobox')).toHaveValue('not_equal');
});
