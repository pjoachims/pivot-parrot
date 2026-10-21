/**
 * Test: SQL generation for different aggregations
 *
 * Verifies that changing aggregation from Count to Sum updates the SQL correctly
 */

import { describe, it, expect } from 'vitest';
import { buildCubeSQL } from '../../sql/buildCubeSQL';
import { DuckDBDialect } from '../../dialects/DuckDBDialect';

describe('buildCubeSQL - Aggregation Changes', () => {
  const dialect = new DuckDBDialect();
  // fieldTypes maps field name to Arrow type name (string)
  // buildCubeSQL looks up the type definition in dialect.types[typeName]
  const fieldTypes = {
    date: 'date32',
    region: 'utf8',
    sales: 'int64',
    profit: 'float64'
  };

  it('should generate COUNT aggregation SQL', () => {
    const config = {
      rows: ['region'],
      columns: [],
      values: [{ field: 'sales', aggregation: 'Count' }],
      customMetrics: [],
      customGroupings: [],
      customFilters: []
    };

    const sql = buildCubeSQL(config, [], fieldTypes, 'pivot_data', dialect);

    expect(sql).toContain('COUNT');
    expect(sql).toContain('sales');
    expect(sql).toContain('count_sales'); // Metric key should be lowercase
  });

  it('should generate SUM aggregation SQL', () => {
    const config = {
      rows: ['region'],
      columns: [],
      values: [{ field: 'sales', aggregation: 'Sum' }],
      customMetrics: [],
      customGroupings: [],
      customFilters: []
    };

    const sql = buildCubeSQL(config, [], fieldTypes, 'pivot_data', dialect);

    expect(sql).toContain('SUM');
    expect(sql).toContain('sales');
    expect(sql).toContain('sum_sales'); // Metric key should be lowercase
    expect(sql).not.toContain('COUNT'); // Should not contain COUNT
  });

  it('should generate AVG aggregation SQL', () => {
    const config = {
      rows: ['region'],
      columns: [],
      values: [{ field: 'profit', aggregation: 'Avg' }],
      customMetrics: [],
      customGroupings: [],
      customFilters: []
    };

    const sql = buildCubeSQL(config, [], fieldTypes, 'pivot_data', dialect);

    expect(sql).toContain('AVG');
    expect(sql).toContain('profit');
    expect(sql).toContain('avg_profit'); // Metric key should be lowercase
  });

  it('should handle multiple aggregations', () => {
    const config = {
      rows: ['region'],
      columns: [],
      values: [
        { field: 'sales', aggregation: 'Sum' },
        { field: 'sales', aggregation: 'Count' },
        { field: 'profit', aggregation: 'Avg' }
      ],
      customMetrics: [],
      customGroupings: [],
      customFilters: []
    };

    const sql = buildCubeSQL(config, [], fieldTypes, 'pivot_data', dialect);

    expect(sql).toContain('SUM(sales)');
    expect(sql).toContain('COUNT(sales)');
    expect(sql).toContain('AVG(profit)');
    expect(sql).toContain('sum_sales');
    expect(sql).toContain('count_sales');
    expect(sql).toContain('avg_profit');
  });

  it('should lowercase aggregation names in column aliases', () => {
    const config = {
      rows: [],
      columns: [],
      values: [
        { field: 'sales', aggregation: 'Sum' },
        { field: 'sales', aggregation: 'Count Distinct' }
      ],
      customMetrics: [],
      customGroupings: [],
      customFilters: []
    };

    const sql = buildCubeSQL(config, [], fieldTypes, 'pivot_data', dialect);

    // Column aliases should be lowercase to match DuckDB's normalization
    expect(sql).toMatch(/AS\s+sum_sales/i);
    expect(sql).toMatch(/AS\s+count_distinct_sales/i);
    // Should NOT have capitalized aliases
    expect(sql).not.toContain('Sum_sales');
    expect(sql).not.toContain('Count_Distinct_sales');
  });
});
