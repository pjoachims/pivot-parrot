import { describe, it, expect } from 'vitest';
import { formatExample } from '../validation';
import { createFormatValue } from '../../../../../application/utils/formatters';

const NBSP = ' ';

describe('formatExample', () => {
  it('previews in the configured locale', () => {
    expect(formatExample(1234.5678, 'currency', 0, 'EUR', true, 'de-DE')).toBe(`1.235${NBSP}€`);
    expect(formatExample(0.1234, 'percentage', 1, 'USD', false, 'de-DE')).toBe(`12,3${NBSP}%`);
    expect(formatExample(1234.5678, 'number', 2, 'USD', false, 'de-DE')).toBe('1234,57');
  });

  it('previews exactly what the table will show for the saved format', () => {
    const format = { type: 'currency' as const, currency: 'GBP', decimals: 2, useThousandSeparator: false };
    const table = createFormatValue({ values: [], customMetrics: [{ id: 'm', format }] }, 'en-US');
    expect(formatExample(1234.5678, 'currency', '2', 'GBP', false, 'en-US')).toBe(table(1234.5678, 'm'));
  });

  it('describes the auto format instead of formatting', () => {
    expect(formatExample(1234.5678, 'auto', 2, 'USD', false, 'de-DE')).toBe('Engine will decide based on data type');
  });
});
