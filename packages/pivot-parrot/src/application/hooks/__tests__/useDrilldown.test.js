/**
 * Component tests for useDrilldown hook
 * Tests that drilldown results are properly managed and accessible
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { useDrilldown } from '../useDrilldown';
import { Arrow } from '../../../domain/types/ArrowTypes';
import { createPivotStore, PivotStoreContext } from '../../state/store';
import { toRows } from '../../utils/columnarResult';

describe('useDrilldown', () => {
  let mockDataEngine;
  let store;
  let wrapper;

  beforeEach(() => {
    mockDataEngine = {
      init: vi.fn().mockResolvedValue(true),
      executeDrilldown: vi.fn(),
      getDialect: vi.fn(() => ({
        buildWhereClause: vi.fn(() => "category = 'Furniture'")
      }))
    };

    store = createPivotStore();
    wrapper = ({ children }) => React.createElement(
      PivotStoreContext.Provider,
      { value: { store, instanceKey: 'test' } },
      children
    );
  });

  describe('Test B: Given results, they are displayed', () => {
    // Verifies that when a user clicks a pivot cell, the hook executes the drilldown query
    // and stores the resulting data rows in state so the UI can display them in a table.
    it('should store drilldown data after successful execution', async () => {
      // Test: executeDrilldown → drilldownData populated for UI display

      // SETUP
      const mockDrilldownData = [
        { category: 'Furniture', region: 'East', sales: 100 },
        { category: 'Furniture', region: 'East', sales: 200 }
      ];

      mockDataEngine.executeDrilldown.mockResolvedValueOnce({
        data: mockDrilldownData,
        sql: "SELECT * FROM test_table WHERE category = 'Furniture' LIMIT 10000",
        rowCount: 2,
        columnCount: 3,
        filters: [{ field: 'category', value: 'Furniture', dtype: Arrow.string }],
        limitReached: false,
        dtypes: { category: 'string', region: 'string', sales: 'numeric' }
      });

      const { result } = renderHook(
        () => useDrilldown(mockDataEngine, null, {}, null, null),
        { wrapper }
      );

      expect(result.current.drilldownData).toBeNull();

      // ACT
      await act(async () => {
        await result.current.executeDrilldown([
          { field: 'category', value: 'Furniture', dtype: Arrow.string }
        ]);
      });

      // ASSERT
      expect(toRows(result.current.drilldownData)).toEqual(mockDrilldownData);
      expect(result.current.drilldownData.numRows).toBe(2);
      expect(result.current.drilldownSQL).toContain('WHERE');
      expect(result.current.drilldownFilters).toBeDefined();
      expect(result.current.drilldownLoading).toBe(false);
    });

    // Ensures that when a user clicks different pivot cells (changing filter criteria),
    // the old drilldown data is replaced with new data, not appended. Each drilldown is independent.
    it('should update drilldownData when filters change', async () => {
      // Test: First drilldown → data1, Second drilldown → data2 (replaces data1)

      // SETUP
      const furnitureData = [
        { category: 'Furniture', sales: 100 }
      ];

      const techData = [
        { category: 'Technology', sales: 500 },
        { category: 'Technology', sales: 600 }
      ];

      mockDataEngine.executeDrilldown.mockResolvedValueOnce({
        data: furnitureData,
        sql: "SELECT * FROM test_table WHERE category = 'Furniture' LIMIT 10000",
        rowCount: 1,
        filters: [{ field: 'category', value: 'Furniture', dtype: Arrow.string }]
      });

      const { result } = renderHook(
        () => useDrilldown(mockDataEngine, null, {}, null, null),
        { wrapper }
      );

      // ACT - First drilldown
      await act(async () => {
        await result.current.executeDrilldown([
          { field: 'category', value: 'Furniture', dtype: Arrow.string }
        ]);
      });

      expect(toRows(result.current.drilldownData)).toEqual(furnitureData);
      expect(result.current.drilldownData.numRows).toBe(1);

      mockDataEngine.executeDrilldown.mockResolvedValueOnce({
        data: techData,
        sql: "SELECT * FROM test_table WHERE category = 'Technology' LIMIT 10000",
        rowCount: 2,
        filters: [{ field: 'category', value: 'Technology', dtype: Arrow.string }]
      });

      // ACT - Second drilldown
      await act(async () => {
        await result.current.executeDrilldown([
          { field: 'category', value: 'Technology', dtype: Arrow.string }
        ]);
      });

      // ASSERT
      expect(toRows(result.current.drilldownData)).toEqual(techData);
      expect(result.current.drilldownData.numRows).toBe(2);
    });

    // Verifies that the generated SQL is accessible so the UI can show it to users
    // for debugging, learning, or copying to run in their own SQL tools.
    it('should provide SQL query for display/debugging', async () => {
      // Test: executeDrilldown → drilldownSQL available for UI display

      // SETUP
      mockDataEngine.executeDrilldown.mockResolvedValueOnce({
        data: [{ category: 'Furniture', sales: 100 }],
        sql: "SELECT * FROM test_table WHERE category = 'Furniture' AND region = 'East' LIMIT 10000",
        rowCount: 1
      });

      const { result } = renderHook(
        () => useDrilldown(mockDataEngine, null, {}, null, null),
        { wrapper }
      );

      // ACT
      await act(async () => {
        await result.current.executeDrilldown([
          { field: 'category', value: 'Furniture', dtype: Arrow.string },
          { field: 'region', value: 'East', dtype: Arrow.string }
        ]);
      });

      // ASSERT
      expect(result.current.drilldownSQL).toBe(
        "SELECT * FROM test_table WHERE category = 'Furniture' AND region = 'East' LIMIT 10000"
      );
    });

    // Ensures the applied filters are stored so the UI can display
    // "Showing: category='Furniture', region='East'" above the drilldown results.
    it('should provide filter information for display', async () => {
      // Test: executeDrilldown → drilldownFilters available for "Showing: ..." display

      // SETUP
      const filters = [
        { field: 'category', value: 'Furniture', dtype: Arrow.string },
        { field: 'region', value: 'East', dtype: Arrow.string }
      ];

      mockDataEngine.executeDrilldown.mockResolvedValueOnce({
        data: [{ category: 'Furniture', region: 'East', sales: 100 }],
        sql: "SELECT * FROM test_table WHERE category = 'Furniture' AND region = 'East' LIMIT 10000",
        rowCount: 1,
        filters
      });

      const { result } = renderHook(
        () => useDrilldown(mockDataEngine, null, {}, null, null),
        { wrapper }
      );

      // ACT
      await act(async () => {
        await result.current.executeDrilldown(filters);
      });

      // ASSERT
      expect(result.current.drilldownFilters).toEqual(filters);
    });

    // Verifies that the loading flag is set while the query executes, allowing the UI
    // to show a spinner to users during drilldown operations.
    it('should show loading state during execution', async () => {
      // Test: Start drilldown → loading=true, Complete → loading=false

      // SETUP
      let resolveExecute;
      const executePromise = new Promise((resolve) => {
        resolveExecute = resolve;
      });

      mockDataEngine.executeDrilldown.mockReturnValueOnce(executePromise);

      const { result } = renderHook(
        () => useDrilldown(mockDataEngine, null, {}, null, null),
        { wrapper }
      );

      // ACT - Start drilldown
      act(() => {
        result.current.executeDrilldown([
          { field: 'category', value: 'Furniture', dtype: Arrow.string }
        ]);
      });

      // ASSERT - Loading state active
      await waitFor(() => {
        expect(result.current.drilldownLoading).toBe(true);
      });

      // ACT - Complete drilldown
      await act(async () => {
        resolveExecute({
          data: [{ category: 'Furniture', sales: 100 }],
          sql: "SELECT * FROM test_table WHERE category = 'Furniture' LIMIT 10000",
          rowCount: 1
        });
        await executePromise;
      });

      // ASSERT - Loading complete
      expect(result.current.drilldownLoading).toBe(false);
    });

    // Ensures that when a filter combination returns no rows, the hook sets drilldownData
    // to an empty array (not null or undefined) so the UI can display "No results found" properly.
    it('should handle empty results gracefully', async () => {
      // Test: Query returns 0 rows → drilldownData=[] (not null)

      // SETUP
      mockDataEngine.executeDrilldown.mockResolvedValueOnce({
        data: [],
        sql: "SELECT * FROM test_table WHERE category = 'NonExistent' LIMIT 10000",
        rowCount: 0
      });

      const { result } = renderHook(
        () => useDrilldown(mockDataEngine, null, {}, null, null),
        { wrapper }
      );

      // ACT
      await act(async () => {
        await result.current.executeDrilldown([
          { field: 'category', value: 'NonExistent', dtype: Arrow.string }
        ]);
      });

      // ASSERT
      expect(toRows(result.current.drilldownData)).toEqual([]);
      expect(result.current.drilldownData.numRows).toBe(0);
      expect(result.current.drilldownSQL).toBeTruthy();
    });

    // Verifies that users can cancel long-running drilldown queries, which is important
    // for large datasets. The loading state should immediately switch to false when cancelled.
    it('should allow cancelling drilldown', async () => {
      // Test: Start drilldown → cancelDrilldown() → loading=false immediately

      // SETUP
      let cancelCalled = false;
      const executePromise = new Promise((resolve, reject) => {
        setTimeout(() => {
          if (!cancelCalled) {
            resolve({
              data: [{ category: 'Furniture' }],
              sql: 'SELECT * FROM test_table',
              rowCount: 1
            });
          }
        }, 1000);
      });

      mockDataEngine.executeDrilldown.mockReturnValueOnce(executePromise);

      const { result } = renderHook(
        () => useDrilldown(mockDataEngine, null, {}, null, null),
        { wrapper }
      );

      // ACT - Start drilldown
      act(() => {
        result.current.executeDrilldown([
          { field: 'category', value: 'Furniture', dtype: Arrow.string }
        ]);
      });

      await waitFor(() => {
        expect(result.current.drilldownLoading).toBe(true);
      });

      // ACT - Cancel drilldown
      act(() => {
        result.current.cancelDrilldown();
        cancelCalled = true;
      });

      // ASSERT
      expect(result.current.drilldownLoading).toBe(false);
    });

    // Ensures that the store's addToSqlHistory is called when drilldown completes
    it('should add SQL to history via store', async () => {
      // Test: executeDrilldown → store.addToSqlHistory called

      // SETUP
      const mockAddToSqlHistory = vi.fn();
      store.setState({ addToSqlHistory: mockAddToSqlHistory });

      mockDataEngine.executeDrilldown.mockResolvedValueOnce({
        data: [{ category: 'Furniture', sales: 100 }],
        sql: "SELECT * FROM test_table WHERE category = 'Furniture' LIMIT 10000",
        rowCount: 1,
        dtypes: { category: 'string', sales: 'numeric' }
      });

      const { result } = renderHook(
        () => useDrilldown(mockDataEngine, null, {}, null, null),
        { wrapper }
      );

      // ACT
      await act(async () => {
        await result.current.executeDrilldown([
          { field: 'category', value: 'Furniture', dtype: Arrow.string }
        ]);
      });

      // ASSERT
      expect(mockAddToSqlHistory).toHaveBeenCalledWith(
        "SELECT * FROM test_table WHERE category = 'Furniture' LIMIT 10000",
        'drilldown',
        expect.any(Array),
        { category: 'string', sales: 'numeric' },
        1
      );
    });
  });
});
