import { it, expect } from 'vitest';
import { updateCustomMetric } from '../fieldUtils';

const config = {
  customMetrics: [{ id: 'm1', name: 'Margin', expr: 'a / b', format: { type: 'percent', decimals: 1 } }]
};

it('clearing the format of a custom metric back to auto removes it', () => {
  const next = updateCustomMetric(config, 'm1', 'Margin', 'a / b', undefined, 'metric');
  expect(next.customMetrics[0]).toEqual({ id: 'm1', name: 'Margin', expr: 'a / b' });
});

it('a new format replaces the old one', () => {
  const next = updateCustomMetric(config, 'm1', 'Margin', 'a / b', { type: 'number', decimals: 0 }, 'metric');
  expect(next.customMetrics[0].format).toEqual({ type: 'number', decimals: 0 });
});
