/**
 * FieldsList Smoke Test
 *
 * Quick integration test to verify the refactored FieldsList works.
 * Tests the most critical functionality without exhaustive coverage.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { createPivotStore, PivotStoreContext } from '../../../../../application/state/store';
import FieldsList from '../FieldsList';
import { FieldKind } from '../../../../../domain/models/types';

describe('FieldsList - Smoke Test', () => {
  let store: any;

  //  Helper to render component with store context
  const renderWithStore = (ui: React.ReactElement) => {
    return render(
      <PivotStoreContext.Provider value={{ store, instanceKey: 'test' }}>
        {ui}
      </PivotStoreContext.Provider>
    );
  };

  beforeEach(() => {
    // Create test data
    const availableFields = [
      {
        id: 'customer_name',
        name: 'Customer Name',
        dtype: 'string',
        kind: FieldKind.BASE_FIELD,
        originalType: null,
        sourceField: null,
        aggregation: null,
        formula: null,
        format: null
      },
      {
        id: 'total_sales',
        name: 'Total Sales',
        dtype: 'double',
        kind: FieldKind.BASE_FIELD,
        originalType: null,
        sourceField: null,
        aggregation: null,
        formula: null,
        format: null
      }
    ];

    const config = {
      rows: [],
      columns: [],
      values: [],
      filters: [],
      customMetrics: [
        { id: 'revenue', name: 'Total Revenue', expr: 'SUM(total_sales)' }
      ],
      customFilters: [],
      customGroupings: []
    };

    // Create store instance
    store = createPivotStore('test');

    // Initialize store state
    act(() => {
      store.getState().setAvailableFields(availableFields);
      store.getState().setDetectedTypes({
        customer_name: 'string',
        total_sales: 'numeric'
      });
      store.getState().setConfig(config);
      store.getState().setSearchQuery('');
    });
  });

  it('renders without crashing', () => {
    renderWithStore(<FieldsList />);

    // Component should render
    expect(screen.getByText('Customer Name')).toBeInTheDocument();
  });

  it('shows available fields', () => {
    renderWithStore(<FieldsList />);

    expect(screen.getByText('Customer Name')).toBeInTheDocument();
    expect(screen.getByText('Total Sales')).toBeInTheDocument();
  });

  it('shows custom metrics', () => {
    renderWithStore(<FieldsList />);

    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
  });

  it('filters fields when search query changes', () => {
    renderWithStore(<FieldsList />);

    // Initially all fields visible
    expect(screen.getByText('Customer Name')).toBeInTheDocument();
    expect(screen.getByText('Total Sales')).toBeInTheDocument();

    // Set search query
    act(() => {
      store.getState().setSearchQuery('customer');
    });

    // Only matching field visible
    expect(screen.getByText('Customer Name')).toBeInTheDocument();
    expect(screen.queryByText('Total Sales')).not.toBeInTheDocument();
  });

  it('adds field to config when checkbox clicked', () => {
    renderWithStore(<FieldsList />);

    const checkbox = screen.getAllByRole('checkbox')[0]; // First checkbox

    // Click to select
    fireEvent.click(checkbox);

    // Verify field added to config (either rows or values)
    const updatedConfig = store.getState().config;
    const hasField =
      updatedConfig.rows.includes('customer_name') ||
      updatedConfig.values.some((v: any) => v.field === 'customer_name');

    expect(hasField).toBe(true);
  });

  it('removes field when checkbox unchecked', () => {
    // Pre-populate config
    act(() => {
      const currentConfig = store.getState().config;
      store.getState().setConfig({
        ...currentConfig,
        rows: ['customer_name']
      });
    });

    renderWithStore(<FieldsList />);

    const checkbox = screen.getAllByRole('checkbox')[0];
    expect(checkbox).toBeChecked();

    // Uncheck
    fireEvent.click(checkbox);

    // Verify field removed
    const updatedConfig = store.getState().config;
    expect(updatedConfig.rows).not.toContain('customer_name');
  });

  it('handles empty fields list', () => {
    act(() => {
      store.getState().setAvailableFields([]);
    });

    renderWithStore(<FieldsList />);

    // Should not crash
    expect(screen.queryByText('Customer Name')).not.toBeInTheDocument();
  });
});
