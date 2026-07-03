import { describe, it, expect } from 'vitest';
import { SQLDialect } from '../SQLDialect';

describe('SQLDialect', () => {
  let dialect;

  beforeEach(() => {
    dialect = new SQLDialect();
  });

  describe('quoteIdentifier', () => {
    it('should not quote simple alphanumeric identifiers', () => {
      expect(dialect.quoteIdentifier('column_name')).toBe('column_name');
      expect(dialect.quoteIdentifier('Column123')).toBe('Column123');
      expect(dialect.quoteIdentifier('_private')).toBe('_private');
    });

    it('should quote identifiers with spaces', () => {
      expect(dialect.quoteIdentifier('first name')).toBe('"first name"');
      expect(dialect.quoteIdentifier('Sales Amount')).toBe('"Sales Amount"');
    });

    it('should quote identifiers with special characters', () => {
      expect(dialect.quoteIdentifier('user@domain')).toBe('"user@domain"');
      expect(dialect.quoteIdentifier('item-id')).toBe('"item-id"');
      expect(dialect.quoteIdentifier('price$')).toBe('"price$"');
    });

    it('should quote identifiers starting with numbers', () => {
      expect(dialect.quoteIdentifier('2023_sales')).toBe('"2023_sales"');
      expect(dialect.quoteIdentifier('1st_quarter')).toBe('"1st_quarter"');
    });

    it('should handle potential SQL injection attempts', () => {
      expect(dialect.quoteIdentifier("'; DROP TABLE users--")).toBe("\"'; DROP TABLE users--\"");
      // Embedded double quote must be escaped (doubled), not passed through raw -
      // otherwise it breaks out of the quoted identifier and injects SQL.
      expect(dialect.quoteIdentifier('col"; DELETE FROM')).toBe('"col""; DELETE FROM"');
    });
  });

  describe('escapeValue', () => {
    it('should escape single quotes by doubling them', () => {
      expect(dialect.escapeValue("O'Reilly")).toBe("O''Reilly");
      expect(dialect.escapeValue("It's working")).toBe("It''s working");
    });

    it('should handle multiple single quotes', () => {
      expect(dialect.escapeValue("''")).toBe("''''");
      expect(dialect.escapeValue("a'b'c")).toBe("a''b''c");
    });

    it('should handle SQL injection attempts', () => {
      expect(dialect.escapeValue("' OR '1'='1")).toBe("'' OR ''1''=''1");
      expect(dialect.escapeValue("'; DROP TABLE users--")).toBe("''; DROP TABLE users--");
    });

    it('should convert non-string values to strings', () => {
      expect(dialect.escapeValue(123)).toBe('123');
      expect(dialect.escapeValue(true)).toBe('true');
      expect(dialect.escapeValue(null)).toBe('null');
    });

    it('should handle empty strings', () => {
      expect(dialect.escapeValue('')).toBe('');
    });
  });

  describe('types registry', () => {
    it('should have Arrow types registered', () => {
      expect(dialect.types).toBeDefined();
      expect(dialect.types.int64).toBeDefined();
      expect(dialect.types.int64.name).toBe('int64');
      expect(dialect.types.int64.isNumeric).toBe(true);
    });

    it('should have all standard Arrow types', () => {
      expect(dialect.types.utf8).toBeDefined();
      expect(dialect.types.double).toBeDefined();
      expect(dialect.types.timestamp).toBeDefined();
    });
  });

  describe('cast', () => {
    it('should generate CAST expressions', () => {
      expect(dialect.cast('price', 'double')).toBe('CAST(price AS DOUBLE)');
      expect(dialect.cast('date_str', 'timestamp')).toBe('CAST(date_str AS TIMESTAMP)');
    });

    it('should work with complex expressions', () => {
      expect(dialect.cast('SUM(amount)', 'bigint')).toBe('CAST(SUM(amount) AS BIGINT)');
    });
  });

  describe('getAggregation', () => {
    it('should generate standard aggregations', () => {
      expect(dialect.getAggregation('sum', 'amount')).toBe('SUM(amount)');
      expect(dialect.getAggregation('avg', 'price')).toBe('AVG(price)');
      expect(dialect.getAggregation('count', '*')).toBe('COUNT(*)');
      expect(dialect.getAggregation('min', 'date')).toBe('MIN(date)');
      expect(dialect.getAggregation('max', 'value')).toBe('MAX(value)');
    });

    it('should generate COUNT DISTINCT', () => {
      expect(dialect.getAggregation('count_distinct', 'user_id')).toBe('COUNT(DISTINCT user_id)');
    });

    it('should throw error for unsupported aggregations', () => {
      expect(() => dialect.getAggregation('median', 'value')).toThrow('not supported');
      expect(() => dialect.getAggregation('approx_count_distinct', 'id')).toThrow('not supported');
    });
  });

  describe('getFunction', () => {
    it('should generate EXTRACT function', () => {
      expect(dialect.getFunction('extract', 'year', 'date_col')).toBe('EXTRACT(YEAR FROM date_col)');
      expect(dialect.getFunction('extract', 'month', 'timestamp')).toBe('EXTRACT(MONTH FROM timestamp)');
    });

    it('should generate FLOOR function', () => {
      expect(dialect.getFunction('floor', '123.45')).toBe('FLOOR(123.45)');
    });

    it('should throw error for unsupported functions', () => {
      expect(() => dialect.getFunction('date_trunc', 'month', 'date')).toThrow('not supported');
    });
  });

  describe('formatDateColumn', () => {
    it('should cast date/timestamp to VARCHAR', () => {
      expect(dialect.formatDateColumn('date_col', 'date')).toBe('CAST(date_col AS VARCHAR)');
      expect(dialect.formatDateColumn('ts_col', 'timestamp')).toBe('CAST(ts_col AS VARCHAR)');
    });

    it('should return column as-is for non-date types', () => {
      expect(dialect.formatDateColumn('num_col', 'integer')).toBe('num_col');
      expect(dialect.formatDateColumn('str_col', 'varchar')).toBe('str_col');
    });
  });

  describe('supports', () => {
    it('should check aggregation support', () => {
      expect(dialect.supports('aggregation', 'sum')).toBe(true);
      expect(dialect.supports('aggregation', 'count_distinct')).toBe(true);
      expect(dialect.supports('aggregation', 'median')).toBe(false);
    });

    it('should check type support', () => {
      expect(dialect.supports('type', 'int64')).toBe(true);
      expect(dialect.supports('type', 'utf8')).toBe(true);
      expect(dialect.supports('type', 'json')).toBe(false);
    });

    it('should check function support', () => {
      expect(dialect.supports('function', 'extract')).toBe(true);
      expect(dialect.supports('function', 'floor')).toBe(true);
      expect(dialect.supports('function', 'date_trunc')).toBe(false);
    });

    it('should return false for unknown registry types', () => {
      expect(dialect.supports('unknown', 'anything')).toBe(false);
    });
  });

  describe('name', () => {
    it('should return generic as default name', () => {
      expect(dialect.name).toBe('generic');
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should safely handle malicious identifiers', () => {
      const malicious = [
        "col; DROP TABLE users--",
        "col' OR '1'='1",
        "col\"; SELECT * FROM passwords--",
        "../../../etc/passwd"
      ];

      malicious.forEach(input => {
        const quoted = dialect.quoteIdentifier(input);
        expect(quoted).toMatch(/^".*"$/); // Should be quoted
        // The malicious content is safe inside quotes - it becomes a literal string.
        // Embedded double quotes must be doubled (escaped), or they'd break out
        // of the quoted identifier - so compare against the escaped form.
        expect(quoted).toBe(`"${input.replace(/"/g, '""')}"`);
      });
    });

    it('should safely handle malicious values', () => {
      const malicious = [
        "'; DROP TABLE users--",
        "' OR '1'='1",
        "'; DELETE FROM records WHERE '1'='1"
      ];

      malicious.forEach(input => {
        const escaped = dialect.escapeValue(input);
        // All single quotes should be doubled
        const singleQuoteCount = (input.match(/'/g) || []).length;
        const escapedQuoteCount = (escaped.match(/''/g) || []).length;
        expect(escapedQuoteCount).toBe(singleQuoteCount);
      });
    });

    it('should generate safe SQL even with malicious inputs', () => {
      const field = "col'; DROP TABLE--";
      const value = "'; DELETE FROM users--";

      const quotedField = dialect.quoteIdentifier(field);
      const escapedValue = dialect.escapeValue(value);

      // Field should be quoted, making it safe
      expect(quotedField).toBe(`"col'; DROP TABLE--"`);

      // Value quotes should be escaped
      expect(escapedValue).toBe("''; DELETE FROM users--");

      // Combined in SQL should be safe
      const sql = `${quotedField} = '${escapedValue}'`;
      expect(sql).toBe(`"col'; DROP TABLE--" = '''; DELETE FROM users--'`);
    });
  });
});
