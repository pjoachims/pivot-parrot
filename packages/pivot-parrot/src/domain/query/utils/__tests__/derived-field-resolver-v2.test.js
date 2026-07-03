import { describe, it, expect } from 'vitest';
import { resolveDerivedFieldsInExpressionV2, validateFieldReferences } from '../../../field/derived-field-resolver-v2';

describe('Derived Field Resolver V2 (Dependency Graph)', () => {
  describe('Basic Resolution', () => {
    it('should resolve simple field reference', () => {
      const lookup = {
        order_year: { sql: 'EXTRACT(YEAR FROM "order_date")' }
      };

      const result = resolveDerivedFieldsInExpressionV2('{{order_year}} >= 2023', lookup);
      expect(result).toBe('(EXTRACT(YEAR FROM "order_date")) >= 2023');
    });

    it('should resolve multiple references to same field', () => {
      const lookup = {
        order_year: { sql: 'EXTRACT(YEAR FROM "order_date")' }
      };

      const result = resolveDerivedFieldsInExpressionV2(
        '{{order_year}} >= 2023 AND {{order_year}} < 2024',
        lookup
      );

      expect(result).toBe(
        '(EXTRACT(YEAR FROM "order_date")) >= 2023 AND (EXTRACT(YEAR FROM "order_date")) < 2024'
      );
    });

    it('should resolve multiple different fields', () => {
      const lookup = {
        order_year: { sql: 'EXTRACT(YEAR FROM "order_date")' },
        customer_tier: { sql: 'customer_type' }
      };

      const result = resolveDerivedFieldsInExpressionV2(
        '{{order_year}} >= 2023 AND {{customer_tier}} = \'Premium\'',
        lookup
      );

      expect(result).toBe(
        '(EXTRACT(YEAR FROM "order_date")) >= 2023 AND (customer_type) = \'Premium\''
      );
    });
  });

  describe('Nested References', () => {
    it('should resolve two-level nesting (grouping -> derived field)', () => {
      const lookup = {
        order_year: { sql: 'EXTRACT(YEAR FROM "order_date")' },
        is_recent: { expr: '{{order_year}} >= 2023' }
      };

      const result = resolveDerivedFieldsInExpressionV2('{{is_recent}}', lookup);
      expect(result).toBe('((EXTRACT(YEAR FROM "order_date")) >= 2023)');
    });

    it('should resolve three-level nesting (grouping -> grouping -> derived field)', () => {
      const lookup = {
        order_year: { sql: 'EXTRACT(YEAR FROM "order_date")' },
        is_recent: { expr: '{{order_year}} >= 2023' },
        recent_and_high: { expr: '{{is_recent}} = 1 AND amount > 1000' }
      };

      const result = resolveDerivedFieldsInExpressionV2('{{recent_and_high}}', lookup);
      expect(result).toBe('(((EXTRACT(YEAR FROM "order_date")) >= 2023) = 1 AND amount > 1000)');
    });

    it('should resolve deep nesting (4+ levels)', () => {
      const lookup = {
        base: { sql: 'EXTRACT(YEAR FROM "created_at")' },
        level1: { expr: '{{base}} = 2023' },
        level2: { expr: '{{level1}} = 1' },
        level3: { expr: '{{level2}} = 1' },
        level4: { expr: 'CASE WHEN {{level3}} THEN \'New\' ELSE \'Old\' END' }
      };

      const result = resolveDerivedFieldsInExpressionV2('{{level4}}', lookup);
      expect(result).toContain('EXTRACT(YEAR FROM "created_at")');
      expect(result).not.toContain('{{');
    });
  });

  describe('Multiple References with Shared Dependencies', () => {
    it('should efficiently handle diamond dependency', () => {
      // Diamond: base -> A, base -> B, C -> A + B
      const lookup = {
        base: { sql: 'EXTRACT(YEAR FROM "date")' },
        grouping_a: { expr: '{{base}} >= 2023' },
        grouping_b: { expr: '{{base}} < 2025' },
        combined: { expr: '{{grouping_a}} AND {{grouping_b}}' }
      };

      const result = resolveDerivedFieldsInExpressionV2('{{combined}}', lookup);

      // Should contain the base field expression twice (once in each branch)
      const matches = result.match(/EXTRACT\(YEAR FROM "date"\)/g);
      expect(matches).toHaveLength(2);

      expect(result).toBe(
        '(((EXTRACT(YEAR FROM "date")) >= 2023) AND ((EXTRACT(YEAR FROM "date")) < 2025))'
      );
    });
  });

  describe('Circular Dependency Detection', () => {
    it('should detect direct circular dependency (A -> A)', () => {
      const lookup = {
        self_ref: { expr: '{{self_ref}} + 1' }
      };

      expect(() => {
        resolveDerivedFieldsInExpressionV2('{{self_ref}}', lookup);
      }).toThrow(/Circular dependency detected.*self_ref/);
    });

    it('should detect two-field circular dependency (A -> B -> A)', () => {
      const lookup = {
        field_a: { expr: '{{field_b}} + 1' },
        field_b: { expr: '{{field_a}} + 1' }
      };

      expect(() => {
        resolveDerivedFieldsInExpressionV2('{{field_a}}', lookup);
      }).toThrow(/Circular dependency detected/);
    });

    it('should detect three-field circular dependency (A -> B -> C -> A)', () => {
      const lookup = {
        field_a: { expr: '{{field_b}}' },
        field_b: { expr: '{{field_c}}' },
        field_c: { expr: '{{field_a}}' }
      };

      expect(() => {
        resolveDerivedFieldsInExpressionV2('{{field_a}}', lookup);
      }).toThrow(/Circular dependency detected/);
    });

    it('should provide clear error message with cycle path', () => {
      const lookup = {
        a: { expr: '{{b}}' },
        b: { expr: '{{c}}' },
        c: { expr: '{{a}}' }
      };

      try {
        resolveDerivedFieldsInExpressionV2('{{a}}', lookup);
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toContain('Circular dependency detected');
        expect(error.message).toContain('→'); // Should show cycle path
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty expression', () => {
      const result = resolveDerivedFieldsInExpressionV2('', {});
      expect(result).toBe('');
    });

    it('should handle null/undefined expression', () => {
      expect(resolveDerivedFieldsInExpressionV2(null, {})).toBe(null);
      expect(resolveDerivedFieldsInExpressionV2(undefined, {})).toBe(undefined);
    });

    it('should handle expression with no references', () => {
      const lookup = {
        field: { sql: 'some_column' }
      };

      const result = resolveDerivedFieldsInExpressionV2('amount > 1000', lookup);
      expect(result).toBe('amount > 1000');
    });

    it('should handle reference to non-existent field (treated as regular column)', () => {
      const lookup = {
        existing: { sql: 'EXTRACT(YEAR FROM "date")' }
      };

      const result = resolveDerivedFieldsInExpressionV2('{{existing}} AND {{unknown}}', lookup);

      // existing should be resolved, unknown left as-is (SQL engine will handle it)
      expect(result).toContain('EXTRACT(YEAR FROM "date")');
      expect(result).toContain('{{unknown}}'); // Left unresolved
    });

    it('should handle field IDs with special regex characters', () => {
      const lookup = {
        'field.with.dots': { sql: 'column_value' },
        'field_with_$pecial': { sql: 'special_column' }
      };

      const result = resolveDerivedFieldsInExpressionV2(
        '{{field.with.dots}} AND {{field_with_$pecial}}',
        lookup
      );

      expect(result).toBe('(column_value) AND (special_column)');
    });

    it('should prevent partial matching of similar field names', () => {
      const lookup = {
        timestamp: { sql: 'UNIX_TIMESTAMP("created")' },
        timestamp_5min: { sql: 'FLOOR(UNIX_TIMESTAMP("created") / 300) * 300' }
      };

      const result = resolveDerivedFieldsInExpressionV2('{{timestamp_5min}}', lookup);

      // Should use the full 5min expression, not partially match "timestamp"
      expect(result).toBe('(FLOOR(UNIX_TIMESTAMP("created") / 300) * 300)');
    });
  });

  describe('validateFieldReferences', () => {
    it('should validate valid references', () => {
      const lookup = {
        base: { sql: 'column' },
        derived: { expr: '{{base}} > 0' }
      };

      const validation = validateFieldReferences(lookup);
      expect(validation.valid).toBe(true);
      expect(validation.error).toBe(null);
      expect(validation.cycle).toBe(null);
    });

    it('should detect circular reference in validation', () => {
      const lookup = {
        a: { expr: '{{b}}' },
        b: { expr: '{{a}}' }
      };

      const validation = validateFieldReferences(lookup);
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Circular dependency');
      expect(validation.cycle).toBeTruthy();
    });
  });
});
