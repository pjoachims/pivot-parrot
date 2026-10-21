/**
 * Integration tests for BarLineChart transformation
 */

import { describe, it, expect } from 'vitest';
import { transformBarLineChart } from '../BarLineChart';
import { Arrow } from '../../../domain/types/ArrowTypes';

describe('BarLineChart', () => {
  describe('transformBarLineChart', () => {
    it('should transform simple bar chart with single dimension', () => {
      const chartData = {
        rows: [
          { category: 'Furniture', sum_sales: 2500 },
          { category: 'Technology', sum_sales: 4500 }
        ],
        dtypes: {
          category: Arrow.utf8,
          sum_sales: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'bar-line',
        xAxis: 'category',
        groupBy: '',
        metrics: [
          { field: 'sales', chartType: 'bar', axis: 'Ax1', opacity: 0.8 }
        ]
      };

      const result = transformBarLineChart(chartData, chartConfig);

      expect(result.traces).toHaveLength(1);
      expect(result.traces[0]).toMatchObject({
        name: 'sum of sales',
        type: 'bar',
        x: ['Furniture', 'Technology'],
        y: [2500, 4500],
        yaxis: 'y'
      });

      expect(result.layout.xaxis.title).toBe('category');
      expect(result.layout.yaxis.title).toBe('sum of sales');
    });

    it('should transform bar chart with groupBy', () => {
      const chartData = {
        rows: [
          { category: 'Furniture', region: 'East', sum_sales: 1000 },
          { category: 'Furniture', region: 'West', sum_sales: 1500 },
          { category: 'Technology', region: 'East', sum_sales: 2000 },
          { category: 'Technology', region: 'West', sum_sales: 2500 }
        ],
        dtypes: {
          category: Arrow.utf8,
          region: Arrow.utf8,
          sum_sales: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'bar-line',
        xAxis: 'category',
        groupBy: 'region',
        metrics: [
          { field: 'sales', chartType: 'bar', axis: 'Ax1', opacity: 0.8 }
        ]
      };

      const result = transformBarLineChart(chartData, chartConfig);

      // Should create 2 traces (one per region)
      expect(result.traces).toHaveLength(2);

      // East trace
      const eastTrace = result.traces.find(t => t.name.includes('East'));
      expect(eastTrace).toBeDefined();
      expect(eastTrace.x).toEqual(['Furniture', 'Technology']);
      expect(eastTrace.y).toEqual([1000, 2000]);

      // West trace
      const westTrace = result.traces.find(t => t.name.includes('West'));
      expect(westTrace).toBeDefined();
      expect(westTrace.x).toEqual(['Furniture', 'Technology']);
      expect(westTrace.y).toEqual([1500, 2500]);
    });

    it('should handle multiple metrics with different chart types', () => {
      const chartData = {
        rows: [
          { category: 'Furniture', sum_sales: 2500, avg_profit: 250 },
          { category: 'Technology', sum_sales: 4500, avg_profit: 450 }
        ],
        dtypes: {
          category: Arrow.utf8,
          sum_sales: Arrow.double,
          avg_profit: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false },
            { field: 'profit', aggregation: 'avg', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'bar-line',
        xAxis: 'category',
        groupBy: '',
        metrics: [
          { field: 'sales', chartType: 'bar', axis: 'Ax1', opacity: 0.8 },
          { field: 'profit', chartType: 'line', axis: 'Ax1', lineStyle: 'solid' }
        ]
      };

      const result = transformBarLineChart(chartData, chartConfig);

      expect(result.traces).toHaveLength(2);

      // Bar trace
      const barTrace = result.traces[0];
      expect(barTrace.type).toBe('bar');
      expect(barTrace.marker.opacity).toBe(0.8);

      // Line trace
      const lineTrace = result.traces[1];
      expect(lineTrace.type).toBe('scatter');
      expect(lineTrace.mode).toBe('lines+markers');
      expect(lineTrace.line.dash).toBe('solid');
    });

    it('should handle dual axes (Ax1 and Ax2)', () => {
      const chartData = {
        rows: [
          { category: 'Furniture', sum_sales: 2500, sum_profit: 500 }
        ],
        dtypes: {
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
        chartType: 'bar-line',
        xAxis: 'category',
        groupBy: '',
        metrics: [
          { field: 'sales', chartType: 'bar', axis: 'Ax1', opacity: 0.8 },
          { field: 'profit', chartType: 'line', axis: 'Ax2', lineStyle: 'dash' }
        ]
      };

      const result = transformBarLineChart(chartData, chartConfig);

      expect(result.traces).toHaveLength(2);
      expect(result.traces[0].yaxis).toBe('y');
      expect(result.traces[1].yaxis).toBe('y2');

      // Should have yaxis2 in layout
      expect(result.layout.yaxis2).toBeDefined();
      expect(result.layout.yaxis2.side).toBe('right');
      expect(result.layout.yaxis2.overlaying).toBe('y');
    });

    it('should handle date axis type', () => {
      const chartData = {
        rows: [
          { date: new Date('2024-01-01'), sum_sales: 1200 },
          { date: new Date('2024-01-02'), sum_sales: 1800 }
        ],
        dtypes: {
          date: Arrow.date32,
          sum_sales: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'bar-line',
        xAxis: 'date',
        groupBy: '',
        metrics: [
          { field: 'sales', chartType: 'line', axis: 'Ax1', lineStyle: 'solid' }
        ]
      };

      const result = transformBarLineChart(chartData, chartConfig);

      expect(result.layout.xaxis.type).toBe('date');
      expect(result.layout.xaxis.tickformat).toBe('%Y-%m-%d');
      expect(result.layout.xaxis.hoverformat).toBe('%Y-%m-%d');
    });

    it('should apply different line styles', () => {
      const chartData = {
        rows: [
          { category: 'Furniture', sum_sales: 2500 }
        ],
        dtypes: {
          category: Arrow.utf8,
          sum_sales: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const lineStyles = ['solid', 'dash', 'dot', 'dashdot'];

      lineStyles.forEach(style => {
        const chartConfig = {
          chartType: 'bar-line',
          xAxis: 'category',
          groupBy: '',
          metrics: [
            { field: 'sales', chartType: 'line', axis: 'Ax1', lineStyle: style }
          ]
        };

        const result = transformBarLineChart(chartData, chartConfig);
        expect(result.traces[0].line.dash).toBe(style);
      });
    });

    it('should apply bar opacity', () => {
      const chartData = {
        rows: [
          { category: 'Furniture', sum_sales: 2500 }
        ],
        dtypes: {
          category: Arrow.utf8,
          sum_sales: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'bar-line',
        xAxis: 'category',
        groupBy: '',
        metrics: [
          { field: 'sales', chartType: 'bar', axis: 'Ax1', opacity: 0.5 }
        ]
      };

      const result = transformBarLineChart(chartData, chartConfig);
      expect(result.traces[0].marker.opacity).toBe(0.5);
    });

    it('should use consistent colors for groups', () => {
      const chartData = {
        rows: [
          { category: 'A', region: 'East', sum_sales: 100 },
          { category: 'A', region: 'West', sum_sales: 200 }
        ],
        dtypes: {
          category: Arrow.utf8,
          region: Arrow.utf8,
          sum_sales: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'bar-line',
        xAxis: 'category',
        groupBy: 'region',
        metrics: [
          { field: 'sales', chartType: 'bar', axis: 'Ax1', opacity: 0.8 }
        ]
      };

      const result = transformBarLineChart(chartData, chartConfig);

      // Colors should be different for different groups
      const colors = result.traces.map(t => t.marker.color);
      expect(new Set(colors).size).toBe(2);
    });

    it('should handle BigInt values without errors', () => {
      const chartData = {
        rows: [
          { category: 'Furniture', count_orders: 1000n },
          { category: 'Technology', count_orders: 2000n }
        ],
        dtypes: {
          category: Arrow.utf8,
          count_orders: Arrow.int64
        },
        config: {
          values: [
            { field: 'orders', aggregation: 'count', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'bar-line',
        xAxis: 'category',
        groupBy: '',
        metrics: [
          { field: 'orders', chartType: 'bar', axis: 'Ax1', opacity: 0.8 }
        ]
      };

      // Should not throw error
      const result = transformBarLineChart(chartData, chartConfig);

      expect(result.traces).toHaveLength(1);
      expect(result.traces[0].type).toBe('bar');
      expect(result.traces[0].y).toEqual([1000n, 2000n]);
    });

    it('should apply currency formatting to metrics', () => {
      const chartData = {
        rows: [
          { category: 'Furniture', sum_revenue: 12500.50 },
          { category: 'Technology', sum_revenue: 24750.75 }
        ],
        dtypes: {
          category: Arrow.utf8,
          sum_revenue: Arrow.double
        },
        config: {
          values: [
            {
              field: 'revenue',
              aggregation: 'sum',
              isCustom: false,
              format: { type: 'currency', decimals: 2, useThousandSeparator: true }
            }
          ]
        }
      };

      const chartConfig = {
        chartType: 'bar-line',
        xAxis: 'category',
        groupBy: '',
        metrics: [
          { field: 'revenue', chartType: 'bar', axis: 'Ax1', opacity: 0.8 }
        ]
      };

      const result = transformBarLineChart(chartData, chartConfig);

      expect(result.traces).toHaveLength(1);

      // Should use currency format in hover template
      expect(result.traces[0].hovertemplate).toContain('$%{y:,.2f}');
    });

    it('should apply percentage formatting to metrics', () => {
      const chartData = {
        rows: [
          { category: 'Furniture', avg_margin: 0.185 },
          { category: 'Technology', avg_margin: 0.245 }
        ],
        dtypes: {
          category: Arrow.utf8,
          avg_margin: Arrow.double
        },
        config: {
          values: [
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
        chartType: 'bar-line',
        xAxis: 'category',
        groupBy: '',
        metrics: [
          { field: 'margin', chartType: 'line', axis: 'Ax1', lineStyle: 'solid' }
        ]
      };

      const result = transformBarLineChart(chartData, chartConfig);

      expect(result.traces).toHaveLength(1);

      // Should use percentage format in hover template
      expect(result.traces[0].hovertemplate).toContain('.1%');
    });

    it('should apply numeric formatting with custom decimals', () => {
      const chartData = {
        rows: [
          { category: 'Furniture', sum_sales: 2500.12345 },
          { category: 'Technology', sum_sales: 4500.67890 }
        ],
        dtypes: {
          category: Arrow.utf8,
          sum_sales: Arrow.double
        },
        config: {
          values: [
            {
              field: 'sales',
              aggregation: 'sum',
              isCustom: false,
              format: { type: 'numeric', decimals: 3, useThousandSeparator: true }
            }
          ]
        }
      };

      const chartConfig = {
        chartType: 'bar-line',
        xAxis: 'category',
        groupBy: '',
        metrics: [
          { field: 'sales', chartType: 'bar', axis: 'Ax1', opacity: 0.8 }
        ]
      };

      const result = transformBarLineChart(chartData, chartConfig);

      expect(result.traces).toHaveLength(1);

      // Should use 3 decimal places with thousand separator
      expect(result.traces[0].hovertemplate).toContain(',.3f');
    });

    it('should handle boolean dimensions on x-axis', () => {
      const chartData = {
        rows: [
          { is_active: true, sum_sales: 8000 },
          { is_active: false, sum_sales: 2000 }
        ],
        dtypes: {
          is_active: Arrow.bool,
          sum_sales: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'bar-line',
        xAxis: 'is_active',
        groupBy: '',
        metrics: [
          { field: 'sales', chartType: 'bar', axis: 'Ax1', opacity: 0.8 }
        ]
      };

      const result = transformBarLineChart(chartData, chartConfig);

      expect(result.traces).toHaveLength(1);
      expect(result.traces[0].x).toContain(true);
      expect(result.traces[0].x).toContain(false);
      expect(result.traces[0].y).toEqual([8000, 2000]);
      expect(result.layout.xaxis.title).toBe('is_active');
    });

    it('should handle BigInt dimensions on x-axis', () => {
      const chartData = {
        rows: [
          { customer_id: 1001n, sum_revenue: 5000 },
          { customer_id: 1002n, sum_revenue: 7500 },
          { customer_id: 1003n, sum_revenue: 3000 }
        ],
        dtypes: {
          customer_id: Arrow.int64,
          sum_revenue: Arrow.double
        },
        config: {
          values: [
            { field: 'revenue', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'bar-line',
        xAxis: 'customer_id',
        groupBy: '',
        metrics: [
          { field: 'revenue', chartType: 'bar', axis: 'Ax1', opacity: 0.8 }
        ]
      };

      const result = transformBarLineChart(chartData, chartConfig);

      expect(result.traces).toHaveLength(1);
      // BigInt values should be preserved in x-axis
      expect(result.traces[0].x).toEqual([1001n, 1002n, 1003n]);
      expect(result.traces[0].y).toEqual([5000, 7500, 3000]);
    });

    it('should handle timestamp dimensions with proper formatting', () => {
      const chartData = {
        rows: [
          { event_time: new Date('2024-01-01T10:30:00'), sum_events: 120 },
          { event_time: new Date('2024-01-01T14:45:00'), sum_events: 180 },
          { event_time: new Date('2024-01-01T18:15:00'), sum_events: 95 }
        ],
        dtypes: {
          event_time: Arrow.timestamp,
          sum_events: Arrow.double
        },
        config: {
          values: [
            { field: 'events', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'bar-line',
        xAxis: 'event_time',
        groupBy: '',
        metrics: [
          { field: 'events', chartType: 'line', axis: 'Ax1', lineStyle: 'solid' }
        ]
      };

      const result = transformBarLineChart(chartData, chartConfig);

      expect(result.traces).toHaveLength(1);
      expect(result.layout.xaxis.type).toBe('date');
      expect(result.layout.xaxis.tickformat).toBe('%Y-%m-%d %H:%M:%S');
      expect(result.layout.xaxis.hoverformat).toBe('%Y-%m-%d %H:%M:%S');
    });

    it('should handle null values in boolean dimensions', () => {
      const chartData = {
        rows: [
          { is_verified: true, sum_sales: 5000 },
          { is_verified: false, sum_sales: 3000 },
          { is_verified: null, sum_sales: 1000 }
        ],
        dtypes: {
          is_verified: Arrow.bool,
          sum_sales: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'bar-line',
        xAxis: 'is_verified',
        groupBy: '',
        metrics: [
          { field: 'sales', chartType: 'bar', axis: 'Ax1', opacity: 0.8 }
        ]
      };

      const result = transformBarLineChart(chartData, chartConfig);

      expect(result.traces).toHaveLength(1);
      // Should handle null values
      expect(result.traces[0].x).toHaveLength(3);
      expect(result.traces[0].y).toEqual([5000, 3000, 1000]);
    });

    it('should handle empty metrics array gracefully', () => {
      const chartData = {
        rows: [
          { category: 'Furniture', sum_sales: 2500 }
        ],
        dtypes: {
          category: Arrow.utf8,
          sum_sales: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'bar-line',
        xAxis: 'category',
        groupBy: '',
        metrics: []
      };

      const result = transformBarLineChart(chartData, chartConfig);

      expect(result.traces).toHaveLength(0);
    });
  });
});
