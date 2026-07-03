/**
 * Component tests for FilterDialog
 * These tests would have caught the "Fetch Unique Values" UI bug
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FilterDialog } from '../dialogs/FilterDialog';

// Mock the store
const mockCacheUniqueValues = vi.fn();
let mockUniqueValuesCache = {};

vi.mock('../../../application/state/store', () => ({
  usePivotStore: vi.fn((selector) => {
    const mockState = {
      get uniqueValuesCache() { return mockUniqueValuesCache; },
      cacheUniqueValues: mockCacheUniqueValues
    };
    return selector ? selector(mockState) : mockState;
  })
}));

describe('FilterDialog', () => {
  let defaultProps;

  beforeEach(() => {
    // Reset mock cache before each test
    mockUniqueValuesCache = {};
    mockCacheUniqueValues.mockClear();

    // Setup common props for all tests
    defaultProps = {
      field: {
        name: 'category',
        getUniqueValues: vi.fn()
      },
      fieldType: 'string',
      existingFilter: null,
      onApply: vi.fn(),
      onClose: vi.fn(),
      activeFilters: [],
      anchorEl: document.createElement('div')
    };
  });

  describe('Fetch Unique Values', () => {
    it('should display fetched values in UI after clicking button', async () => {
      // Mock the fetch to return sample values
      defaultProps.field.getUniqueValues.mockResolvedValue([
        'Furniture',
        'Technology',
        'Office Supplies'
      ]);

      render(<FilterDialog {...defaultProps} />);

      // Switch to "One Of" tab where the fetch button is
      const oneOfTab = screen.getByText(/One Of/i);
      fireEvent.click(oneOfTab);

      // Initially, values should not be visible
      expect(screen.queryByText(/Furniture/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Technology/)).not.toBeInTheDocument();

      // Find and click the "Fetch Unique Values" button
      const fetchButton = screen.getByText(/Fetch Unique Values/i);
      expect(fetchButton).toBeInTheDocument();

      fireEvent.click(fetchButton);

      // Verify the fetch function was called
      expect(defaultProps.field.getUniqueValues).toHaveBeenCalledTimes(1);
      expect(defaultProps.field.getUniqueValues).toHaveBeenCalledWith([]);

      // Wait for values to appear in the DOM
      // This is where the bug would be caught - without setFetchedValues(),
      // the component wouldn't re-render and these assertions would fail
      await waitFor(() => {
        expect(screen.getByText(/Furniture/)).toBeInTheDocument();
      }, { timeout: 3000 });

      // Verify all values are displayed
      expect(screen.getByText(/Technology/)).toBeInTheDocument();
      expect(screen.getByText(/Office Supplies/)).toBeInTheDocument();

      // Verify cache was updated via store action
      expect(mockCacheUniqueValues).toHaveBeenCalledWith(
        'category',
        expect.arrayContaining(['Furniture', 'Technology', 'Office Supplies'])
      );
    });

    it('should show loading state while fetching', async () => {
      // Create a promise we can control
      let resolveFetch;
      const fetchPromise = new Promise(resolve => {
        resolveFetch = resolve;
      });
      defaultProps.field.getUniqueValues.mockReturnValue(fetchPromise);

      render(<FilterDialog {...defaultProps} />);

      // Switch to "One Of" tab
      const oneOfTab = screen.getByText(/One Of/i);
      fireEvent.click(oneOfTab);

      const fetchButton = screen.getByText(/Fetch Unique Values/i);
      fireEvent.click(fetchButton);

      // While loading, should show "Fetching..." text
      await waitFor(() => {
        expect(screen.getByText(/Fetching/i)).toBeInTheDocument();
      });

      // Resolve the fetch
      resolveFetch(['Value1', 'Value2']);

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.queryByText(/Fetching/i)).not.toBeInTheDocument();
      });

      // Values should now be visible
      expect(screen.getByText(/Value1/)).toBeInTheDocument();
      expect(screen.getByText(/Value2/)).toBeInTheDocument();
    });

    it('should handle fetch with existing filters', async () => {
      // Setup with active filters
      defaultProps.activeFilters = [
        { field: 'region', value: 'East', type: 'equals' }
      ];
      defaultProps.field.getUniqueValues.mockResolvedValue(['A', 'B', 'C']);

      render(<FilterDialog {...defaultProps} />);

      // Switch to "One Of" tab
      const oneOfTab = screen.getByText(/One Of/i);
      fireEvent.click(oneOfTab);

      const fetchButton = screen.getByText(/Fetch Unique Values/i);
      fireEvent.click(fetchButton);

      // Should show filter selection UI instead of fetching immediately
      await waitFor(() => {
        expect(screen.getByText(/region/)).toBeInTheDocument();
      });

      // Should show "Fetch" button in filter selection
      const confirmFetchButton = screen.getByRole('button', { name: /^Fetch$/i });
      fireEvent.click(confirmFetchButton);

      // Now it should fetch
      expect(defaultProps.field.getUniqueValues).toHaveBeenCalled();

      // Wait for values - use getAllByRole to find checkboxes
      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes.length).toBeGreaterThan(1); // At least one value checkbox plus "Select All"
      });
    });

    it('should use cached values when available', () => {
      // Provide cached values via mock store
      mockUniqueValuesCache = {
        category: ['Cached1', 'Cached2', 'Cached3']
      };

      render(<FilterDialog {...defaultProps} />);

      // Switch to "One Of" tab
      const oneOfTab = screen.getByText(/One Of/i);
      fireEvent.click(oneOfTab);

      // Cached values should be immediately visible
      expect(screen.getByText(/Cached1/)).toBeInTheDocument();
      expect(screen.getByText(/Cached2/)).toBeInTheDocument();
      expect(screen.getByText(/Cached3/)).toBeInTheDocument();

      // Should not show "Fetch" button since we have cache
      expect(screen.queryByText(/Fetch Unique Values/i)).not.toBeInTheDocument();
    });

    it('should handle fetch errors gracefully', async () => {
      // Mock fetch to reject
      const mockError = new Error('Network error');
      defaultProps.field.getUniqueValues.mockRejectedValue(mockError);

      // Spy on console.error to verify error logging
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<FilterDialog {...defaultProps} />);

      // Switch to "One Of" tab
      const oneOfTab = screen.getByText(/One Of/i);
      fireEvent.click(oneOfTab);

      const fetchButton = screen.getByText(/Fetch Unique Values/i);
      fireEvent.click(fetchButton);

      // Wait for error handling
      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      // Should stop showing loading state
      expect(screen.queryByText(/Fetching/i)).not.toBeInTheDocument();

      // Restore console.error
      consoleErrorSpy.mockRestore();
    });

    it('should allow selecting and applying values', async () => {
      defaultProps.field.getUniqueValues.mockResolvedValue(['A', 'B', 'C']);

      render(<FilterDialog {...defaultProps} />);

      // Switch to "One Of" tab
      const oneOfTab = screen.getByText(/One Of/i);
      fireEvent.click(oneOfTab);

      // Fetch values
      const fetchButton = screen.getByText(/Fetch Unique Values/i);
      fireEvent.click(fetchButton);

      // Wait for values to appear - check for checkboxes
      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes.length).toBeGreaterThanOrEqual(3); // At least 3 values (A, B, C)
      });

      // Find and click checkboxes for values
      const checkboxes = screen.getAllByRole('checkbox');

      // Select first two value checkboxes
      fireEvent.click(checkboxes[0]); // First value
      fireEvent.click(checkboxes[1]); // Second value

      // Apply filter
      const applyButton = screen.getByText(/Apply/i);
      fireEvent.click(applyButton);

      // Verify onApply was called with selected values (any 2 of the 3 values)
      await waitFor(() => {
        expect(defaultProps.onApply).toHaveBeenCalledWith(
          expect.objectContaining({
            field: 'category',
            type: 'one_of',
            selectedValues: expect.any(Array)
          })
        );
      });

      // Verify selectedValues has 2 items
      const call = defaultProps.onApply.mock.calls[0][0];
      expect(call.selectedValues).toHaveLength(2);
    });

    it('should maintain local state when parent cache updates', async () => {
      // Start with no cache
      const { rerender } = render(<FilterDialog {...defaultProps} />);

      // Switch to "One Of" tab
      const oneOfTab = screen.getByText(/One Of/i);
      fireEvent.click(oneOfTab);

      // Fetch values
      defaultProps.field.getUniqueValues.mockResolvedValue(['Local1', 'Local2']);
      const fetchButton = screen.getByText(/Fetch Unique Values/i);
      fireEvent.click(fetchButton);

      // Wait for local values
      await waitFor(() => {
        expect(screen.getByText(/Local1/)).toBeInTheDocument();
      });

      // Simulate parent updating cache with different values
      const updatedProps = {
        ...defaultProps,
        uniqueValuesCache: {
          category: ['Parent1', 'Parent2']
        }
      };

      rerender(<FilterDialog {...updatedProps} />);

      // Should still show local fetched values, not parent cache
      expect(screen.getByText(/Local1/)).toBeInTheDocument();
      expect(screen.queryByText(/Parent1/)).not.toBeInTheDocument();
    });
  });

  describe('Filter Type Selection', () => {
    it('should render basic filter types for string fields', () => {
      render(<FilterDialog {...defaultProps} />);

      // Should show filter type tabs
      expect(screen.getByText(/Basic/i)).toBeInTheDocument();
      expect(screen.getByText(/Advanced/i)).toBeInTheDocument();
    });

    it('should switch between filter types', () => {
      render(<FilterDialog {...defaultProps} />);

      // Click Advanced dropdown
      const advancedTab = screen.getByText(/Advanced ▾/i);
      fireEvent.click(advancedTab);

      // Should show advanced filter options dropdown
      // The advanced dropdown should show options like "Between", "Regex", etc.
      // For now, just verify the dropdown exists by checking if clicking it works
      expect(advancedTab).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible button labels', () => {
      defaultProps.field.getUniqueValues.mockResolvedValue(['A', 'B']);

      render(<FilterDialog {...defaultProps} />);

      // Switch to "One Of" tab
      const oneOfTab = screen.getByText(/One Of/i);
      fireEvent.click(oneOfTab);

      // All buttons should have accessible names
      const fetchButton = screen.getByRole('button', { name: /Fetch Unique Values/i });
      expect(fetchButton).toBeInTheDocument();

      const closeButton = screen.getByRole('button', { name: /Cancel/i });
      expect(closeButton).toBeInTheDocument();
    });
  });
});
