import { describe, it, expect } from 'vitest';
import { createFormatValue } from '../formatters';

const NBSP = ' ';

const customConfig = {
  values: [
    { field: 'm1', aggregation: 'custom', isCustom: true },
    { field: 'm2', aggregation: 'custom', isCustom: true },
    { field: 'm3', aggregation: 'custom', isCustom: true }
  ],
  customMetrics: [
    { id: 'm1', format: { type: 'number', decimals: 2 } },
    { id: 'm2', format: { type: 'percentage', decimals: 1 } },
    { id: 'm3', format: { type: 'currency', currency: 'EUR', decimals: 0 } }
  ]
};

describe('createFormatValue', () => {
  it('formats numbers without grouping in the configured locale', () => {
    const f = createFormatValue(customConfig, 'de-DE');
    expect(f(1234.5, 'm1')).toBe('1234,50');
  });

  it('formats percentages in the configured locale', () => {
    const f = createFormatValue(customConfig, 'de-DE');
    expect(f(0.1234, 'm2')).toBe(`12,3${NBSP}%`);
  });

  it('formats currencies in the configured locale', () => {
    const f = createFormatValue(customConfig, 'de-DE');
    expect(f(1234.5, 'm3')).toBe(`1.235${NBSP}€`);
  });

  it('keeps the en-US output for numbers and percentages', () => {
    const f = createFormatValue(customConfig, 'en-US');
    expect(f(1234.5, 'm1')).toBe('1234.50');
    expect(f(0.1234, 'm2')).toBe('12.3%');
    expect(f(1234.5, 'm3')).toBe('€1,235');
  });

  it('applies the default float format in the configured locale', () => {
    const dialect = { types: { double: { category: 'float' } } };
    const f = createFormatValue({ values: [] }, 'de-DE', { x: 'double' }, dialect);
    expect(f(1234.5, 'x')).toBe('1234,50');
  });

  it('finds the format of a regular value whose aggregation is capitalised', () => {
    const config = {
      values: [{ field: 'revenue', aggregation: 'Sum', format: { type: 'currency', currency: 'EUR', decimals: 2 } }]
    };
    const f = createFormatValue(config, 'de-DE');
    expect(f(1234.5, 'sum_revenue')).toBe(`1.234,50${NBSP}€`);
  });
});
