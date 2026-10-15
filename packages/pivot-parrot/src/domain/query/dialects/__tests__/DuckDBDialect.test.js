import { describe, it, expect, beforeEach } from 'vitest';
import { DuckDBDialect } from '../DuckDBDialect';
import { buildFilter } from '../../sql/filters';

describe('DuckDBDialect', () => {
  let dialect;

  beforeEach(() => {
    dialect = new DuckDBDialect();
  });

  describe('Dialect Name', () => {
    it('should return duckdb as name', () => {
      expect(dialect.name).toBe('duckdb');
    });
  });

  describe('Identifier Quoting (Double Quotes)', () => {
    it('should not quote simple alphanumeric identifiers', () => {
      expect(dialect.quoteIdentifier('column_name')).toBe('column_name');
      expect(dialect.quoteIdentifier('Column123')).toBe('Column123');
      expect(dialect.quoteIdentifier('_private')).toBe('_private');
    });

    it('should quote identifiers with spaces using double quotes', () => {
      expect(dialect.quoteIdentifier('first name')).toBe('"first name"');
      expect(dialect.quoteIdentifier('Sales Amount')).toBe('"Sales Amount"');
    });

    it('should quote identifiers with special characters using double quotes', () => {
      expect(dialect.quoteIdentifier('user@domain')).toBe('"user@domain"');
      expect(dialect.quoteIdentifier('item-id')).toBe('"item-id"');
      expect(dialect.quoteIdentifier('price$')).toBe('"price$"');
    });

    it('should quote identifiers starting with numbers using double quotes', () => {
      expect(dialect.quoteIdentifier('2023_sales')).toBe('"2023_sales"');
      expect(dialect.quoteIdentifier('1st_quarter')).toBe('"1st_quarter"');
    });

    it('should handle SQL injection attempts with double quotes', () => {
      expect(dialect.quoteIdentifier("'; DROP TABLE users--")).toBe("\"'; DROP TABLE users--\"");
      // Embedded double quote must be escaped (doubled), not passed through raw -
      // otherwise it breaks out of the quoted identifier and injects SQL.
      expect(dialect.quoteIdentifier('col"; DELETE FROM')).toBe('"col""; DELETE FROM"');
    });

    it('should escape embedded double quotes by doubling them', () => {
      expect(dialect.quoteIdentifier('col"name')).toBe('"col""name"');
      expect(dialect.quoteIdentifier('a"b"c')).toBe('"a""b""c"');
    });

    it('should produce a re-parseable identifier when embedded quotes are escaped', () => {
      const quoted = dialect.quoteIdentifier('weird"col');
      // Stripping the outer quotes and un-doubling should round-trip to the original name
      const inner = quoted.slice(1, -1).replace(/""/g, '"');
      expect(inner).toBe('weird"col');
    });
  });

  describe('DuckDB-Specific Aggregations', () => {
    it('should support APPROX_COUNT_DISTINCT aggregation', () => {
      expect(dialect.getAggregation('approx_count_distinct', 'user_id')).toBe('APPROX_COUNT_DISTINCT(user_id)');
    });

    it('should still support standard aggregations', () => {
      expect(dialect.getAggregation('sum', 'amount')).toBe('SUM(amount)');
      expect(dialect.getAggregation('avg', 'price')).toBe('AVG(price)');
      expect(dialect.getAggregation('count_distinct', 'user_id')).toBe('COUNT(DISTINCT user_id)');
    });

    it('should check APPROX_COUNT_DISTINCT support', () => {
      expect(dialect.supports('aggregation', 'approx_count_distinct')).toBe(true);
    });
  });

  describe('DuckDB-Specific Operators', () => {
    it('should use regexp_matches() for regex', () => {
      expect(dialect.getFunction('regex_match', 'r', "'^A'")).toBe("regexp_matches(r, '^A')");
    });
  });

  describe('DuckDB Date/Time Functions', () => {
    it('should support DATE_PART function', () => {
      expect(dialect.getFunction('date_part', 'year', 'order_date')).toBe("DATE_PART('year', order_date)");
      expect(dialect.getFunction('date_part', 'month', 'order_date')).toBe("DATE_PART('month', order_date)");
      expect(dialect.getFunction('date_part', 'day', 'order_date')).toBe("DATE_PART('day', order_date)");
    });

    it('should support EPOCH_MS function', () => {
      expect(dialect.getFunction('epoch_ms', 'timestamp_col')).toBe('EPOCH_MS(timestamp_col)');
    });

    it('should support TO_TIMESTAMP function', () => {
      expect(dialect.getFunction('to_timestamp', '1609459200')).toBe('TO_TIMESTAMP(1609459200)');
    });

    it('should check function support', () => {
      expect(dialect.supports('function', 'date_part')).toBe(true);
      expect(dialect.supports('function', 'epoch_ms')).toBe(true);
      expect(dialect.supports('function', 'to_timestamp')).toBe(true);
    });
  });

  describe('Date Column Formatting', () => {
    it('should format date columns using STRFTIME with %Y-%m-%d', () => {
      expect(dialect.formatDateColumn('order_date', 'date')).toBe("STRFTIME(order_date, '%Y-%m-%d')");
    });

    it('should format timestamp columns using STRFTIME with full format', () => {
      expect(dialect.formatDateColumn('created_at', 'timestamp')).toBe("STRFTIME(created_at, '%Y-%m-%d %H:%M:%S')");
    });

    it('should return column as-is for non-date types', () => {
      expect(dialect.formatDateColumn('amount', 'integer')).toBe('amount');
      expect(dialect.formatDateColumn('name', 'string')).toBe('name');
    });
  });

  // ==================== UI FILTER TESTS ====================

  describe('UI Filters - EqualFilter', () => {
    it('should generate equality comparison with double quote quoting', () => {
      const filter = buildFilter({
        type: 'equal',
        field: 'Order Status',
        value: 'active'
      });

      expect(filter.toSQL(dialect)).toBe('"Order Status" = \'active\'');
    });

    it('should generate NOT equal when isNot is true', () => {
      const filter = buildFilter({
        type: 'equal',
        field: 'status',
        value: 'deleted',
        isNot: true
      });

      expect(filter.toSQL(dialect)).toBe("(NOT (status = 'deleted') OR status IS NULL)");
    });

    it('should escape single quotes in values', () => {
      const filter = buildFilter({
        type: 'equal',
        field: 'name',
        value: "O'Brien"
      });

      expect(filter.toSQL(dialect)).toBe("name = 'O''Brien'");
    });
  });

  describe('UI Filters - OneOfFilter', () => {
    it('should generate IN clause with double quote quoting', () => {
      const filter = buildFilter({
        type: 'one_of',
        field: 'Product Category',
        selectedValues: ['Electronics', 'Books', 'Clothing']
      });

      expect(filter.toSQL(dialect)).toBe('"Product Category" IN (\'Electronics\', \'Books\', \'Clothing\')');
    });

    it('should generate NOT IN when isNot is true', () => {
      const filter = buildFilter({
        type: 'one_of',
        field: 'status',
        selectedValues: ['cancelled', 'refunded'],
        isNot: true
      });

      expect(filter.toSQL(dialect)).toBe("(NOT (status IN ('cancelled', 'refunded')) OR status IS NULL)");
    });

    it('should escape values with single quotes', () => {
      const filter = buildFilter({
        type: 'one_of',
        field: 'author',
        selectedValues: ["O'Reilly", "D'Angelo"]
      });

      expect(filter.toSQL(dialect)).toBe("author IN ('O''Reilly', 'D''Angelo')");
    });

    it('should return null for empty selection', () => {
      const filter = buildFilter({
        type: 'one_of',
        field: 'category',
        selectedValues: []
      });

      expect(filter.toSQL(dialect)).toBeNull();
    });
  });

  describe('UI Filters - DateRangeFilter', () => {
    it('should generate BETWEEN SQL for date ranges', () => {
      const filter = buildFilter({
        type: 'date_range',
        field: 'order_date',
        start: '2023-01-01',
        end: '2023-12-31'
      });

      expect(filter.toSQL(dialect)).toBe("order_date BETWEEN '2023-01-01' AND '2023-12-31'");
    });

    it('should quote field names with spaces using double quotes', () => {
      const filter = buildFilter({
        type: 'date_range',
        field: 'Order Date',
        start: '2023-01-01',
        end: '2023-12-31'
      });

      expect(filter.toSQL(dialect)).toBe('"Order Date" BETWEEN \'2023-01-01\' AND \'2023-12-31\'');
    });
  });

  describe('UI Filters - BetweenFilter', () => {
    it('should generate BETWEEN SQL for numeric ranges', () => {
      const filter = buildFilter({
        type: 'between',
        field: 'price',
        betweenStart: 10,
        betweenEnd: 100
      });

      expect(filter.toSQL(dialect)).toBe("price BETWEEN 10 AND 100");
    });

    it('should quote field names with special characters using double quotes', () => {
      const filter = buildFilter({
        type: 'between',
        field: 'Sales Amount',
        betweenStart: 1000,
        betweenEnd: 5000
      });

      expect(filter.toSQL(dialect)).toBe('"Sales Amount" BETWEEN 1000 AND 5000');
    });
  });

  describe('UI Filters - ContainsFilter', () => {
    it('should generate LIKE with wildcards', () => {
      const filter = buildFilter({
        type: 'contains',
        field: 'description',
        value: 'premium'
      });

      expect(filter.toSQL(dialect)).toBe("description LIKE '%premium%' ESCAPE '\\'");
    });

    it('should generate NOT LIKE when isNot is true', () => {
      const filter = buildFilter({
        type: 'contains',
        field: 'notes',
        value: 'test',
        isNot: true
      });

      expect(filter.toSQL(dialect)).toBe("(NOT (notes LIKE '%test%' ESCAPE '\\') OR notes IS NULL)");
    });

    it('should escape single quotes in value', () => {
      const filter = buildFilter({
        type: 'contains',
        field: 'text',
        value: "it's"
      });

      expect(filter.toSQL(dialect)).toBe("text LIKE '%it''s%' ESCAPE '\\'");
    });
  });

  describe('UI Filters - StartsWithFilter', () => {
    it('should generate LIKE with trailing wildcard', () => {
      const filter = buildFilter({
        type: 'starts_with',
        field: 'name',
        value: 'John'
      });

      expect(filter.toSQL(dialect)).toBe("name LIKE 'John%' ESCAPE '\\'");
    });

    it('should support NOT variant', () => {
      const filter = buildFilter({
        type: 'starts_with',
        field: 'email',
        value: 'test',
        isNot: true
      });

      expect(filter.toSQL(dialect)).toBe("(NOT (email LIKE 'test%' ESCAPE '\\') OR email IS NULL)");
    });
  });

  describe('UI Filters - EndsWithFilter', () => {
    it('should generate LIKE with leading wildcard', () => {
      const filter = buildFilter({
        type: 'ends_with',
        field: 'email',
        value: '@example.com'
      });

      expect(filter.toSQL(dialect)).toBe("email LIKE '%@example.com' ESCAPE '\\'");
    });

    it('should support NOT variant', () => {
      const filter = buildFilter({
        type: 'ends_with',
        field: 'filename',
        value: '.tmp',
        isNot: true
      });

      expect(filter.toSQL(dialect)).toBe("(NOT (filename LIKE '%.tmp' ESCAPE '\\') OR filename IS NULL)");
    });
  });

  describe('UI Filters - NullFilter', () => {
    it('should generate IS NULL', () => {
      const filter = buildFilter({
        type: 'null',
        field: 'deleted_at'
      });

      expect(filter.toSQL(dialect)).toBe("deleted_at IS NULL");
    });

    it('should generate IS NOT NULL when isNot is true', () => {
      const filter = buildFilter({
        type: 'null',
        field: 'email',
        isNot: true
      });

      expect(filter.toSQL(dialect)).toBe("email IS NOT NULL");
    });

    it('should quote field names with spaces using double quotes', () => {
      const filter = buildFilter({
        type: 'null',
        field: 'Last Login'
      });

      expect(filter.toSQL(dialect)).toBe('"Last Login" IS NULL');
    });
  });

  describe('UI Filters - Comparison Filters', () => {
    it('should generate greater than comparison', () => {
      const filter = buildFilter({
        type: 'greater',
        field: 'age',
        value: 18
      });

      expect(filter.toSQL(dialect)).toBe("age > 18");
    });

    it('should generate less than comparison', () => {
      const filter = buildFilter({
        type: 'less',
        field: 'age',
        value: 65
      });

      expect(filter.toSQL(dialect)).toBe("age < 65");
    });

    it('should generate >= comparison', () => {
      const filter = buildFilter({
        type: 'greater_equal',
        field: 'quantity',
        value: 10
      });

      expect(filter.toSQL(dialect)).toBe("quantity >= 10");
    });

    it('should generate <= comparison', () => {
      const filter = buildFilter({
        type: 'less_equal',
        field: 'discount',
        value: 0.5
      });

      expect(filter.toSQL(dialect)).toBe("discount <= 0.5");
    });
  });

  describe('UI Filters - SQL Injection Prevention', () => {
    it('should prevent injection through field names', () => {
      const maliciousField = "col'; DROP TABLE users--";

      const filter = buildFilter({
        type: 'equal',
        field: maliciousField,
        value: 'test'
      });

      const sql = filter.toSQL(dialect);
      expect(sql).toContain('"'); // Should use double quotes
      expect(sql).toBe(`"${maliciousField}" = 'test'`);
    });

    it('should prevent injection through filter values', () => {
      const maliciousValue = "' OR '1'='1";

      const filter = buildFilter({
        type: 'equal',
        field: 'username',
        value: maliciousValue
      });

      const sql = filter.toSQL(dialect);
      expect(sql).toBe("username = ''' OR ''1''=''1'"); // Quotes escaped
    });

    it('should prevent injection in IN clauses', () => {
      const filter = buildFilter({
        type: 'one_of',
        field: 'id',
        selectedValues: ["1' OR '1'='1", "2'; DROP TABLE--"]
      });

      const sql = filter.toSQL(dialect);
      expect(sql).toContain("''"); // Quotes escaped
      expect(sql).toMatch(/IN \('.*', '.*'\)/);
    });
  });

  // ==================== DRILLDOWN FILTER TESTS ====================

  describe('Drilldown Filters - buildWhereClause', () => {
    it('should build simple equality filter for string field', () => {
      const filters = [
        { field: 'status', value: 'active', typeName: 'utf8' }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      expect(whereClause).toBe("(status = 'active')");
    });

    it('should build equality filter for numeric field', () => {
      const filters = [
        { field: 'quantity', value: 100, typeName: 'int32' }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      expect(whereClause).toBe("(quantity = 100)");
    });

    it('should build equality filter for boolean field', () => {
      const filters = [
        { field: 'is_active', value: true, typeName: 'bool' }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      expect(whereClause).toBe("(is_active = TRUE)");
    });

    it('should build NULL filter', () => {
      const filters = [
        { field: 'deleted_at', value: null, typeName: null }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      expect(whereClause).toBe("deleted_at IS NULL");
    });

    it('should quote field names with spaces using double quotes', () => {
      const filters = [
        { field: 'Order Status', value: 'shipped', typeName: 'utf8' }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      expect(whereClause).toBe('("Order Status" = \'shipped\')');
    });

    it('should combine multiple filters with AND', () => {
      const filters = [
        { field: 'region', value: 'North', typeName: 'utf8' },
        { field: 'quantity', value: 100, typeName: 'int32' },
        { field: 'is_active', value: true, typeName: 'bool' }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      expect(whereClause).toBe("(region = 'North') AND (quantity = 100) AND (is_active = TRUE)");
    });

    it('should handle date filters using DuckDB DATE syntax', () => {
      const filters = [
        { field: 'order_date', value: '2023-01-15', typeName: 'date32' }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      expect(whereClause).toBe("(order_date = DATE '2023-01-15')");
    });

    it('should handle timestamp filters using EPOCH_MS', () => {
      const filters = [
        { field: 'created_at', value: 1609459200000, typeName: 'timestamp' }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      expect(whereClause).toBe("(created_at = EPOCH_MS(1609459200000))");
    });

    it('should handle bigint values', () => {
      const filters = [
        { field: 'user_id', value: 9223372036854775807n, typeName: 'int64' }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      expect(whereClause).toBe("(user_id = 9223372036854775807)");
    });

    it('should handle double/float values', () => {
      const filters = [
        { field: 'price', value: 99.99, typeName: 'double' }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      expect(whereClause).toBe("(price = 99.99)");
    });

    it('should escape single quotes in string values', () => {
      const filters = [
        { field: 'name', value: "O'Reilly", typeName: 'utf8' }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      expect(whereClause).toBe("(name = 'O''Reilly')");
    });

    it('should handle SQL injection attempts in drilldown filters', () => {
      const filters = [
        { field: 'username', value: "'; DROP TABLE users--", typeName: 'utf8' }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      expect(whereClause).toContain("''"); // Quotes should be escaped
      expect(whereClause).toBe("(username = '''; DROP TABLE users--')");
    });

    it('should handle empty filter array', () => {
      const whereClause = dialect.buildWhereClause([]);
      expect(whereClause).toBe('');
    });

    it('should handle filters with sqlExpr (custom expressions)', () => {
      const filters = [
        {
          field: 'custom',
          sqlExpr: 'UPPER(name)',
          value: 'JOHN',
          typeName: 'utf8'
        }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      expect(whereClause).toBe("(UPPER(name) = 'JOHN')");
    });

    it('should handle filters with sqlExpr and NULL value', () => {
      const filters = [
        {
          field: 'custom',
          sqlExpr: 'TRIM(name)',
          value: null,
          dtype: null
        }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      expect(whereClause).toBe("(TRIM(name)) IS NULL");
    });

    it('should handle filters with sqlExpr only (complete condition)', () => {
      const filters = [
        {
          field: 'custom',
          sqlExpr: 'price > 100 AND quantity < 50'
        }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      expect(whereClause).toBe("(price > 100 AND quantity < 50)");
    });
  });

  describe('Drilldown Filters - Complex Scenarios', () => {
    it('should handle mixed data types in drilldown', () => {
      const filters = [
        { field: 'status', value: 'active', typeName: 'utf8' },
        { field: 'quantity', value: 100, typeName: 'int32' },
        { field: 'price', value: 99.99, typeName: 'double' },
        { field: 'is_premium', value: true, typeName: 'bool' },
        { field: 'order_date', value: '2023-01-15', typeName: 'date32' }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      expect(whereClause).toContain("(status = 'active')");
      expect(whereClause).toContain("(quantity = 100)");
      expect(whereClause).toContain("(price = 99.99)");
      expect(whereClause).toContain("(is_premium = TRUE)");
      expect(whereClause).toContain("(order_date = DATE '2023-01-15')");
      expect(whereClause).toMatch(/AND/g); // Should have AND between filters
    });

    it('should handle drilldown with special characters in field names', () => {
      const filters = [
        { field: 'Product-Category', value: 'Electronics', typeName: 'utf8' },
        { field: 'Sales Amount', value: 1000, typeName: 'int32' }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      expect(whereClause).toContain('"Product-Category"');
      expect(whereClause).toContain('"Sales Amount"');
    });

    it('should handle drilldown with date conversion from unix timestamp', () => {
      const filters = [
        { field: 'event_date', value: 1609459200, typeName: 'date32' }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      // DuckDB uses CAST(EPOCH_MS() AS DATE) for numeric dates
      expect(whereClause).toContain('CAST(EPOCH_MS(');
      expect(whereClause).toContain('AS DATE)');
    });

    it('should handle timestamp with bigint milliseconds', () => {
      const filters = [
        { field: 'event_time', value: 1609459200000n, typeName: 'timestamp' }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      // Should convert bigint to number and use EPOCH_MS
      expect(whereClause).toContain('EPOCH_MS(');
    });
  });

  describe('DuckDB-Specific Data Type Conversions', () => {
    it('should handle EPOCH_MS for timestamp data type', () => {
      const filters = [
        { field: 'created_at', value: 1672531200000, typeName: 'timestamp' }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      expect(whereClause).toBe("(created_at = EPOCH_MS(1672531200000))");
    });

    it('should handle DATE literal for date strings', () => {
      const filters = [
        { field: 'order_date', value: '2023-06-15', typeName: 'date32' }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      expect(whereClause).toBe("(order_date = DATE '2023-06-15')");
    });

    it('should handle CAST(EPOCH_MS AS DATE) for numeric dates', () => {
      const filters = [
        { field: 'signup_date', value: 1672531200000, typeName: 'date32' }
      ];

      const whereClause = dialect.buildWhereClause(filters);
      expect(whereClause).toContain('CAST(EPOCH_MS(1672531200000) AS DATE)');
    });
  });
});
