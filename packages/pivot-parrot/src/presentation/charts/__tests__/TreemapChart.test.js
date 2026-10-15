/**
 * Integration tests for TreemapChart transformation
 */

import { describe, it, expect } from 'vitest';
import { transformTreemapChart, buildTreemapNodes } from '../TreemapChart';
import { Arrow } from '../../../domain/types/ArrowTypes';

describe('TreemapChart', () => {
  describe('transformTreemapChart', () => {
    it('should transform single-level treemap', () => {
      // Mock cubeIndex
      const cubeIndex = new Map();
      // Root: all grouped
      cubeIndex.set('category:*', [{ sum_sales: 7000 }]);
      // Level 1: category ungrouped
      cubeIndex.set('category:Furniture', [{ category: 'Furniture', sum_sales: 2500 }]);
      cubeIndex.set('category:Technology', [{ category: 'Technology', sum_sales: 4500 }]);

      const chartData = {
        rows: [
          { category: 'Furniture', sum_sales: 2500 },
          { category: 'Technology', sum_sales: 4500 }
        ],
        cubeIndex: cubeIndex,
        dimensions: ['category'],
        allDimensions: ['category'],
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
        chartType: 'treemap',
        levels: ['category'],
        metric: 'sales',
        colorMetric: '',
        colorScheme: 'Blues'
      };

      const result = transformTreemapChart(chartData, chartConfig);

      expect(result.traces).toHaveLength(1);

      const trace = result.traces[0];
      expect(trace.type).toBe('treemap');

      // Should have 3 nodes: root + 2 categories
      expect(trace.ids.length).toBe(3);
      expect(trace.labels).toContain('All');
      expect(trace.labels).toContain('Furniture');
      expect(trace.labels).toContain('Technology');

      // Check hierarchy - original structure with multiple roots (root + top-level items all have parent='')
      expect(trace.parents).toEqual(['', '', '']);
      expect(trace.ids).toEqual(['', 'Furniture', 'Technology']);
    });

    it('should transform two-level treemap', () => {
      // Mock cubeIndex
      const cubeIndex = new Map();
      // Root
      cubeIndex.set('category:*|region:*', [{ sum_sales: 7000 }]);
      // Level 1: category
      cubeIndex.set('category:Furniture|region:*', [{ sum_sales: 2500 }]);
      cubeIndex.set('category:Technology|region:*', [{ sum_sales: 4500 }]);
      // Level 2: category + region
      cubeIndex.set('category:Furniture|region:East', [{ sum_sales: 1000 }]);
      cubeIndex.set('category:Furniture|region:West', [{ sum_sales: 1500 }]);
      cubeIndex.set('category:Technology|region:East', [{ sum_sales: 2000 }]);
      cubeIndex.set('category:Technology|region:West', [{ sum_sales: 2500 }]);

      const chartData = {
        rows: [
          { category: 'Furniture', region: 'East', sum_sales: 1000 },
          { category: 'Furniture', region: 'West', sum_sales: 1500 },
          { category: 'Technology', region: 'East', sum_sales: 2000 },
          { category: 'Technology', region: 'West', sum_sales: 2500 }
        ],
        cubeIndex: cubeIndex,
        dimensions: ['category', 'region'],
        allDimensions: ['category', 'region'],
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
        chartType: 'treemap',
        levels: ['category', 'region'],
        metric: 'sales',
        colorMetric: '',
        colorScheme: 'Greens'
      };

      const result = transformTreemapChart(chartData, chartConfig);

      const trace = result.traces[0];

      // Should have: 1 root + 2 categories + 4 regions = 7 nodes
      expect(trace.ids.length).toBe(7);

      // Check root node - original structure with id='' and parent=''
      expect(trace.ids[0]).toBe('');
      expect(trace.parents[0]).toBe('');
      expect(trace.labels[0]).toBe('All');

      // Check hierarchy structure
      expect(trace.ids).toContain('Furniture');
      expect(trace.ids).toContain('Technology');
      expect(trace.ids).toContain('Furniture/East');
      expect(trace.ids).toContain('Furniture/West');
      expect(trace.ids).toContain('Technology/East');
      expect(trace.ids).toContain('Technology/West');
    });

    it('should handle color metric', () => {
      const cubeIndex = new Map();
      cubeIndex.set('category:*', [{ sum_sales: 7000, sum_profit: 1400 }]);
      cubeIndex.set('category:Furniture', [{ sum_sales: 2500, sum_profit: 500 }]);
      cubeIndex.set('category:Technology', [{ sum_sales: 4500, sum_profit: 900 }]);

      const chartData = {
        rows: [
          { category: 'Furniture', sum_sales: 2500, sum_profit: 500 },
          { category: 'Technology', sum_sales: 4500, sum_profit: 900 }
        ],
        cubeIndex: cubeIndex,
        dimensions: ['category'],
        allDimensions: ['category'],
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
        chartType: 'treemap',
        levels: ['category'],
        metric: 'sales',
        colorMetric: 'profit',
        colorScheme: 'Viridis'
      };

      const result = transformTreemapChart(chartData, chartConfig);

      const trace = result.traces[0];

      // Should have color marker config
      expect(trace.marker).toBeDefined();
      expect(trace.marker.colorscale).toBe('Viridis');
      expect(trace.marker.colors).toBeDefined();
      expect(trace.marker.colors.length).toBe(3);
    });

    it('should build correct title', () => {
      const cubeIndex = new Map();
      cubeIndex.set('category:*|region:*', [{ sum_sales: 7000 }]);

      const chartData = {
        rows: [],
        cubeIndex: cubeIndex,
        dimensions: ['category', 'region'],
        allDimensions: ['category', 'region'],
        dtypes: {},
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'treemap',
        levels: ['category', 'region'],
        metric: 'sales',
        colorMetric: '',
        colorScheme: 'Blues'
      };

      const result = transformTreemapChart(chartData, chartConfig);

      expect(result.layout.title.text).toBe('sum of sales by category, region');
    });

    it('should handle BigInt values without serialization errors', () => {
      // Mock cubeIndex with BigInt values (as returned from DuckDB/Arrow)
      const cubeIndex = new Map();
      cubeIndex.set('category:*', [{ count_items: 1000n }]); // BigInt
      cubeIndex.set('category:Furniture', [{ category: 'Furniture', count_items: 400n }]);
      cubeIndex.set('category:Technology', [{ category: 'Technology', count_items: 600n }]);

      const chartData = {
        rows: [
          { category: 'Furniture', count_items: 400n },
          { category: 'Technology', count_items: 600n }
        ],
        cubeIndex: cubeIndex,
        dimensions: ['category'],
        allDimensions: ['category'],
        dtypes: {
          category: Arrow.utf8,
          count_items: Arrow.int64
        },
        config: {
          values: [
            { field: 'items', aggregation: 'count', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'treemap',
        levels: ['category'],
        metric: 'items',
        colorMetric: '',
        colorScheme: 'Blues'
      };

      // Should not throw serialization error
      const result = transformTreemapChart(chartData, chartConfig);

      expect(result.traces).toHaveLength(1);

      const trace = result.traces[0];
      expect(trace.type).toBe('treemap');

      // Values should be converted to Numbers
      expect(trace.values).toEqual([1000, 400, 600]);
      expect(typeof trace.values[0]).toBe('number');
      expect(typeof trace.values[1]).toBe('number');
      expect(typeof trace.values[2]).toBe('number');
    });

    it('should apply number formatting to hover template', () => {
      const cubeIndex = new Map();
      cubeIndex.set('category:*', [{ sum_sales: 7000 }]);
      cubeIndex.set('category:Furniture', [{ sum_sales: 2500.75 }]);
      cubeIndex.set('category:Technology', [{ sum_sales: 4500.25 }]);

      const chartData = {
        rows: [
          { category: 'Furniture', sum_sales: 2500.75 },
          { category: 'Technology', sum_sales: 4500.25 }
        ],
        cubeIndex: cubeIndex,
        dimensions: ['category'],
        allDimensions: ['category'],
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
              format: { type: 'currency', decimals: 2, useThousandSeparator: true }
            }
          ]
        }
      };

      const chartConfig = {
        chartType: 'treemap',
        levels: ['category'],
        metric: 'sales',
        colorMetric: '',
        colorScheme: 'Blues'
      };

      const result = transformTreemapChart(chartData, chartConfig);

      const trace = result.traces[0];

      // Should use currency format in hover template
      expect(trace.hovertemplate).toContain('$%{value:,.2f}');
    });

    it('should handle percentage formatting', () => {
      const cubeIndex = new Map();
      cubeIndex.set('category:*', [{ avg_margin: 0.25 }]);
      cubeIndex.set('category:Furniture', [{ avg_margin: 0.18 }]);
      cubeIndex.set('category:Technology', [{ avg_margin: 0.32 }]);

      const chartData = {
        rows: [
          { category: 'Furniture', avg_margin: 0.18 },
          { category: 'Technology', avg_margin: 0.32 }
        ],
        cubeIndex: cubeIndex,
        dimensions: ['category'],
        allDimensions: ['category'],
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
        chartType: 'treemap',
        levels: ['category'],
        metric: 'margin',
        colorMetric: '',
        colorScheme: 'Blues'
      };

      const result = transformTreemapChart(chartData, chartConfig);

      const trace = result.traces[0];

      // Should use percentage format in hover template
      expect(trace.hovertemplate).toContain('.1%');
    });

    it('should handle boolean dimensions', () => {
      const cubeIndex = new Map();
      cubeIndex.set('is_premium:*', [{ sum_sales: 10000 }]);
      cubeIndex.set('is_premium:true', [{ sum_sales: 7000 }]);
      cubeIndex.set('is_premium:false', [{ sum_sales: 3000 }]);

      const chartData = {
        rows: [
          { is_premium: true, sum_sales: 7000 },
          { is_premium: false, sum_sales: 3000 }
        ],
        cubeIndex: cubeIndex,
        dimensions: ['is_premium'],
        allDimensions: ['is_premium'],
        dtypes: {
          is_premium: Arrow.bool,
          sum_sales: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'treemap',
        levels: ['is_premium'],
        metric: 'sales',
        colorMetric: '',
        colorScheme: 'Blues'
      };

      const result = transformTreemapChart(chartData, chartConfig);

      const trace = result.traces[0];

      // Should have 3 nodes: root + true + false
      expect(trace.ids.length).toBe(3);
      expect(trace.ids).toContain('true');
      expect(trace.ids).toContain('false');
      expect(trace.values).toEqual([10000, 7000, 3000]);
    });

    it('should handle BigInt dimension values', () => {
      const cubeIndex = new Map();
      cubeIndex.set('user_id:*', [{ sum_sales: 15000 }]);
      cubeIndex.set('user_id:1001', [{ sum_sales: 5000 }]);
      cubeIndex.set('user_id:1002', [{ sum_sales: 7000 }]);
      cubeIndex.set('user_id:1003', [{ sum_sales: 3000 }]);

      const chartData = {
        rows: [
          { user_id: 1001n, sum_sales: 5000 },
          { user_id: 1002n, sum_sales: 7000 },
          { user_id: 1003n, sum_sales: 3000 }
        ],
        cubeIndex: cubeIndex,
        dimensions: ['user_id'],
        allDimensions: ['user_id'],
        dtypes: {
          user_id: Arrow.int64,
          sum_sales: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'treemap',
        levels: ['user_id'],
        metric: 'sales',
        colorMetric: '',
        colorScheme: 'Viridis'
      };

      const result = transformTreemapChart(chartData, chartConfig);

      const trace = result.traces[0];

      // Should have 4 nodes: root + 3 users
      expect(trace.ids.length).toBe(4);
      expect(trace.labels).toContain('1001');
      expect(trace.labels).toContain('1002');
      expect(trace.labels).toContain('1003');
    });

    it('should handle Date dimensions with proper formatting', () => {
      const cubeIndex = new Map();
      cubeIndex.set('order_date:*', [{ sum_sales: 12000 }]);
      cubeIndex.set('order_date:2024-01-01', [{ sum_sales: 4000 }]);
      cubeIndex.set('order_date:2024-01-02', [{ sum_sales: 5000 }]);
      cubeIndex.set('order_date:2024-01-03', [{ sum_sales: 3000 }]);

      const chartData = {
        rows: [
          { order_date: new Date('2024-01-01'), sum_sales: 4000 },
          { order_date: new Date('2024-01-02'), sum_sales: 5000 },
          { order_date: new Date('2024-01-03'), sum_sales: 3000 }
        ],
        cubeIndex: cubeIndex,
        dimensions: ['order_date'],
        allDimensions: ['order_date'],
        dtypes: {
          order_date: Arrow.date32,
          sum_sales: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'treemap',
        levels: ['order_date'],
        metric: 'sales',
        colorMetric: '',
        colorScheme: 'Greens'
      };

      const result = transformTreemapChart(chartData, chartConfig);

      const trace = result.traces[0];

      // Should have 4 nodes: root + 3 dates
      expect(trace.ids.length).toBe(4);
      // Dates should be formatted as YYYY-MM-DD
      expect(trace.labels).toContain('2024-01-01');
      expect(trace.labels).toContain('2024-01-02');
      expect(trace.labels).toContain('2024-01-03');
    });

    it('should transform three-level treemap', () => {
      // Mock cubeIndex
      const cubeIndex = new Map();
      // Root
      cubeIndex.set('category:*|region:*|segment:*', [{ sum_sales: 10000 }]);
      // Level 1: category
      cubeIndex.set('category:Tech|region:*|segment:*', [{ sum_sales: 6000 }]);
      cubeIndex.set('category:Furniture|region:*|segment:*', [{ sum_sales: 4000 }]);
      // Level 2: category + region
      cubeIndex.set('category:Tech|region:East|segment:*', [{ sum_sales: 3500 }]);
      cubeIndex.set('category:Tech|region:West|segment:*', [{ sum_sales: 2500 }]);
      cubeIndex.set('category:Furniture|region:East|segment:*', [{ sum_sales: 2200 }]);
      cubeIndex.set('category:Furniture|region:West|segment:*', [{ sum_sales: 1800 }]);
      // Level 3: category + region + segment
      cubeIndex.set('category:Tech|region:East|segment:Consumer', [{ sum_sales: 2000 }]);
      cubeIndex.set('category:Tech|region:East|segment:Corporate', [{ sum_sales: 1500 }]);
      cubeIndex.set('category:Tech|region:West|segment:Consumer', [{ sum_sales: 1500 }]);
      cubeIndex.set('category:Tech|region:West|segment:Corporate', [{ sum_sales: 1000 }]);
      cubeIndex.set('category:Furniture|region:East|segment:Consumer', [{ sum_sales: 1200 }]);
      cubeIndex.set('category:Furniture|region:East|segment:Corporate', [{ sum_sales: 1000 }]);
      cubeIndex.set('category:Furniture|region:West|segment:Consumer', [{ sum_sales: 1000 }]);
      cubeIndex.set('category:Furniture|region:West|segment:Corporate', [{ sum_sales: 800 }]);

      const chartData = {
        rows: [
          { category: 'Tech', region: 'East', segment: 'Consumer', sum_sales: 2000 },
          { category: 'Tech', region: 'East', segment: 'Corporate', sum_sales: 1500 },
          { category: 'Tech', region: 'West', segment: 'Consumer', sum_sales: 1500 },
          { category: 'Tech', region: 'West', segment: 'Corporate', sum_sales: 1000 },
          { category: 'Furniture', region: 'East', segment: 'Consumer', sum_sales: 1200 },
          { category: 'Furniture', region: 'East', segment: 'Corporate', sum_sales: 1000 },
          { category: 'Furniture', region: 'West', segment: 'Consumer', sum_sales: 1000 },
          { category: 'Furniture', region: 'West', segment: 'Corporate', sum_sales: 800 }
        ],
        cubeIndex: cubeIndex,
        dimensions: ['category', 'region', 'segment'],
        allDimensions: ['category', 'region', 'segment'],
        dtypes: {
          category: Arrow.utf8,
          region: Arrow.utf8,
          segment: Arrow.utf8,
          sum_sales: Arrow.double
        },
        config: {
          values: [
            { field: 'sales', aggregation: 'sum', isCustom: false }
          ]
        }
      };

      const chartConfig = {
        chartType: 'treemap',
        levels: ['category', 'region', 'segment'],
        metric: 'sales',
        colorMetric: '',
        colorScheme: 'Viridis'
      };

      const result = transformTreemapChart(chartData, chartConfig);

      const trace = result.traces[0];

      // Should have: 1 root + 2 categories + 4 regions + 8 segments = 15 nodes
      expect(trace.ids.length).toBe(15);

      // Check root - original structure with id='' and parent=''
      expect(trace.ids[0]).toBe('');
      expect(trace.parents[0]).toBe('');
      expect(trace.values[0]).toBe(10000);

      // Check some specific paths exist
      expect(trace.ids).toContain('Tech');
      expect(trace.ids).toContain('Tech/East');
      expect(trace.ids).toContain('Tech/East/Consumer');
      expect(trace.ids).toContain('Furniture/West/Corporate');

      // Verify hierarchy is correct
      const techEastConsumerIdx = trace.ids.indexOf('Tech/East/Consumer');
      expect(trace.parents[techEastConsumerIdx]).toBe('Tech/East');
    });
  });

  describe('buildTreemapNodes', () => {
    it('should build nodes for single-level hierarchy', () => {
      const cubeIndex = new Map();
      cubeIndex.set('category:*', [{ sum_sales: 7000 }]);
      cubeIndex.set('category:Furniture', [{ sum_sales: 2500 }]);
      cubeIndex.set('category:Technology', [{ sum_sales: 4500 }]);

      const rows = [
        { category: 'Furniture', sum_sales: 2500 },
        { category: 'Technology', sum_sales: 4500 }
      ];

      const nodes = buildTreemapNodes(
        rows,
        null, // rawRows
        cubeIndex,
        ['category'], // levels
        ['category'], // allDimensions
        { category: Arrow.utf8 }, // dtypes
        'sum_sales', // metricColumn
        null, // colorMetricColumn
        false // useColorMetric
      );

      // Should have 3 nodes: root + 2 categories
      expect(nodes).toHaveLength(3);

      // Check root node
      expect(nodes[0]).toEqual({
        id: '',
        label: 'All',
        parent: '',
        value: 7000,
        colorValue: 0
      });

      // Check category nodes
      expect(nodes[1]).toEqual({
        id: 'Furniture',
        label: 'Furniture',
        parent: '',
        value: 2500,
        colorValue: 0
      });

      expect(nodes[2]).toEqual({
        id: 'Technology',
        label: 'Technology',
        parent: '',
        value: 4500,
        colorValue: 0
      });
    });

    it('should build nodes for two-level hierarchy', () => {
      const cubeIndex = new Map();
      cubeIndex.set('category:*|region:*', [{ sum_sales: 7000 }]);
      cubeIndex.set('category:Furniture|region:*', [{ sum_sales: 2500 }]);
      cubeIndex.set('category:Technology|region:*', [{ sum_sales: 4500 }]);
      cubeIndex.set('category:Furniture|region:East', [{ sum_sales: 1000 }]);
      cubeIndex.set('category:Furniture|region:West', [{ sum_sales: 1500 }]);
      cubeIndex.set('category:Technology|region:East', [{ sum_sales: 2000 }]);
      cubeIndex.set('category:Technology|region:West', [{ sum_sales: 2500 }]);

      const rows = [
        { category: 'Furniture', region: 'East', sum_sales: 1000 },
        { category: 'Furniture', region: 'West', sum_sales: 1500 },
        { category: 'Technology', region: 'East', sum_sales: 2000 },
        { category: 'Technology', region: 'West', sum_sales: 2500 }
      ];

      const nodes = buildTreemapNodes(
        rows,
        null,
        cubeIndex,
        ['category', 'region'],
        ['category', 'region'],
        { category: Arrow.utf8, region: Arrow.utf8 },
        'sum_sales',
        null,
        false
      );

      // Should have: 1 root + 2 categories + 4 regions = 7 nodes
      expect(nodes).toHaveLength(7);

      // Check root
      expect(nodes[0].id).toBe('');
      expect(nodes[0].parent).toBe('');
      expect(nodes[0].value).toBe(7000);

      // Check level 1 nodes have parent=''
      const furnitureNode = nodes.find(n => n.id === 'Furniture');
      expect(furnitureNode).toBeDefined();
      expect(furnitureNode.parent).toBe('');
      expect(furnitureNode.value).toBe(2500);

      // Check level 2 nodes have correct parents
      const furnitureEastNode = nodes.find(n => n.id === 'Furniture/East');
      expect(furnitureEastNode).toBeDefined();
      expect(furnitureEastNode.parent).toBe('Furniture');
      expect(furnitureEastNode.label).toBe('East');
      expect(furnitureEastNode.value).toBe(1000);
    });

    it('should handle color metric', () => {
      const cubeIndex = new Map();
      cubeIndex.set('category:*', [{ sum_sales: 7000, sum_profit: 1400 }]);
      cubeIndex.set('category:Furniture', [{ sum_sales: 2500, sum_profit: 500 }]);
      cubeIndex.set('category:Technology', [{ sum_sales: 4500, sum_profit: 900 }]);

      const rows = [
        { category: 'Furniture', sum_sales: 2500, sum_profit: 500 },
        { category: 'Technology', sum_sales: 4500, sum_profit: 900 }
      ];

      const nodes = buildTreemapNodes(
        rows,
        null,
        cubeIndex,
        ['category'],
        ['category'],
        { category: Arrow.utf8 },
        'sum_sales',
        'sum_profit',
        true
      );

      // All nodes should have colorValue populated
      expect(nodes[0].colorValue).toBe(1400); // Root
      expect(nodes[1].colorValue).toBe(500);  // Furniture
      expect(nodes[2].colorValue).toBe(900);  // Technology
    });

    it('should convert BigInt values to Number', () => {
      const cubeIndex = new Map();
      cubeIndex.set('category:*', [{ count_items: 1000n }]);
      cubeIndex.set('category:Furniture', [{ count_items: 400n }]);
      cubeIndex.set('category:Technology', [{ count_items: 600n }]);

      const rows = [
        { category: 'Furniture', count_items: 400n },
        { category: 'Technology', count_items: 600n }
      ];

      const nodes = buildTreemapNodes(
        rows,
        null,
        cubeIndex,
        ['category'],
        ['category'],
        { category: Arrow.utf8 },
        'count_items',
        null,
        false
      );

      // Values should be Numbers, not BigInts
      expect(typeof nodes[0].value).toBe('number');
      expect(typeof nodes[1].value).toBe('number');
      expect(typeof nodes[2].value).toBe('number');
      expect(nodes[0].value).toBe(1000);
      expect(nodes[1].value).toBe(400);
      expect(nodes[2].value).toBe(600);
    });

    it('should convert TypedArray values to Number', () => {
      // Simulate Arrow/DuckDB returning TypedArrays
      const cubeIndex = new Map();
      cubeIndex.set('category:*', [{ sum_sales: new Uint32Array([10000, 0, 0, 0]) }]);
      cubeIndex.set('category:Furniture', [{ sum_sales: new Uint32Array([4000, 0, 0, 0]) }]);
      cubeIndex.set('category:Technology', [{ sum_sales: new Uint32Array([6000, 0, 0, 0]) }]);

      const rows = [
        { category: 'Furniture', sum_sales: 4000 },
        { category: 'Technology', sum_sales: 6000 }
      ];

      const nodes = buildTreemapNodes(
        rows,
        null,
        cubeIndex,
        ['category'],
        ['category'],
        { category: Arrow.utf8 },
        'sum_sales',
        null,
        false
      );

      // Values should be plain Numbers, not TypedArrays
      expect(typeof nodes[0].value).toBe('number');
      expect(typeof nodes[1].value).toBe('number');
      expect(typeof nodes[2].value).toBe('number');
      expect(nodes[0].value).toBe(10000);
      expect(nodes[1].value).toBe(4000);
      expect(nodes[2].value).toBe(6000);

      // Ensure they're not TypedArray instances
      expect(nodes[0].value).not.toBeInstanceOf(Uint32Array);
      expect(nodes[1].value).not.toBeInstanceOf(Uint32Array);
      expect(nodes[2].value).not.toBeInstanceOf(Uint32Array);
    });

    it('should format Date dimensions correctly', () => {
      const cubeIndex = new Map();
      cubeIndex.set('order_date:*', [{ sum_sales: 12000 }]);
      cubeIndex.set('order_date:2024-01-01', [{ sum_sales: 4000 }]);
      cubeIndex.set('order_date:2024-01-02', [{ sum_sales: 8000 }]);

      const rows = [
        { order_date: new Date('2024-01-01'), sum_sales: 4000 },
        { order_date: new Date('2024-01-02'), sum_sales: 8000 }
      ];

      const rawRows = [
        { order_date: '2024-01-01', sum_sales: 4000 },
        { order_date: '2024-01-02', sum_sales: 8000 }
      ];

      const nodes = buildTreemapNodes(
        rows,
        rawRows,
        cubeIndex,
        ['order_date'],
        ['order_date'],
        { order_date: Arrow.date32 },
        'sum_sales',
        null,
        false
      );

      // Should format dates consistently
      expect(nodes[1].label).toBe('2024-01-01');
      expect(nodes[2].label).toBe('2024-01-02');
      expect(nodes[1].id).toBe('2024-01-01');
      expect(nodes[2].id).toBe('2024-01-02');
    });
  });
});
