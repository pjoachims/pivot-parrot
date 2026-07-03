/**
 * Integration tests for ScatterChart transformation
 */

import { describe, it, expect } from 'vitest';
import { transformScatterChart } from '../ScatterChart';
import { Arrow } from '../../../domain/types/ArrowTypes';

describe('ScatterChart', () => {
  describe('transformScatterChart', () => {
    it('should transform basic scatter chart without color grouping', () => {
      const chartData = {
        rows: [
          { product: 'Laptop', sum_sales: 5000, sum_profit: 800 },
          { product: 'Phone', sum_sales: 3000, sum_profit: 600 },
          { product: 'Tablet', sum_sales: 2000, sum_profit: 300 }
        ],
        dtypes: {
          product: Arrow.utf8,
          sum_sales: Arrow.double,
          sum_profit: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false },
            { field: 'profit', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'scatter',
        pointLevel: 'product',
        xMetric: 'sales',
        yMetric: 'profit',
        colorBy: ''
      };

      const result = transformScatterChart(chartData, chartConfig);

      expect(result.traces).toHaveLength(1);

      const trace = result.traces[0];
      expect(trace.type).toBe('scatter');
      expect(trace.mode).toBe('markers');
      expect(trace.x).toEqual([5000, 3000, 2000]);
      expect(trace.y).toEqual([800, 600, 300]);
      expect(trace.text).toEqual(['Laptop', 'Phone', 'Tablet']);
      expect(trace.marker.size).toBe(8);

      expect(result.layout.xaxis.title).toBe('sum of sales');
      expect(result.layout.yaxis.title).toBe('sum of profit');
      expect(result.layout.showlegend).toBe(false);
    });

    it('should transform scatter chart with color grouping', () => {
      const chartData = {
        rows: [
          { product: 'Laptop', category: 'Electronics', sum_sales: 5000, sum_profit: 800 },
          { product: 'Phone', category: 'Electronics', sum_sales: 3000, sum_profit: 600 },
          { product: 'Desk', category: 'Furniture', sum_sales: 2000, sum_profit: 300 },
          { product: 'Chair', category: 'Furniture', sum_sales: 1500, sum_profit: 250 }
        ],
        dtypes: {
          product: Arrow.utf8,
          category: Arrow.utf8,
          sum_sales: Arrow.double,
          sum_profit: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false },
            { field: 'profit', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'scatter',
        pointLevel: 'product',
        xMetric: 'sales',
        yMetric: 'profit',
        colorBy: 'category'
      };

      const result = transformScatterChart(chartData, chartConfig);

      // Should create 2 traces (one per category)
      expect(result.traces).toHaveLength(2);

      // Electronics trace
      const electronicsTrace = result.traces.find(t => t.name === 'Electronics');
      expect(electronicsTrace).toBeDefined();
      expect(electronicsTrace.x).toEqual([5000, 3000]);
      expect(electronicsTrace.y).toEqual([800, 600]);
      expect(electronicsTrace.text).toEqual(['Laptop', 'Phone']);

      // Furniture trace
      const furnitureTrace = result.traces.find(t => t.name === 'Furniture');
      expect(furnitureTrace).toBeDefined();
      expect(furnitureTrace.x).toEqual([2000, 1500]);
      expect(furnitureTrace.y).toEqual([300, 250]);
      expect(furnitureTrace.text).toEqual(['Desk', 'Chair']);

      expect(result.layout.showlegend).toBe(true);
      expect(result.layout.legend).toEqual({ x: 1.1, y: 1 });
    });

    it('should use different colors for different groups', () => {
      const chartData = {
        rows: [
          { product: 'A', region: 'East', sum_sales: 100, sum_profit: 10 },
          { product: 'B', region: 'West', sum_sales: 200, sum_profit: 20 },
          { product: 'C', region: 'East', sum_sales: 150, sum_profit: 15 }
        ],
        dtypes: {
          product: Arrow.utf8,
          region: Arrow.utf8,
          sum_sales: Arrow.double,
          sum_profit: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false },
            { field: 'profit', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'scatter',
        pointLevel: 'product',
        xMetric: 'sales',
        yMetric: 'profit',
        colorBy: 'region'
      };

      const result = transformScatterChart(chartData, chartConfig);

      expect(result.traces).toHaveLength(2);

      // Colors should be different for different groups
      const colors = result.traces.map(t => t.marker.color);
      expect(new Set(colors).size).toBe(2);
    });

    it('should handle same metric on both axes', () => {
      const chartData = {
        rows: [
          { product: 'Laptop', sum_sales: 5000, avg_sales: 500 },
          { product: 'Phone', sum_sales: 3000, avg_sales: 300 }
        ],
        dtypes: {
          product: Arrow.utf8,
          sum_sales: Arrow.double,
          avg_sales: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false },
            { field: 'sales', aggregation: 'avg', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'scatter',
        pointLevel: 'product',
        xMetric: 'sales',
        yMetric: 'sales',
        colorBy: ''
      };

      const result = transformScatterChart(chartData, chartConfig);

      expect(result.traces).toHaveLength(1);
      expect(result.layout.xaxis.title).toBe('sum of sales');
      expect(result.layout.yaxis.title).toBe('sum of sales');
    });

    it('should handle BigInt values without errors', () => {
      const chartData = {
        rows: [
          { category: 'A', count_orders: 1000n, count_items: 5000n },
          { category: 'B', count_orders: 2000n, count_items: 8000n },
          { category: 'C', count_orders: 1500n, count_items: 6000n }
        ],
        dtypes: {
          category: Arrow.utf8,
          count_orders: Arrow.int64,
          count_items: Arrow.int64
        },
        config: {
          values: [
            { field: 'orders', aggregation: 'count', isCustom: false },
            { field: 'items', aggregation: 'count', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'scatter',
        pointLevel: 'category',
        xMetric: 'orders',
        yMetric: 'items',
        colorBy: ''
      };

      // Should not throw error
      const result = transformScatterChart(chartData, chartConfig);

      expect(result.traces).toHaveLength(1);
      expect(result.traces[0].x).toEqual([1000n, 2000n, 1500n]);
      expect(result.traces[0].y).toEqual([5000n, 8000n, 6000n]);
    });

    it('should set hovermode to closest', () => {
      const chartData = {
        rows: [
          { product: 'A', sum_sales: 100, sum_profit: 10 }
        ],
        dtypes: {
          product: Arrow.utf8,
          sum_sales: Arrow.double,
          sum_profit: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false },
            { field: 'profit', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'scatter',
        pointLevel: 'product',
        xMetric: 'sales',
        yMetric: 'profit',
        colorBy: ''
      };

      const result = transformScatterChart(chartData, chartConfig);

      expect(result.layout.hovermode).toBe('closest');
    });

    it('should handle empty color grouping groups', () => {
      const chartData = {
        rows: [
          { product: 'Laptop', region: 'East', sum_sales: 5000, sum_profit: 800 }
        ],
        dtypes: {
          product: Arrow.utf8,
          region: Arrow.utf8,
          sum_sales: Arrow.double,
          sum_profit: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false },
            { field: 'profit', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'scatter',
        pointLevel: 'product',
        xMetric: 'sales',
        yMetric: 'profit',
        colorBy: 'region'
      };

      const result = transformScatterChart(chartData, chartConfig);

      // Should have one group with one point
      expect(result.traces).toHaveLength(1);
      expect(result.traces[0].name).toBe('East');
      expect(result.traces[0].x).toHaveLength(1);
    });

    it('should include point labels in text field', () => {
      const chartData = {
        rows: [
          { product: 'Laptop', sum_sales: 5000, sum_profit: 800 },
          { product: 'Phone', sum_sales: 3000, sum_profit: 600 }
        ],
        dtypes: {
          product: Arrow.utf8,
          sum_sales: Arrow.double,
          sum_profit: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false },
            { field: 'profit', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'scatter',
        pointLevel: 'product',
        xMetric: 'sales',
        yMetric: 'profit',
        colorBy: ''
      };

      const result = transformScatterChart(chartData, chartConfig);

      expect(result.traces[0].text).toEqual(['Laptop', 'Phone']);
    });

    it('should use metric labels with formatting info in axis titles', () => {
      const chartData = {
        rows: [
          { product: 'Laptop', sum_revenue: 5000.50, avg_margin: 0.20 },
          { product: 'Phone', sum_revenue: 3000.75, avg_margin: 0.25 }
        ],
        dtypes: {
          product: Arrow.utf8,
          sum_revenue: Arrow.double,
          avg_margin: Arrow.double
        },
        config: {
          values: [
            {
              field: 'revenue',
              aggregation: 'sum',
              isCustom: false,
              format: { type: 'currency', decimals: 2, useThousandSeparator: true }
            },
            {
              field: 'margin',
              aggregation: 'avg',
              isCustom: false,
              format: { type: 'percentage', decimals: 1, useThousandSeparator: false }
            }
          ]
        }
      };

      const chartConfig = {
        chartType: 'scatter',
        pointLevel: 'product',
        xMetric: 'revenue',
        yMetric: 'margin',
        colorBy: ''
      };

      const result = transformScatterChart(chartData, chartConfig);

      // Axis titles should use metric labels
      expect(result.layout.xaxis.title).toBe('sum of revenue');
      expect(result.layout.yaxis.title).toBe('avg of margin');

      // Values should be present in traces
      expect(result.traces[0].x).toEqual([5000.50, 3000.75]);
      expect(result.traces[0].y).toEqual([0.20, 0.25]);
    });

    it('should handle boolean dimension for color grouping', () => {
      const chartData = {
        rows: [
          { product: 'Laptop', is_premium: true, sum_sales: 5000, sum_profit: 800 },
          { product: 'Phone', is_premium: true, sum_sales: 3000, sum_profit: 600 },
          { product: 'Mouse', is_premium: false, sum_sales: 100, sum_profit: 15 },
          { product: 'Keyboard', is_premium: false, sum_sales: 150, sum_profit: 20 }
        ],
        dtypes: {
          product: Arrow.utf8,
          is_premium: Arrow.bool,
          sum_sales: Arrow.double,
          sum_profit: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false },
            { field: 'profit', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'scatter',
        pointLevel: 'product',
        xMetric: 'sales',
        yMetric: 'profit',
        colorBy: 'is_premium'
      };

      const result = transformScatterChart(chartData, chartConfig);

      // Should create 2 traces (one for each boolean value)
      expect(result.traces).toHaveLength(2);

      // Each trace should have 2 points
      expect(result.traces[0].x).toHaveLength(2);
      expect(result.traces[1].x).toHaveLength(2);

      // Verify both groups are represented (cast to string for comparison)
      const traceNames = result.traces.map(t => String(t.name));
      expect(traceNames).toContain('true');
      expect(traceNames).toContain('false');
    });

    it('should handle BigInt dimensions for point level', () => {
      const chartData = {
        rows: [
          { order_id: 1001n, sum_amount: 250, count_items: 5 },
          { order_id: 1002n, sum_amount: 500, count_items: 10 },
          { order_id: 1003n, sum_amount: 150, count_items: 3 }
        ],
        dtypes: {
          order_id: Arrow.int64,
          sum_amount: Arrow.double,
          count_items: Arrow.int64
        },
        config: {
          values: [
            { field: 'amount', aggregation: 'sum', isCustom: false },
            { field: 'items', aggregation: 'count', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'scatter',
        pointLevel: 'order_id',
        xMetric: 'amount',
        yMetric: 'items',
        colorBy: ''
      };

      const result = transformScatterChart(chartData, chartConfig);

      expect(result.traces).toHaveLength(1);
      // Point labels should include BigInt values
      expect(result.traces[0].text).toEqual([1001n, 1002n, 1003n]);
      expect(result.traces[0].x).toEqual([250, 500, 150]);
      // Y values might be converted from BigInt to Number during processing
      expect(result.traces[0].y).toEqual([5, 10, 3]);
    });

    it('should handle Date dimensions for color grouping', () => {
      const chartData = {
        rows: [
          { product: 'A', order_date: new Date('2024-01-01'), sum_sales: 100, sum_profit: 20 },
          { product: 'B', order_date: new Date('2024-01-01'), sum_sales: 150, sum_profit: 30 },
          { product: 'C', order_date: new Date('2024-01-02'), sum_sales: 200, sum_profit: 40 },
          { product: 'D', order_date: new Date('2024-01-02'), sum_sales: 120, sum_profit: 25 }
        ],
        dtypes: {
          product: Arrow.utf8,
          order_date: Arrow.date32,
          sum_sales: Arrow.double,
          sum_profit: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false },
            { field: 'profit', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'scatter',
        pointLevel: 'product',
        xMetric: 'sales',
        yMetric: 'profit',
        colorBy: 'order_date'
      };

      const result = transformScatterChart(chartData, chartConfig);

      // Should create 2 traces (one per date)
      expect(result.traces).toHaveLength(2);

      // Dates should be formatted as strings in trace names
      expect(result.traces[0].name).toMatch(/2024-01-0[12]/);
      expect(result.traces[1].name).toMatch(/2024-01-0[12]/);
    });

    it('should handle custom metrics', () => {
      const chartData = {
        rows: [
          { product: 'Laptop', profit_margin: 0.2, revenue_per_unit: 1000 },
          { product: 'Phone', profit_margin: 0.25, revenue_per_unit: 800 }
        ],
        dtypes: {
          product: Arrow.utf8,
          profit_margin: Arrow.double,
          revenue_per_unit: Arrow.double
        },
        config: {
          values: [
            { field: 'profit_margin', name: 'Profit Margin', isCustom: true },
            { field: 'revenue_per_unit', name: 'Revenue per Unit', isCustom: true }
          ],
          customMetrics: [
            { id: 'profit_margin', name: 'Profit Margin', expr: 'profit / sales' },
            { id: 'revenue_per_unit', name: 'Revenue per Unit', expr: 'revenue / quantity' }
          ]
        }
      };

      const chartConfig = {
        chartType: 'scatter',
        pointLevel: 'product',
        xMetric: 'profit_margin',
        yMetric: 'revenue_per_unit',
        colorBy: ''
      };

      const result = transformScatterChart(chartData, chartConfig);

      expect(result.traces).toHaveLength(1);
      expect(result.traces[0].x).toEqual([0.2, 0.25]);
      expect(result.traces[0].y).toEqual([1000, 800]);
      expect(result.layout.xaxis.title).toBe('Profit Margin');
      expect(result.layout.yaxis.title).toBe('Revenue per Unit');
    });
  });
});
