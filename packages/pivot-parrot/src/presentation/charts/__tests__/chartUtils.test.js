/**
 * Unit tests for chart utilities
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeField,
  toChartValue,
  getChartDimensions,
  selectChartData,
  groupData,
  sanitizeFieldName,
  getMetricLabel,
  detectAxisType,
  formatValueForDisplay
} from '../chartUtils';
import { Arrow } from '../../../domain/types/ArrowTypes';

describe('chartUtils', () => {
  describe('normalizeField', () => {
    it('should return empty string for null/undefined', () => {
      expect(normalizeField(null)).toBe('');
      expect(normalizeField(undefined)).toBe('');
      expect(normalizeField('')).toBe('');
    });

    it('should return string as-is', () => {
      expect(normalizeField('category')).toBe('category');
    });

    it('should extract id from object', () => {
      expect(normalizeField({ id: 'category', name: 'Category' })).toBe('category');
      expect(normalizeField({ _id: 'region' })).toBe('region');
    });
  });

  describe('toChartValue', () => {
    const mockDialect = {
      types: {
        'date32': Arrow.date32,
        'double': Arrow.double,
        'utf8': Arrow.utf8
      }
    };

    const dtypes = {
      date: 'date32',
      sales: 'double',
      category: 'utf8'
    };

    it('should convert date strings to Date objects', () => {
      const result = toChartValue('2024-01-01', 'date', mockDialect, dtypes);
      expect(result instanceof Date).toBe(true);
    });

    it('should convert numeric values', () => {
      // toChartValue delegates to dialect.toChartValue for numeric types
      const dialectWithConvert = {
        ...mockDialect,
        toChartValue: (val) => typeof val === 'string' ? parseFloat(val) : val
      };
      const result = toChartValue('123.45', 'sales', dialectWithConvert, dtypes);
      expect(result).toBe(123.45);
    });

    it('should return value as-is for varchar', () => {
      const result = toChartValue('Furniture', 'category', mockDialect, dtypes);
      expect(result).toBe('Furniture');
    });

    it('should return value unchanged if no dialect', () => {
      const result = toChartValue('test', 'column', null, dtypes);
      expect(result).toBe('test');
    });

    it('should return value unchanged if no dtypes', () => {
      const result = toChartValue('test', 'column', mockDialect, null);
      expect(result).toBe('test');
    });

    it('should return value unchanged if dtype not found', () => {
      const result = toChartValue('test', 'unknown_column', mockDialect, dtypes);
      expect(result).toBe('test');
    });
  });

  describe('getChartDimensions', () => {
    it('should return empty array for unknown chart type', () => {
      expect(getChartDimensions({ chartType: 'unknown' })).toEqual([]);
    });

    it('should extract dimensions for bar chart', () => {
      const config = {
        chartType: 'bar',
        xAxis: 'category',
        groupBy: ''
      };
      expect(getChartDimensions(config)).toEqual(['category']);
    });

    it('should extract dimensions for bar-line chart', () => {
      const config = {
        chartType: 'bar-line',
        xAxis: 'date',
        groupBy: ''
      };
      expect(getChartDimensions(config)).toEqual(['date']);
    });

    it('should include groupBy dimension for bar charts', () => {
      const config = {
        chartType: 'bar',
        xAxis: 'category',
        groupBy: 'region'
      };
      expect(getChartDimensions(config)).toEqual(['category', 'region']);
    });

    it('should extract dimensions for scatter chart', () => {
      const config = {
        chartType: 'scatter',
        pointLevel: 'product',
        xMetric: 'sales',  // Metrics, not dimensions
        yMetric: 'profit',
        colorBy: 'region'
      };
      expect(getChartDimensions(config)).toEqual(['product', 'region']);
    });

    it('should extract dimensions for treemap chart', () => {
      const config = {
        chartType: 'treemap',
        levels: ['category', 'subcategory', 'product']
      };
      expect(getChartDimensions(config)).toEqual(['category', 'subcategory', 'product']);
    });
  });

  describe('selectChartData', () => {
    const cubeResults = [
      // Detail row: both ungrouped
      { category: 'Furniture', region: 'East', sum_sales: 1000, _grouping_category: 0, _grouping_region: 0 },
      { category: 'Furniture', region: 'West', sum_sales: 1500, _grouping_category: 0, _grouping_region: 0 },
      // Subtotal: category ungrouped, region grouped
      { category: 'Furniture', region: null, sum_sales: 2500, _grouping_category: 0, _grouping_region: 1 },
      // Subtotal: category grouped, region ungrouped
      { category: null, region: 'East', sum_sales: 3000, _grouping_category: 1, _grouping_region: 0 },
      // Grand total: both grouped
      { category: null, region: null, sum_sales: 7000, _grouping_category: 1, _grouping_region: 1 }
    ];

    const config = {
      rows: ['category'],
      columns: ['region'],
      values: [{ field: 'sales', aggregation: 'sum' }]
    };

    it('should select detail rows when all dimensions needed', () => {
      const chartDims = ['category', 'region'];
      const allDims = ['category', 'region'];

      const result = selectChartData(cubeResults, chartDims, allDims, config);

      expect(result).toHaveLength(2);
      expect(result[0].category).toBe('Furniture');
      expect(result[0].region).toBe('East');
    });

    it('should select category subtotals when only category needed', () => {
      const chartDims = ['category'];
      const allDims = ['category', 'region'];

      const result = selectChartData(cubeResults, chartDims, allDims, config);

      expect(result).toHaveLength(1);
      expect(result[0].category).toBe('Furniture');
      expect(result[0].region).toBe(null);
      expect(result[0]._grouping_region).toBe(1);
    });

    it('should select region subtotals when only region needed', () => {
      const chartDims = ['region'];
      const allDims = ['category', 'region'];

      const result = selectChartData(cubeResults, chartDims, allDims, config);

      expect(result).toHaveLength(1);
      expect(result[0].region).toBe('East');
      expect(result[0].category).toBe(null);
      expect(result[0]._grouping_category).toBe(1);
    });

    it('should throw error if no data available', () => {
      expect(() => {
        selectChartData([], ['category'], ['category'], config);
      }).toThrow('No data available');
    });

    it('should throw error if dimension not found', () => {
      expect(() => {
        selectChartData(cubeResults, ['nonexistent'], ['category'], config);
      }).toThrow('Dimension not found');
    });
  });

  describe('groupData', () => {
    const data = [
      { category: 'Furniture', sales: 1000 },
      { category: 'Technology', sales: 2000 },
      { category: 'Furniture', sales: 1500 }
    ];

    it('should group data by field', () => {
      const grouped = groupData(data, 'category');

      expect(Object.keys(grouped)).toEqual(['Furniture', 'Technology']);
      expect(grouped.Furniture).toHaveLength(2);
      expect(grouped.Technology).toHaveLength(1);
    });

    it('should handle null values', () => {
      const dataWithNull = [
        { category: 'Furniture', sales: 1000 },
        { category: null, sales: 2000 }
      ];

      const grouped = groupData(dataWithNull, 'category');

      expect(grouped.Furniture).toHaveLength(1);
      expect(grouped.Unknown).toHaveLength(1);
    });

    it('should format Date objects as group keys', () => {
      const dataWithDates = [
        { date: new Date('2024-01-01'), sales: 1000 },
        { date: new Date('2024-01-01'), sales: 1500 },
        { date: new Date('2024-01-02'), sales: 2000 }
      ];

      const grouped = groupData(dataWithDates, 'date', Arrow.DATE);

      expect(Object.keys(grouped)).toEqual(['2024-01-01', '2024-01-02']);
      expect(grouped['2024-01-01']).toHaveLength(2);
    });
  });

  describe('sanitizeFieldName', () => {
    const config = {
      values: [
        { field: 'sales', aggregation: 'sum', isCustom: false },
        { field: 'custom_metric', aggregation: null, isCustom: true }
      ]
    };

    it('should build column name for aggregated field', () => {
      expect(sanitizeFieldName('sales', config)).toBe('sum_sales');
    });

    it('should return field as-is for custom metric', () => {
      expect(sanitizeFieldName('custom_metric', config)).toBe('custom_metric');
    });

    it('should throw error if metric not found', () => {
      expect(() => {
        sanitizeFieldName('nonexistent', config);
      }).toThrow('Metric not found');
    });

    it('should use id property from FieldItem-like object', () => {
      const fieldItem = {
        id: 'custom_column_name'
      };
      expect(sanitizeFieldName(fieldItem)).toBe('custom_column_name');
    });

    it('should use id property if FieldItem-like object', () => {
      const fieldLike = { id: 'sum_revenue' };
      expect(sanitizeFieldName(fieldLike)).toBe('sum_revenue');
    });
  });

  describe('getMetricLabel', () => {
    const config = {
      values: [
        { field: 'sales', aggregation: 'sum', isCustom: false },
        { field: 'custom_metric', name: 'My Custom Metric', isCustom: true }
      ]
    };

    it('should build label for aggregated field', () => {
      expect(getMetricLabel('sales', config)).toBe('sum of sales');
    });

    it('should return name for custom metric', () => {
      expect(getMetricLabel('custom_metric', config)).toBe('My Custom Metric');
    });
  });

  describe('detectAxisType', () => {
    it('should detect category type for strings', () => {
      const data = [{ category: 'Furniture' }];
      expect(detectAxisType(data, 'category')).toBe('category');
    });

    it('should detect linear type for numbers', () => {
      const data = [{ value: 100 }];
      expect(detectAxisType(data, 'value')).toBe('linear');
    });

    it('should detect date type for Date objects', () => {
      const data = [{ date: new Date('2024-01-01') }];
      expect(detectAxisType(data, 'date')).toBe('date');
    });

    it('should return category for empty data', () => {
      expect(detectAxisType([], 'field')).toBe('category');
      expect(detectAxisType([{}], 'field')).toBe('category');
    });
  });

  describe('formatValueForDisplay', () => {
    it('should format DATE as YYYY-MM-DD', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      expect(formatValueForDisplay(date, 'date32')).toBe('2024-01-15');
    });

    it('should format TIMESTAMP as YYYY-MM-DD HH:MM:SS', () => {
      const date = new Date('2024-01-15T10:30:45Z');
      const result = formatValueForDisplay(date, 'timestamp');
      expect(result).toMatch(/2024-01-15 \d{2}:\d{2}:\d{2}/);
    });

    it('should convert non-Date values to string', () => {
      expect(formatValueForDisplay('text')).toBe('text');
      expect(formatValueForDisplay(123)).toBe('123');
      expect(formatValueForDisplay(null)).toBe('null');
    });
  });
});
