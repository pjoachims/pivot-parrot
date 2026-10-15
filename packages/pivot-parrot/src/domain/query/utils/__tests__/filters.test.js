import { describe, it, expect, beforeEach } from 'vitest';
import { buildFilter } from '../../sql/filters';
import { SQLDialect } from '../../dialects/SQLDialect';

// Import classes through buildFilter since they're not exported directly
const DateRangeFilter = buildFilter({ type: 'date_range', field: 'test', start: '2023-01-01', end: '2023-12-31' }).constructor;
const OneOfFilter = buildFilter({ type: 'one_of', field: 'test', selectedValues: ['a'] }).constructor;
const BetweenFilter = buildFilter({ type: 'between', field: 'test', betweenStart: 1, betweenEnd: 10 }).constructor;
const EqualFilter = buildFilter({ type: 'equal', field: 'test', value: 'test' }).constructor;
const ContainsFilter = buildFilter({ type: 'contains', field: 'test', value: 'test' }).constructor;
const StartsWithFilter = buildFilter({ type: 'starts_with', field: 'test', value: 'test' }).constructor;
const EndsWithFilter = buildFilter({ type: 'ends_with', field: 'test', value: 'test' }).constructor;
const NullFilter = buildFilter({ type: 'null', field: 'test' }).constructor;
const GreaterFilter = buildFilter({ type: 'greater', field: 'test', value: 10 }).constructor;
const LessFilter = buildFilter({ type: 'less', field: 'test', value: 10 }).constructor;
const GreaterEqualFilter = buildFilter({ type: 'greater_equal', field: 'test', value: 10 }).constructor;
const LessEqualFilter = buildFilter({ type: 'less_equal', field: 'test', value: 10 }).constructor;

describe('Filter Classes', () => {
  let dialect;

  beforeEach(() => {
    dialect = new SQLDialect();
  });

  describe('DateRangeFilter', () => {
    it('should generate BETWEEN SQL for date ranges', () => {
      const filter = new DateRangeFilter({
        field: 'order_date',
        start: '2023-01-01',
        end: '2023-12-31'
      });

      expect(filter.toSQL(dialect)).toBe("order_date BETWEEN '2023-01-01' AND '2023-12-31'");
      expect(filter.getLabel()).toBe('2023-01-01 to 2023-12-31');
    });

    it('should support alternative betweenStart/betweenEnd naming', () => {
      const filter = new DateRangeFilter({
        field: 'date',
        betweenStart: '2024-01-01',
        betweenEnd: '2024-06-30'
      });

      expect(filter.toSQL(dialect)).toBe("date BETWEEN '2024-01-01' AND '2024-06-30'");
    });

    it('should quote field names with special characters', () => {
      const filter = new DateRangeFilter({
        field: 'Order Date',
        start: '2023-01-01',
        end: '2023-12-31'
      });

      expect(filter.toSQL(dialect)).toBe('"Order Date" BETWEEN \'2023-01-01\' AND \'2023-12-31\'');
    });

    it('should escape SQL injection attempts in values', () => {
      const filter = new DateRangeFilter({
        field: 'date',
        start: "2023-01-01'; DROP TABLE users--",
        end: '2023-12-31'
      });

      const sql = filter.toSQL(dialect);
      expect(sql).toContain("''"); // Single quotes should be escaped
      // The dangerous SQL is escaped and inside quotes, so it's safe
      expect(sql).toBe("date BETWEEN '2023-01-01''; DROP TABLE users--' AND '2023-12-31'");
    });
  });

  describe('OneOfFilter', () => {
    it('should generate IN clause for multiple values', () => {
      const filter = new OneOfFilter({
        field: 'region',
        selectedValues: ['North', 'South', 'East']
      });

      expect(filter.toSQL(dialect)).toBe("region IN ('North', 'South', 'East')");
      expect(filter.getLabel()).toBe('3 selected');
    });

    it('should generate NOT IN when isNot is true', () => {
      const filter = new OneOfFilter({
        field: 'status',
        selectedValues: ['cancelled', 'refunded'],
        isNot: true
      });

      expect(filter.toSQL(dialect)).toBe("status NOT IN ('cancelled', 'refunded')");
      expect(filter.getLabel()).toBe('NOT 2 selected');
    });

    it('should return null for empty selection', () => {
      const filter = new OneOfFilter({
        field: 'category',
        selectedValues: []
      });

      expect(filter.toSQL(dialect)).toBeNull();
    });

    it('should escape values with single quotes', () => {
      const filter = new OneOfFilter({
        field: 'name',
        selectedValues: ["O'Reilly", "D'Angelo"]
      });

      expect(filter.toSQL(dialect)).toBe("name IN ('O''Reilly', 'D''Angelo')");
    });

    it('should handle SQL injection in values', () => {
      const filter = new OneOfFilter({
        field: 'name',
        selectedValues: ["'; DROP TABLE users--", "normal"]
      });

      const sql = filter.toSQL(dialect);
      expect(sql).toContain("''"); // Quotes escaped
      expect(sql).toMatch(/IN \('.*', 'normal'\)/);
    });
  });

  describe('BetweenFilter', () => {
    it('should generate BETWEEN SQL for numeric ranges', () => {
      const filter = new BetweenFilter({
        field: 'price',
        betweenStart: 10,
        betweenEnd: 100
      });

      expect(filter.toSQL(dialect)).toBe("price BETWEEN 10 AND 100");
      expect(filter.getLabel()).toBe('10 - 100');
    });

    it('should quote field names properly', () => {
      const filter = new BetweenFilter({
        field: 'Sales Amount',
        betweenStart: 1000,
        betweenEnd: 5000
      });

      expect(filter.toSQL(dialect)).toBe('"Sales Amount" BETWEEN 1000 AND 5000');
    });
  });

  describe('EqualFilter', () => {
    it('should generate equality comparison', () => {
      const filter = new EqualFilter({
        field: 'status',
        value: 'active'
      });

      expect(filter.toSQL(dialect)).toBe("status = 'active'");
      expect(filter.getLabel()).toBe('= active');
    });

    it('should generate NOT equal when isNot is true', () => {
      const filter = new EqualFilter({
        field: 'status',
        value: 'deleted',
        isNot: true
      });

      expect(filter.toSQL(dialect)).toBe("NOT (status = 'deleted')");
      expect(filter.getLabel()).toBe('≠ deleted');
    });

    it('should escape single quotes in values', () => {
      const filter = new EqualFilter({
        field: 'name',
        value: "O'Brien"
      });

      expect(filter.toSQL(dialect)).toBe("name = 'O''Brien'");
    });
  });

  describe('ContainsFilter', () => {
    it('should generate LIKE with wildcards', () => {
      const filter = new ContainsFilter({
        field: 'description',
        value: 'premium'
      });

      expect(filter.toSQL(dialect)).toBe("description LIKE '%premium%' ESCAPE '\\'");
      expect(filter.getLabel()).toBe('contains "premium"');
    });

    it('should generate NOT LIKE when isNot is true', () => {
      const filter = new ContainsFilter({
        field: 'notes',
        value: 'test',
        isNot: true
      });

      expect(filter.toSQL(dialect)).toBe("notes NOT LIKE '%test%' ESCAPE '\\'");
      expect(filter.getLabel()).toBe('not contains "test"');
    });

    it('should escape SQL special characters in value', () => {
      const filter = new ContainsFilter({
        field: 'text',
        value: "it's"
      });

      expect(filter.toSQL(dialect)).toBe("text LIKE '%it''s%' ESCAPE '\\'");
    });

    it('should handle LIKE wildcards in user input', () => {
      // User wildcards are now escaped so they match literally
      const filter = new ContainsFilter({
        field: 'text',
        value: 'a%b_c'
      });

      // The % and _ in the value are escaped with backslash
      expect(filter.toSQL(dialect)).toBe("text LIKE '%a\\%b\\_c%' ESCAPE '\\'");
    });
  });

  describe('StartsWithFilter', () => {
    it('should generate LIKE with trailing wildcard', () => {
      const filter = new StartsWithFilter({
        field: 'name',
        value: 'John'
      });

      expect(filter.toSQL(dialect)).toBe("name LIKE 'John%' ESCAPE '\\'");
      expect(filter.getLabel()).toBe('starts with "John"');
    });

    it('should support NOT variant', () => {
      const filter = new StartsWithFilter({
        field: 'email',
        value: 'test',
        isNot: true
      });

      expect(filter.toSQL(dialect)).toBe("email NOT LIKE 'test%' ESCAPE '\\'");
    });
  });

  describe('EndsWithFilter', () => {
    it('should generate LIKE with leading wildcard', () => {
      const filter = new EndsWithFilter({
        field: 'email',
        value: '@example.com'
      });

      expect(filter.toSQL(dialect)).toBe("email LIKE '%@example.com' ESCAPE '\\'");
      expect(filter.getLabel()).toBe('ends with "@example.com"');
    });

    it('should support NOT variant', () => {
      const filter = new EndsWithFilter({
        field: 'filename',
        value: '.tmp',
        isNot: true
      });

      expect(filter.toSQL(dialect)).toBe("filename NOT LIKE '%.tmp' ESCAPE '\\'");
    });
  });

  describe('NullFilter', () => {
    it('should generate IS NULL', () => {
      const filter = new NullFilter({
        field: 'deleted_at'
      });

      expect(filter.toSQL(dialect)).toBe("deleted_at IS NULL");
      expect(filter.getLabel()).toBe('is null');
    });

    it('should generate IS NOT NULL when isNot is true', () => {
      const filter = new NullFilter({
        field: 'email',
        isNot: true
      });

      expect(filter.toSQL(dialect)).toBe("email IS NOT NULL");
      expect(filter.getLabel()).toBe('is not null');
    });

    it('should quote field names with spaces', () => {
      const filter = new NullFilter({
        field: 'Last Login'
      });

      expect(filter.toSQL(dialect)).toBe('"Last Login" IS NULL');
    });
  });

  describe('GreaterFilter', () => {
    it('should generate greater than comparison', () => {
      const filter = new GreaterFilter({
        field: 'age',
        value: 18
      });

      expect(filter.toSQL(dialect)).toBe("age > 18");
      expect(filter.getLabel()).toBe('> 18');
    });

    it('should support NOT variant', () => {
      const filter = new GreaterFilter({
        field: 'score',
        value: 100,
        isNot: true
      });

      expect(filter.toSQL(dialect)).toBe("NOT (score > 100)");
    });
  });

  describe('LessFilter', () => {
    it('should generate less than comparison', () => {
      const filter = new LessFilter({
        field: 'age',
        value: 65
      });

      expect(filter.toSQL(dialect)).toBe("age < 65");
      expect(filter.getLabel()).toBe('< 65');
    });
  });

  describe('GreaterEqualFilter', () => {
    it('should generate >= comparison', () => {
      const filter = new GreaterEqualFilter({
        field: 'quantity',
        value: 10
      });

      expect(filter.toSQL(dialect)).toBe("quantity >= 10");
      expect(filter.getLabel()).toBe('≥ 10');
    });
  });

  describe('LessEqualFilter', () => {
    it('should generate <= comparison', () => {
      const filter = new LessEqualFilter({
        field: 'discount',
        value: 0.5
      });

      expect(filter.toSQL(dialect)).toBe("discount <= 0.5");
      expect(filter.getLabel()).toBe('≤ 0.5');
    });
  });

  describe('buildFilter', () => {
    it('should create DateRangeFilter from plain object', () => {
      const obj = {
        type: 'date_range',
        field: 'date',
        start: '2023-01-01',
        end: '2023-12-31'
      };

      const filter = buildFilter(obj);
      expect(filter).toBeInstanceOf(DateRangeFilter);
      expect(filter.toSQL(dialect)).toBe("date BETWEEN '2023-01-01' AND '2023-12-31'");
    });

    it('should create OneOfFilter from plain object', () => {
      const obj = {
        type: 'one_of',
        field: 'category',
        selectedValues: ['A', 'B']
      };

      const filter = buildFilter(obj);
      expect(filter).toBeInstanceOf(OneOfFilter);
      expect(filter.toSQL(dialect)).toBe("category IN ('A', 'B')");
    });

    it('should create EqualFilter from plain object', () => {
      const obj = {
        type: 'equal',
        field: 'status',
        value: 'active'
      };

      const filter = buildFilter(obj);
      expect(filter).toBeInstanceOf(EqualFilter);
      expect(filter.toSQL(dialect)).toBe("status = 'active'");
    });

    it('should create NullFilter from plain object', () => {
      const obj = {
        type: 'null',
        field: 'deleted_at',
        isNot: true
      };

      const filter = buildFilter(obj);
      expect(filter).toBeInstanceOf(NullFilter);
      expect(filter.toSQL(dialect)).toBe("deleted_at IS NOT NULL");
    });

    it('should throw error for unknown filter type', () => {
      const obj = {
        type: 'unknown_filter',
        field: 'field'
      };

      expect(() => buildFilter(obj)).toThrow('Unknown filter type');
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should prevent injection through field names', () => {
      const maliciousField = "col'; DROP TABLE users--";

      const filter = new EqualFilter({
        field: maliciousField,
        value: 'test'
      });

      const sql = filter.toSQL(dialect);
      expect(sql).toContain(`"${maliciousField}"`); // Quoted, safe
      // The malicious content is inside quotes, making it a literal identifier name
      expect(sql).toBe(`"${maliciousField}" = 'test'`);
    });

    it('should prevent injection through filter values', () => {
      const maliciousValue = "' OR '1'='1";

      const filter = new EqualFilter({
        field: 'username',
        value: maliciousValue
      });

      const sql = filter.toSQL(dialect);
      expect(sql).toBe("username = ''' OR ''1''=''1'"); // Quotes escaped
    });

    it('should prevent injection in LIKE patterns', () => {
      const filter = new ContainsFilter({
        field: 'text',
        value: "'; DELETE FROM users--"
      });

      const sql = filter.toSQL(dialect);
      expect(sql).toContain("''"); // Quotes escaped
      expect(sql).toMatch(/LIKE '%.*%'/); // Proper structure maintained
    });

    it('should prevent injection in IN clauses', () => {
      const filter = new OneOfFilter({
        field: 'id',
        selectedValues: ["1' OR '1'='1", "2'; DROP TABLE--"]
      });

      const sql = filter.toSQL(dialect);
      // Each value should have its quotes escaped
      expect(sql).toContain("''");
      expect(sql).toMatch(/IN \('.*', '.*'\)/);
    });
  });
});
