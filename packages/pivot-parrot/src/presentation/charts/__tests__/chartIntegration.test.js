/**
 * Integration tests for chart transformations
 * Tests the full pipeline: raw Arrow data → buildChartData → transform → Plotly traces
 */

import { describe, it, expect } from 'vitest';
import { buildChartData } from '../chartUtils';
import { transformBarLineChart } from '../BarLineChart';
import { transformScatterChart } from '../ScatterChart';
import { transformTreemapChart } from '../TreemapChart';
import { Arrow } from '../../../domain/types/ArrowTypes';

// Mock SQL dialect with Arrow types
const mockDialect = {
  types: {
    'date32': Arrow.date32,
    'timestamp': Arrow.timestamp,
    'decimal': Arrow.decimal,
    'int64': Arrow.int64,
    'utf8': Arrow.utf8,
    'double': Arrow.double
  },
  // Convert Uint32Array, BigInt, and strings to number
  toChartValue: (value) => {
    if (value instanceof Uint32Array) {
      // Simple conversion for test - just take first element
      return value[0];
    }
    if (typeof value === 'bigint') {
      return Number(value);
    }
    if (typeof value === 'string' && !isNaN(parseFloat(value))) {
      return parseFloat(value);
    }
    return value;
  }
};

describe('Chart Integration Tests', () => {
  describe('Bar/Line Chart - Full Pipeline', () => {
    it('should convert timestamp numbers to Date objects on x-axis', () => {
      // Raw data as it comes from Arrow/DuckDB
      const sqlRows = [
        {
          date: 1704067200000,  // Jan 1, 2024 as timestamp
          region: 'North',
          sum_sales: new Uint32Array([1500, 0, 0, 0]),
          _grouping_date: 0,
          _grouping_region: 0
        },
        {
          date: 1704153600000,  // Jan 2, 2024
          region: 'North',
          sum_sales: new Uint32Array([2000, 0, 0, 0]),
          _grouping_date: 0,
          _grouping_region: 0
        },
        {
          date: 1704240000000,  // Jan 3, 2024
          region: 'South',
          sum_sales: new Uint32Array([1800, 0, 0, 0]),
          _grouping_date: 0,
          _grouping_region: 0
        }
      ];

      const dtypes = {
        date: 'date32',
        region: 'utf8',
        sum_sales: 'decimal'
      };

      const config = {
        rows: ['date'],
        columns: ['region'],
        values: [{ field: 'sales', aggregation: 'sum', isCustom: false }]
      };

      const chartConfig = {
        chartType: 'bar-line',
        xAxis: 'date',
        groupBy: 'region',
        metrics: [{ field: 'sales', chartType: 'bar', axis: 'Ax1' }],
        barMode: 'group'
      };

      // Build and transform
      const chartData = buildChartData(sqlRows, chartConfig, config, dtypes, mockDialect);
      const { traces, layout } = transformBarLineChart(chartData, chartConfig);

      // Assertions
      expect(traces).toHaveLength(2); // Two regions: North, South

      // Check first trace (North)
      const northTrace = traces.find(t => t.name === 'North');
      expect(northTrace).toBeDefined();
      expect(northTrace.x).toHaveLength(2);
      expect(northTrace.y).toHaveLength(2);

      // X values should be Date objects
      expect(northTrace.x[0]).toBeInstanceOf(Date);
      expect(northTrace.x[0].toISOString()).toContain('2024-01-01');

      // Y values should be Numbers (not Uint32Array)
      expect(typeof northTrace.y[0]).toBe('number');
      expect(northTrace.y[0]).toBe(1500);
      expect(northTrace.y[1]).toBe(2000);

      // Layout should have date axis
      expect(layout.xaxis.type).toBe('date');
    });

    it('should convert multiple metrics with typed arrays to Numbers', () => {
      const sqlRows = [
        {
          category: 'Electronics',
          sum_sales: new Uint32Array([5000, 0, 0, 0]),
          count_orders: 42n,  // BigInt
          _grouping_category: 0
        },
        {
          category: 'Furniture',
          sum_sales: new Uint32Array([3000, 0, 0, 0]),
          count_orders: 28n,
          _grouping_category: 0
        }
      ];

      const dtypes = {
        category: 'utf8',
        sum_sales: 'decimal',
        count_orders: 'int64'
      };

      const config = {
        rows: ['category'],
        columns: [],
        values: [
          { field: 'sales', aggregation: 'sum', isCustom: false },
          { field: 'orders', aggregation: 'count', isCustom: false }
        ]
      };

      const chartConfig = {
        chartType: 'bar-line',
        xAxis: 'category',
        groupBy: '',
        metrics: [
          { field: 'sales', chartType: 'bar', axis: 'Ax1' },
          { field: 'orders', chartType: 'line', axis: 'Ax1' }
        ],
        barMode: 'group'
      };

      const chartData = buildChartData(sqlRows, chartConfig, config, dtypes, mockDialect);
      const { traces } = transformBarLineChart(chartData, chartConfig);

      expect(traces).toHaveLength(2); // Two metrics

      // Sales metric (bar)
      const salesTrace = traces[0];
      expect(salesTrace.type).toBe('bar');
      expect(salesTrace.y[0]).toBe(5000);
      expect(typeof salesTrace.y[0]).toBe('number');
      expect(salesTrace.y[1]).toBe(3000);

      // Orders metric (line) - BigInt converted to Number
      const ordersTrace = traces[1];
      expect(ordersTrace.type).toBe('scatter');
      expect(ordersTrace.y[0]).toBe(42);
      expect(typeof ordersTrace.y[0]).toBe('number');
      expect(ordersTrace.y[1]).toBe(28);
    });
  });

  describe('Scatter Chart - Full Pipeline', () => {
    it('should convert typed arrays to Numbers for x and y metrics', () => {
      const sqlRows = [
        {
          product: 'Laptop',
          sum_sales: new Uint32Array([5000, 0, 0, 0]),
          sum_profit: new Uint32Array([800, 0, 0, 0]),
          _grouping_product: 0
        },
        {
          product: 'Phone',
          sum_sales: new Uint32Array([3000, 0, 0, 0]),
          sum_profit: new Uint32Array([600, 0, 0, 0]),
          _grouping_product: 0
        },
        {
          product: 'Tablet',
          sum_sales: new Uint32Array([2000, 0, 0, 0]),
          sum_profit: new Uint32Array([400, 0, 0, 0]),
          _grouping_product: 0
        }
      ];

      const dtypes = {
        product: 'utf8',
        sum_sales: 'decimal',
        sum_profit: 'decimal'
      };

      const config = {
        rows: ['product'],
        columns: [],
        values: [
          { field: 'sales', aggregation: 'sum', isCustom: false },
          { field: 'profit', aggregation: 'sum', isCustom: false }
        ]
      };

      const chartConfig = {
        chartType: 'scatter',
        pointLevel: 'product',
        xMetric: 'sales',
        yMetric: 'profit',
        colorBy: ''
      };

      const chartData = buildChartData(sqlRows, chartConfig, config, dtypes, mockDialect);
      const { traces } = transformScatterChart(chartData, chartConfig);

      expect(traces).toHaveLength(1);

      const trace = traces[0];
      expect(trace.x).toHaveLength(3);
      expect(trace.y).toHaveLength(3);

      // X values should be Numbers (not Uint32Array)
      expect(typeof trace.x[0]).toBe('number');
      expect(trace.x[0]).toBe(5000);
      expect(trace.x[1]).toBe(3000);
      expect(trace.x[2]).toBe(2000);

      // Y values should be Numbers
      expect(typeof trace.y[0]).toBe('number');
      expect(trace.y[0]).toBe(800);
      expect(trace.y[1]).toBe(600);
      expect(trace.y[2]).toBe(400);

      // Point labels should be preserved
      expect(trace.text[0]).toBe('Laptop');
      expect(trace.text[1]).toBe('Phone');
      expect(trace.text[2]).toBe('Tablet');
    });

    it('should handle colorBy with regular categories', () => {
      const sqlRows = [
        {
          product: 'A',
          category: 'Electronics',
          sum_sales: new Uint32Array([100, 0, 0, 0]),
          sum_profit: new Uint32Array([20, 0, 0, 0]),
          _grouping_product: 0,
          _grouping_category: 0
        },
        {
          product: 'B',
          category: 'Electronics',
          sum_sales: new Uint32Array([150, 0, 0, 0]),
          sum_profit: new Uint32Array([30, 0, 0, 0]),
          _grouping_product: 0,
          _grouping_category: 0
        },
        {
          product: 'C',
          category: 'Furniture',
          sum_sales: new Uint32Array([200, 0, 0, 0]),
          sum_profit: new Uint32Array([40, 0, 0, 0]),
          _grouping_product: 0,
          _grouping_category: 0
        }
      ];

      const dtypes = {
        product: 'utf8',
        category: 'utf8',
        sum_sales: 'decimal',
        sum_profit: 'decimal'
      };

      const config = {
        rows: ['product', 'category'],
        columns: [],
        values: [
          { field: 'sales', aggregation: 'sum', isCustom: false },
          { field: 'profit', aggregation: 'sum', isCustom: false }
        ]
      };

      const chartConfig = {
        chartType: 'scatter',
        pointLevel: 'product',
        xMetric: 'sales',
        yMetric: 'profit',
        colorBy: 'category'
      };

      const chartData = buildChartData(sqlRows, chartConfig, config, dtypes, mockDialect);
      const { traces } = transformScatterChart(chartData, chartConfig);

      // Should have 2 traces (one per category)
      expect(traces).toHaveLength(2);

      // Group names should be categories
      const groupNames = traces.map(t => t.name);
      expect(groupNames).toContain('Electronics');
      expect(groupNames).toContain('Furniture');

      // Each trace should have converted numeric values
      traces.forEach(trace => {
        trace.x.forEach(val => {
          expect(typeof val).toBe('number');
        });
        trace.y.forEach(val => {
          expect(typeof val).toBe('number');
        });
      });
    });
  });

  describe('Treemap Chart - Full Pipeline', () => {
    it('should convert typed arrays in metric values', () => {
      const sqlRows = [
        {
          category: 'Electronics',
          subcategory: 'Phones',
          sum_sales: new Uint32Array([5000, 0, 0, 0]),
          _grouping_category: 0,
          _grouping_subcategory: 0
        },
        {
          category: 'Electronics',
          subcategory: 'Laptops',
          sum_sales: new Uint32Array([8000, 0, 0, 0]),
          _grouping_category: 0,
          _grouping_subcategory: 0
        },
        {
          category: 'Furniture',
          subcategory: 'Chairs',
          sum_sales: new Uint32Array([3000, 0, 0, 0]),
          _grouping_category: 0,
          _grouping_subcategory: 0
        }
      ];

      const dtypes = {
        category: 'utf8',
        subcategory: 'utf8',
        sum_sales: 'decimal'
      };

      const config = {
        rows: ['category', 'subcategory'],
        columns: [],
        values: [{ field: 'sales', aggregation: 'sum', isCustom: false }]
      };

      const chartConfig = {
        chartType: 'treemap',
        levels: ['category', 'subcategory'],
        metric: 'sales',
        colorMetric: '',
        colorScheme: 'Viridis'
      };

      const chartData = buildChartData(sqlRows, chartConfig, config, dtypes, mockDialect);
      const { traces } = transformTreemapChart(chartData, chartConfig);

      expect(traces).toHaveLength(1);

      const trace = traces[0];

      // Values should be Numbers (not Uint32Array)
      expect(trace.values).toBeDefined();
      trace.values.forEach(val => {
        if (val !== null && val !== undefined) {
          expect(typeof val).toBe('number');
        }
      });

      // Check specific leaf values are correct
      const phoneIndex = trace.labels.indexOf('Phones');
      expect(trace.values[phoneIndex]).toBe(5000);

      const laptopIndex = trace.labels.indexOf('Laptops');
      expect(trace.values[laptopIndex]).toBe(8000);
    });

    it('should handle dates in treemap levels', () => {
      const sqlRows = [
        {
          date: 1704067200000,  // Jan 1, 2024
          category: 'Electronics',
          sum_sales: new Uint32Array([2000, 0, 0, 0]),
          _grouping_date: 0,
          _grouping_category: 0
        },
        {
          date: 1704067200000,
          category: 'Furniture',
          sum_sales: new Uint32Array([1500, 0, 0, 0]),
          _grouping_date: 0,
          _grouping_category: 0
        },
        {
          date: 1704153600000,  // Jan 2, 2024
          category: 'Electronics',
          sum_sales: new Uint32Array([2500, 0, 0, 0]),
          _grouping_date: 0,
          _grouping_category: 0
        }
      ];

      const dtypes = {
        date: 'date32',
        category: 'utf8',
        sum_sales: 'decimal'
      };

      const config = {
        rows: ['date', 'category'],
        columns: [],
        values: [{ field: 'sales', aggregation: 'sum', isCustom: false }]
      };

      const chartConfig = {
        chartType: 'treemap',
        levels: ['date', 'category'],
        metric: 'sales',
        colorMetric: '',
        colorScheme: 'Viridis'
      };

      const chartData = buildChartData(sqlRows, chartConfig, config, dtypes, mockDialect);
      const { traces } = transformTreemapChart(chartData, chartConfig);

      expect(traces).toHaveLength(1);

      const trace = traces[0];

      // Date labels should be formatted (not timestamps)
      expect(trace.labels).toContain('2024-01-01');
      expect(trace.labels).toContain('2024-01-02');

      // Values should still be Numbers
      trace.values.forEach(val => {
        if (val !== null && val !== undefined) {
          expect(typeof val).toBe('number');
        }
      });
    });
  });
});
