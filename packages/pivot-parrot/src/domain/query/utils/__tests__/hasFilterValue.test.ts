import { it, expect } from 'vitest';
import { hasFilterValue } from '../../sql/filters';
import { serializeConfig, deserializeConfig } from '../serialization';

const last30Days = { mode: 'last', n: 30, unit: 'day' } as const;

it.each([
  ['a relative date', { relative: last30Days }, true],
  ['a value', { value: 0 }, true],
  ['selected values', { selectedValues: ['a'] }, true],
  ['both ends of a range', { betweenStart: 1, betweenEnd: 2 }, true],
  ['nothing yet', {}, false],
  ['an empty value', { value: '' }, false],
  ['no selected values', { selectedValues: [] }, false],
  ['one end of a range', { betweenStart: 1 }, false],
])('a filter with %s has a value: %s', (_label, filter, expected) => {
  expect(hasFilterValue(filter as any)).toBe(expected);
});

it('a relative date filter survives serialization', () => {
  const filter = { field: 'date', type: 'relative_date', relative: last30Days, isNot: true };
  const config = { rows: [], columns: [], values: [], filters: [filter] };
  const back = deserializeConfig(JSON.parse(JSON.stringify(serializeConfig(config))));
  expect(back.config.filters[0]).toEqual(filter);
});
