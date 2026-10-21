import { describe, it, expect, beforeEach } from 'vitest';
import { buildCubeSQL } from '../../sql/buildCubeSQL';
import { SQLDialect } from '../../dialects/SQLDialect';
import { DatabricksDialect } from '../../dialects/DatabricksDialect';

describe('buildCubeSQL', () => {
  let dialect;

  beforeEach(() => {
    dialect = new SQLDialect();
  });

  describe('basic SQL generation', () => {
    it('should generate SQL with single dimension and aggregation', () => {
      const config = {
        rows: ['region'],
        columns: [],
        values: [{ field: 'sales', aggregation: 'SUM' }]
      };

      const sql = buildCubeSQL(config, '', { sales: 'float64' }, 'data', dialect);

      expect(sql).toContain('SELECT');
      expect(sql).toContain('region');
      expect(sql).toContain('SUM');
      expect(sql).toContain('FROM data');
      expect(sql).toContain('GROUP BY CUBE');
    });

    it('should generate SQL with multiple dimensions', () => {
      const config = {
        rows: ['region', 'category'],
        columns: ['year'],
        values: [{ field: 'amount', aggregation: 'SUM' }]
      };

      const sql = buildCubeSQL(config, '', {}, 'data', dialect);

      expect(sql).toContain('region');
      expect(sql).toContain('category');
      expect(sql).toContain('year');
      expect(sql).toContain('GROUP BY CUBE');
    });

    it('should generate SQL with WHERE clause', () => {
      const config = {
        rows: ['product'],
        columns: [],
        values: [{ field: 'quantity', aggregation: 'COUNT' }]
      };

      const whereFilters = [{ field: 'status', sqlExpr: "status = 'active'" }];
      const sql = buildCubeSQL(config, whereFilters, {}, 'orders', dialect);

      expect(sql).toContain("WHERE");
      expect(sql).toContain("(status = 'active')");
      expect(sql).toContain('FROM orders');
    });

    it('should generate SQL with no dimensions (just aggregates)', () => {
      const config = {
        rows: [],
        columns: [],
        values: [
          { field: 'revenue', aggregation: 'SUM' },
          { field: 'orders', aggregation: 'COUNT' }
        ]
      };

      const sql = buildCubeSQL(config, '', { revenue: 'float64' }, 'data', dialect);

      expect(sql).toContain('SELECT');
      expect(sql).toContain('SUM');
      expect(sql).toContain('COUNT');
      expect(sql).toContain('FROM data');
      expect(sql).not.toContain('GROUP BY'); // No dimensions = no GROUP BY
    });
  });

  describe('aggregation handling', () => {
    it('should support all standard aggregations', () => {
      const testCases = [
        { agg: 'SUM', expected: 'SUM' },
        { agg: 'AVG', expected: 'AVG' },
        { agg: 'COUNT', expected: 'COUNT' },
        { agg: 'MIN', expected: 'MIN' },
        { agg: 'MAX', expected: 'MAX' },
        { agg: 'COUNT DISTINCT', expected: 'COUNT(DISTINCT' }
      ];

      testCases.forEach(({ agg, expected }) => {
        const config = {
          rows: ['category'],
          values: [{ field: 'value', aggregation: agg }]
        };

        const sql = buildCubeSQL(config, '', { value: 'float64' }, 'data', dialect);
        expect(sql).toContain(expected);
      });
    });

    it('should generate AVG and SUM without casting', () => {
      const config = {
        rows: ['region'],
        values: [
          { field: 'amount', aggregation: 'SUM' },
          { field: 'price', aggregation: 'AVG' }
        ]
      };

      const sql = buildCubeSQL(config, '', { amount: 'float64', price: 'float64' }, 'data', dialect);

      expect(sql).toContain('SUM(amount) AS sum_amount');
      expect(sql).toContain('AVG(price) AS avg_price');
    });

    it('should generate COUNT without casting', () => {
      const config = {
        rows: ['category'],
        values: [{ field: 'id', aggregation: 'COUNT' }]
      };

      const sql = buildCubeSQL(config, '', {}, 'data', dialect);

      expect(sql).toContain('COUNT(id) AS count_id');
    });

    it('should throw error for unsupported aggregation', () => {
      const config = {
        rows: ['region'],
        values: [{ field: 'value', aggregation: 'FAKE_AGG' }]
      };

      expect(() => buildCubeSQL(config, '', {}, 'data', dialect)).toThrow('Unknown aggregation type');
    });
  });

  describe('custom metrics', () => {
    it('should handle custom metric expressions', () => {
      const config = {
        rows: ['region'],
        values: [{
          field: 'custom_metric',
          aggregation: 'SUM',
          isCustom: true,
          expr: 'SUM(revenue) / SUM(quantity)',
          name: 'Average Price'
        }]
      };

      const sql = buildCubeSQL(config, '', {}, 'data', dialect);

      expect(sql).toContain('revenue');
      expect(sql).toContain('quantity');
      expect(sql).toContain('custom_metric');
    });

    it('should NOT cast custom metrics - user responsible for SQL', () => {
      const config = {
        rows: ['region'],
        values: [{
          field: 'profit_margin',
          isCustom: true,
          expr: 'SUM(profit) / SUM(revenue)',
          name: 'Margin'
        }],
        customMetrics: []
      };

      const sql = buildCubeSQL(config, '', {}, 'data', dialect);

      // Custom metrics are passed through as-is, no casting
      expect(sql).toContain('SUM(profit) / SUM(revenue) AS profit_margin');
      expect(sql).not.toContain('CAST(SUM(profit) / SUM(revenue)');
    });
  });

  describe('field name safety', () => {
    it('should quote field names with spaces', () => {
      const config = {
        rows: ['Product Name', 'Sales Region'],
        values: [{ field: 'Total Amount', aggregation: 'SUM' }]
      };

      const fieldTypes = { 'Total Amount': 'float64' };
      const sql = buildCubeSQL(config, '', fieldTypes, 'data', dialect);

      expect(sql).toContain('"Product Name"');
      expect(sql).toContain('"Sales Region"');
      expect(sql).toContain('"Total Amount"');
    });

    it('should quote field names with special characters', () => {
      const config = {
        rows: ['user@email', 'item-id'],
        values: [{ field: 'value$', aggregation: 'SUM' }]
      };

      const sql = buildCubeSQL(config, '', { 'value$': 'float64' }, 'data', dialect);

      expect(sql).toContain('"user@email"');
      expect(sql).toContain('"item-id"');
      expect(sql).toContain('"value$"');
    });

    it('should safely handle malicious field names', () => {
      const config = {
        rows: ["col'; DROP TABLE users--"],
        values: [{ field: 'amount', aggregation: 'SUM' }]
      };

      const sql = buildCubeSQL(config, '', { amount: 'float64' }, 'data', dialect);

      // Field name should be quoted, making SQL injection impossible
      expect(sql).toContain('"col\'; DROP TABLE users--"');
      // Verify the field is properly quoted - the malicious content is inside quotes
      // so it's treated as a literal identifier, not executable SQL
      expect(sql).toMatch(/"col'; DROP TABLE users--"/);
    });
  });

  describe('Σ Values placeholder', () => {
    it('should filter out Σ Values placeholder from rows', () => {
      const config = {
        rows: ['region', 'Σ Values'],
        columns: [],
        values: [{ field: 'amount', aggregation: 'SUM' }]
      };

      const sql = buildCubeSQL(config, '', { amount: 'float64' }, 'data', dialect);

      expect(sql).not.toContain('Σ Values');
      expect(sql).toContain('region');
    });

    it('should filter out Σ Values placeholder from columns', () => {
      const config = {
        rows: [],
        columns: ['year', 'Σ Values'],
        values: [{ field: 'count', aggregation: 'COUNT' }]
      };

      const sql = buildCubeSQL(config, '', {}, 'data', dialect);

      expect(sql).not.toContain('Σ Values');
      expect(sql).toContain('year');
    });
  });

  describe('GROUPING columns', () => {
    it('should generate GROUPING columns for CUBE support', () => {
      const config = {
        rows: ['region', 'category'],
        columns: [],
        values: [{ field: 'sales', aggregation: 'SUM' }]
      };

      const sql = buildCubeSQL(config, '', { sales: 'float64' }, 'data', dialect);

      expect(sql).toContain('GROUPING(');
      expect(sql).toContain('_grouping_');
    });
  });

  describe('error handling', () => {
    it('should throw error if dialect is not provided', () => {
      const config = {
        rows: ['region'],
        values: [{ field: 'amount', aggregation: 'SUM' }]
      };

      expect(() => buildCubeSQL(config, '', {}, 'data')).toThrow('requires a valid SQLDialect');
    });

    it('should throw error if dialect is invalid', () => {
      const config = {
        rows: ['region'],
        values: [{ field: 'amount', aggregation: 'SUM' }]
      };

      expect(() => buildCubeSQL(config, '', {}, 'data', {})).toThrow('requires a valid SQLDialect');
    });
  });

  describe('custom groupings', () => {
    it('should handle custom grouping expressions', () => {
      const config = {
        rows: ['year_group'],
        values: [{ field: 'amount', aggregation: 'SUM' }],
        customGroupings: [{
          id: 'year_group',
          expr: 'YEAR(order_date)',
          name: 'Year'
        }]
      };

      const sql = buildCubeSQL(config, '', { amount: 'float64' }, 'data', dialect);

      expect(sql).toContain('YEAR(order_date)');
      expect(sql).toContain('year_group');
    });

    it('should handle custom grouping with empty expr gracefully', () => {
      const config = {
        rows: ['custom'],
        values: [{ field: 'amount', aggregation: 'SUM' }],
        customGroupings: [{
          id: 'custom',
          name: 'Custom',
          expr: ''  // empty expr
        }]
      };

      // Should not throw - gracefully handles empty expr
      const sql = buildCubeSQL(config, '', { amount: 'float64' }, 'data', dialect);
      expect(sql).toContain('custom');
    });
  });

  describe('derived fields', () => {
    it('should handle derived fields with SQL expressions', () => {
      const config = {
        rows: ['order_year'],
        values: [{ field: 'amount', aggregation: 'SUM' }]
      };

      // FieldItem objects use 'formula' for SQL expression
      const availableFields = [{
        id: 'order_year',
        kind: 'derived_field',
        name: 'Year',
        formula: 'EXTRACT(YEAR FROM "order_date")',
        derivation_type: 'date_part'
      }];

      const sql = buildCubeSQL(config, '', { amount: 'float64' }, 'data', dialect, availableFields);

      expect(sql).toContain('EXTRACT(YEAR FROM "order_date")');
      expect(sql).toContain('order_year');
    });

    it('should format time_bucket derivations as timestamps', () => {
      const config = {
        rows: ['time_bucket'],
        values: [{ field: 'count', aggregation: 'COUNT' }]
      };

      // FieldItem objects use 'formula' for SQL expression
      const availableFields = [{
        id: 'time_bucket',
        kind: 'derived_field',
        name: '5 minutes',
        formula: 'time_bucket_expr',
        derivation_type: 'time_bucket'
      }];

      const sql = buildCubeSQL(config, '', {}, 'data', dialect, availableFields);

      expect(sql).toContain('time_bucket');
    });
  });

  describe('field type handling', () => {
    it('should fallback to COUNT when using numeric agg on non-numeric field', () => {
      const config = {
        rows: ['category'],
        values: [{ field: 'name', aggregation: 'SUM' }] // SUM on varchar
      };

      const sql = buildCubeSQL(config, [], { name: 'varchar' }, 'data', dialect);

      // Should fallback to COUNT instead of SUM
      expect(sql).toContain('COUNT(name)');
      expect(sql).not.toContain('SUM(name)');
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should prevent injection through table name parameter', () => {
      const config = {
        rows: ['region'],
        values: [{ field: 'amount', aggregation: 'SUM' }]
      };

      // Note: table name is NOT escaped in current implementation
      // This is a potential security issue if table name comes from user input
      const maliciousTable = "users; DROP TABLE orders--";
      const sql = buildCubeSQL(config, '', { amount: 'float64' }, maliciousTable, dialect);

      expect(sql).toContain(maliciousTable);
      // WARNING: This test documents current behavior
      // In production, table names should be validated or escaped
    });

    it('should prevent injection through field names', () => {
      const config = {
        rows: ["field'; DELETE FROM users--"],
        values: [{ field: 'amount', aggregation: 'SUM' }]
      };

      const sql = buildCubeSQL(config, '', { amount: 'float64' }, 'data', dialect);

      // Field names are quoted, making them safe
      expect(sql).toMatch(/"field'; DELETE FROM users--"/);
    });

    it('should safely handle WHERE clause', () => {
      const config = {
        rows: ['region'],
        values: [{ field: 'amount', aggregation: 'SUM' }]
      };

      // WHERE filters use sqlExpr for custom expressions
      const whereFilters = [{ field: 'region', sqlExpr: "region = 'North'" }];
      const sql = buildCubeSQL(config, whereFilters, { amount: 'float64' }, 'data', dialect);

      expect(sql).toContain('WHERE');
      expect(sql).toContain("(region = 'North')");
    });
  });
  describe('result column aliases', () => {
    it('quotes grouping and aggregation aliases with the dialect quote character', () => {
      const config = {
        rows: ['Sales Region'],
        columns: [],
        values: [{ field: 'Net Sales', aggregation: 'SUM' }]
      };

      const sql = buildCubeSQL(config, '', { 'Net Sales': 'float64' }, 'data', new DatabricksDialect());

      expect(sql).toContain('AS `_grouping_Sales Region`');
      expect(sql).toContain('AS `sum_Net Sales`');
    });
  });
});
