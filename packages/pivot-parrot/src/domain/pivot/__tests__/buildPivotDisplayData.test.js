import { describe, it, expect } from 'vitest';
import { buildPivotDisplayData } from '../index';

/**
 * These tests verify the core pivot transformation:
 * SQL CUBE results + config → pivot display structure
 *
 * Focus: data integrity, not exact internal structure
 */

describe('buildPivotDisplayData', () => {
  describe('basic transformations', () => {
    it('should handle empty data', () => {
      const result = buildPivotDisplayData([], [], [], []);

      expect(result.columnConfig.colFields).toEqual([]);
      expect(result.columnConfig.hierarchy).toEqual([]);
      expect(result.rowGroups).toEqual([]);
      expect(result.grandTotal).toBeNull();
    });

    it('should transform 1D pivot with rows', () => {
      const sqlRows = [
        { region: 'North', sum_sales: 1000, _grouping_region: 0 },
        { region: 'South', sum_sales: 2000, _grouping_region: 0 },
        { region: null, sum_sales: 3000, _grouping_region: 1 }
      ];

      const result = buildPivotDisplayData(
        sqlRows,
        ['region'],
        [],
        [{ field: 'sales', aggregation: 'sum' }]
      );

      expect(result.rowGroups).toHaveLength(2);
      expect(result.rowGroups[0].groupLabel).toBe('North');
      expect(result.rowGroups[1].groupLabel).toBe('South');
      expect(result.rowGroups[0].values[0]).toBe(1000);
      expect(result.rowGroups[1].values[0]).toBe(2000);
      expect(result.grandTotal[0]).toBe(3000);
    });

    it('should transform 1D pivot with columns', () => {
      const sqlRows = [
        { year: 2022, count_orders: 100, _grouping_year: 0 },
        { year: 2023, count_orders: 150, _grouping_year: 0 },
        { year: null, count_orders: 250, _grouping_year: 1 }
      ];

      const result = buildPivotDisplayData(
        sqlRows,
        [],
        ['year'],
        [{ field: 'orders', aggregation: 'count' }]
      );

      expect(result.columnConfig.colFields).toEqual(['year']);
      expect(result.grandTotal).toBeDefined();

      // Verify years are in hierarchy
      const years = result.columnConfig.hierarchy.filter(h => h.value === 2022 || h.value === 2023);
      expect(years).toHaveLength(2);
    });

    it('should transform 2D pivot (rows × columns)', () => {
      const sqlRows = [
        { region: 'North', year: 2022, sum_sales: 500, _grouping_region: 0, _grouping_year: 0 },
        { region: 'North', year: 2023, sum_sales: 600, _grouping_region: 0, _grouping_year: 0 },
        { region: 'South', year: 2022, sum_sales: 700, _grouping_region: 0, _grouping_year: 0 },
        { region: 'South', year: 2023, sum_sales: 800, _grouping_region: 0, _grouping_year: 0 },
        { region: 'North', year: null, sum_sales: 1100, _grouping_region: 0, _grouping_year: 1 },
        { region: 'South', year: null, sum_sales: 1500, _grouping_region: 0, _grouping_year: 1 },
        { region: null, year: 2022, sum_sales: 1200, _grouping_region: 1, _grouping_year: 0 },
        { region: null, year: 2023, sum_sales: 1400, _grouping_region: 1, _grouping_year: 0 },
        { region: null, year: null, sum_sales: 2600, _grouping_region: 1, _grouping_year: 1 }
      ];

      const result = buildPivotDisplayData(
        sqlRows,
        ['region'],
        ['year'],
        [{ field: 'sales', aggregation: 'sum' }]
      );

      // Check rows
      expect(result.rowGroups).toHaveLength(2);
      expect(result.rowGroups[0].groupLabel).toBe('North');
      expect(result.rowGroups[1].groupLabel).toBe('South');

      // Check columns
      expect(result.columnConfig.colFields).toEqual(['year']);

      // Check values exist
      expect(result.rowGroups[0].values).toBeDefined();
      expect(result.rowGroups[1].values).toBeDefined();
      expect(result.grandTotal).toBeDefined();
    });
  });

  describe('hierarchical data', () => {
    it('should handle hierarchical rows', () => {
      const sqlRows = [
        { region: 'North', category: 'Electronics', sum_sales: 500, _grouping_region: 0, _grouping_category: 0 },
        { region: 'North', category: 'Furniture', sum_sales: 300, _grouping_region: 0, _grouping_category: 0 },
        { region: 'North', category: null, sum_sales: 800, _grouping_region: 0, _grouping_category: 1 },
        { region: 'South', category: 'Electronics', sum_sales: 600, _grouping_region: 0, _grouping_category: 0 },
        { region: 'South', category: 'Furniture', sum_sales: 400, _grouping_region: 0, _grouping_category: 0 },
        { region: 'South', category: null, sum_sales: 1000, _grouping_region: 0, _grouping_category: 1 },
        { region: null, category: null, sum_sales: 1800, _grouping_region: 1, _grouping_category: 1 }
      ];

      const result = buildPivotDisplayData(
        sqlRows,
        ['region', 'category'],
        [],
        [{ field: 'sales', aggregation: 'sum' }]
      );

      // Parent level
      expect(result.rowGroups).toHaveLength(2);
      expect(result.rowGroups[0].groupLabel).toBe('North');
      expect(result.rowGroups[1].groupLabel).toBe('South');

      // Child level
      expect(result.rowGroups[0].children).toHaveLength(2);
      expect(result.rowGroups[1].children).toHaveLength(2);
      expect(result.rowGroups[0].children[0].groupLabel).toBe('Electronics');
      expect(result.rowGroups[0].children[1].groupLabel).toBe('Furniture');
    });

    it('should handle hierarchical columns', () => {
      const sqlRows = [
        { product: 'A', year: 2023, quarter: 'Q1', sum_sales: 100, _grouping_product: 0, _grouping_year: 0, _grouping_quarter: 0 },
        { product: 'A', year: 2023, quarter: 'Q2', sum_sales: 120, _grouping_product: 0, _grouping_year: 0, _grouping_quarter: 0 },
        { product: 'A', year: 2023, quarter: null, sum_sales: 220, _grouping_product: 0, _grouping_year: 0, _grouping_quarter: 1 },
        { product: 'A', year: null, quarter: null, sum_sales: 220, _grouping_product: 0, _grouping_year: 1, _grouping_quarter: 1 },
        { product: null, year: 2023, quarter: 'Q1', sum_sales: 100, _grouping_product: 1, _grouping_year: 0, _grouping_quarter: 0 },
        { product: null, year: 2023, quarter: 'Q2', sum_sales: 120, _grouping_product: 1, _grouping_year: 0, _grouping_quarter: 0 },
        { product: null, year: null, quarter: null, sum_sales: 220, _grouping_product: 1, _grouping_year: 1, _grouping_quarter: 1 }
      ];

      const result = buildPivotDisplayData(
        sqlRows,
        ['product'],
        ['year', 'quarter'],
        [{ field: 'sales', aggregation: 'sum' }]
      );

      expect(result.columnConfig.colFields).toEqual(['year', 'quarter']);

      // Find year node
      const year2023 = result.columnConfig.hierarchy.find(h => h.value === 2023);
      expect(year2023).toBeDefined();
      expect(year2023.children.length).toBeGreaterThan(0);
    });
  });

  describe('data integrity', () => {
    it('should preserve numeric precision', () => {
      const sqlRows = [
        { region: 'North', sum_sales: 1234.567890123, _grouping_region: 0 },
        { region: null, sum_sales: 1234.567890123, _grouping_region: 1 }
      ];

      const result = buildPivotDisplayData(
        sqlRows,
        ['region'],
        [],
        [{ field: 'sales', aggregation: 'sum' }]
      );

      expect(result.rowGroups[0].values[0]).toBe(1234.567890123);
    });

    it('should handle zero values', () => {
      const sqlRows = [
        { region: 'North', sum_sales: 0, _grouping_region: 0 },
        { region: 'South', sum_sales: 100, _grouping_region: 0 },
        { region: null, sum_sales: 100, _grouping_region: 1 }
      ];

      const result = buildPivotDisplayData(
        sqlRows,
        ['region'],
        [],
        [{ field: 'sales', aggregation: 'sum' }]
      );

      expect(result.rowGroups[0].values[0]).toBe(0);
      expect(result.rowGroups[1].values[0]).toBe(100);
    });

    it('should handle negative values', () => {
      const sqlRows = [
        { region: 'North', sum_profit: -500, _grouping_region: 0 },
        { region: 'South', sum_profit: 1000, _grouping_region: 0 },
        { region: null, sum_profit: 500, _grouping_region: 1 }
      ];

      const result = buildPivotDisplayData(
        sqlRows,
        ['region'],
        [],
        [{ field: 'profit', aggregation: 'sum' }]
      );

      expect(result.rowGroups[0].values[0]).toBe(-500);
      expect(result.rowGroups[1].values[0]).toBe(1000);
    });

    it('should correctly map row × column positions', () => {
      const sqlRows = [
        { region: 'A', year: 2022, sum_sales: 10, _grouping_region: 0, _grouping_year: 0 },
        { region: 'A', year: 2023, sum_sales: 20, _grouping_region: 0, _grouping_year: 0 },
        { region: 'B', year: 2022, sum_sales: 30, _grouping_region: 0, _grouping_year: 0 },
        { region: 'B', year: 2023, sum_sales: 40, _grouping_region: 0, _grouping_year: 0 },
        { region: 'A', year: null, sum_sales: 30, _grouping_region: 0, _grouping_year: 1 },
        { region: 'B', year: null, sum_sales: 70, _grouping_region: 0, _grouping_year: 1 },
        { region: null, year: 2022, sum_sales: 40, _grouping_region: 1, _grouping_year: 0 },
        { region: null, year: 2023, sum_sales: 60, _grouping_region: 1, _grouping_year: 0 },
        { region: null, year: null, sum_sales: 100, _grouping_region: 1, _grouping_year: 1 }
      ];

      const result = buildPivotDisplayData(
        sqlRows,
        ['region'],
        ['year'],
        [{ field: 'sales', aggregation: 'sum' }]
      );

      expect(result.rowGroups).toHaveLength(2);

      // Region A should have values 10 and 20
      expect(result.rowGroups[0].groupLabel).toBe('A');
      expect(result.rowGroups[0].values).toContain(10);
      expect(result.rowGroups[0].values).toContain(20);

      // Region B should have values 30 and 40
      expect(result.rowGroups[1].groupLabel).toBe('B');
      expect(result.rowGroups[1].values).toContain(30);
      expect(result.rowGroups[1].values).toContain(40);

      // Grand total
      expect(result.grandTotal).toContain(40);
      expect(result.grandTotal).toContain(60);
    });
  });

  describe('edge cases', () => {
    it('should handle null/undefined values', () => {
      const sqlRows = [
        { region: null, sum_sales: 0, _grouping_region: 0 }
      ];

      const result = buildPivotDisplayData(
        sqlRows,
        ['region'],
        [],
        [{ field: 'sales', aggregation: 'sum' }]
      );

      // Should not crash
      expect(result.rowGroups).toBeDefined();
    });

    it('should handle single data row', () => {
      const sqlRows = [
        { region: 'North', sum_sales: 1000, _grouping_region: 0 }
      ];

      const result = buildPivotDisplayData(
        sqlRows,
        ['region'],
        [],
        [{ field: 'sales', aggregation: 'sum' }]
      );

      expect(result.rowGroups).toHaveLength(1);
      expect(result.rowGroups[0].groupLabel).toBe('North');
    });

    it('should handle only grand total', () => {
      const sqlRows = [
        { region: null, sum_sales: 3000, _grouping_region: 1 }
      ];

      const result = buildPivotDisplayData(
        sqlRows,
        ['region'],
        [],
        [{ field: 'sales', aggregation: 'sum' }]
      );

      expect(result.rowGroups).toHaveLength(0);
      expect(result.grandTotal).toBeDefined();
      expect(result.grandTotal[0]).toBe(3000);
    });
  });

  describe('multiple value fields', () => {
    it('should handle values in rows', () => {
      const sqlRows = [
        { region: 'North', sum_sales: 1000, count_orders: 50, _grouping_region: 0 },
        { region: 'South', sum_sales: 2000, count_orders: 75, _grouping_region: 0 },
        { region: null, sum_sales: 3000, count_orders: 125, _grouping_region: 1 }
      ];

      const result = buildPivotDisplayData(
        sqlRows,
        ['region', 'Σ Values'],
        [],
        [
          { field: 'sales', aggregation: 'sum' },
          { field: 'orders', aggregation: 'count' }
        ]
      );

      expect(result.rowGroups).toHaveLength(2);

      // Each region should have metric children
      expect(result.rowGroups[0].children).toHaveLength(2);
      expect(result.rowGroups[1].children).toHaveLength(2);
    });
  });
});
