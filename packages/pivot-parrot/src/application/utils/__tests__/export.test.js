import { describe, it, expect } from 'vitest';
import { replaceIdsWithNames } from '../export';

describe('replaceIdsWithNames', () => {
  it('replaces every occurrence of an id, not just the first', () => {
    const header = 'region,region_total';
    const result = replaceIdsWithNames(header, [{ id: 'region', name: 'Region' }]);
    expect(result).toBe('Region,Region_total');
  });

  it('matches the longest id first so a short id cannot clobber a longer one', () => {
    const header = 'sum_total';
    const pairs = [
      { id: 'sum', name: 'SHOULD_NOT_MATCH' },
      { id: 'sum_total', name: 'Total' }
    ];
    expect(replaceIdsWithNames(header, pairs)).toBe('Total');
  });

  it('leaves the header unchanged when no ids match', () => {
    expect(replaceIdsWithNames('unrelated_column', [{ id: 'foo', name: 'Foo' }])).toBe('unrelated_column');
  });

  it('ignores pairs missing an id or name', () => {
    const header = 'field_a';
    const pairs = [{ id: 'field_a', name: '' }, { name: 'Nameless' }];
    expect(replaceIdsWithNames(header, pairs)).toBe('field_a');
  });
});
