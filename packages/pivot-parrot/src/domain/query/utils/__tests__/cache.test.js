import { describe, it, expect } from 'vitest';
import { hashData, hashPivotConfig, getPivotConfigSignature } from '../cache';

describe('hashData', () => {
  it('returns a stable hash for identical data', () => {
    const data = [{ a: 1, b: 'x' }, { a: 2, b: 'y' }, { a: 3, b: 'z' }];
    expect(hashData(data)).toBe(hashData(data));
  });

  it('returns "empty" for empty/missing data', () => {
    expect(hashData([])).toBe('empty');
    expect(hashData(null)).toBe('empty');
  });

  it('detects changes to middle rows (regression: previously only sampled first/last row)', () => {
    const original = [
      { a: 1, b: 'x' },
      { a: 2, b: 'y' },
      { a: 3, b: 'z' }
    ];
    const changedMiddle = [
      { a: 1, b: 'x' },
      { a: 999, b: 'CHANGED' },
      { a: 3, b: 'z' }
    ];
    expect(hashData(original)).not.toBe(hashData(changedMiddle));
  });

  it('detects changes when row count and first/last row match but content differs', () => {
    const a = [
      { id: 1, val: 'first' },
      { id: 2, val: 'same-middle' },
      { id: 3, val: 'last' }
    ];
    const b = [
      { id: 1, val: 'first' },
      { id: 2, val: 'DIFFERENT-middle' },
      { id: 3, val: 'last' }
    ];
    expect(hashData(a)).not.toBe(hashData(b));
  });
});

describe('getPivotConfigSignature / hashPivotConfig', () => {
  it('is order-independent for dimensions across rows/columns', () => {
    const configA = { rows: ['region'], columns: ['date'], values: [{ field: 'sales', aggregation: 'sum' }] };
    const configB = { rows: ['date'], columns: ['region'], values: [{ field: 'sales', aggregation: 'sum' }] };
    expect(hashPivotConfig(configA)).toBe(hashPivotConfig(configB));
    expect(getPivotConfigSignature(configA)).toBe(getPivotConfigSignature(configB));
  });

  it('changes when filter values differ', () => {
    const base = { rows: ['region'], columns: [], values: [{ field: 'sales', aggregation: 'sum' }], filters: [] };
    const filtered = { ...base, filters: [{ field: 'region', type: 'equal', value: 'North' }] };
    expect(hashPivotConfig(base)).not.toBe(hashPivotConfig(filtered));
    expect(getPivotConfigSignature(base)).not.toBe(getPivotConfigSignature(filtered));
  });

  it('signature can be used to detect hash collisions on cache hit', () => {
    const configA = { rows: ['region'], columns: [], values: [{ field: 'sales', aggregation: 'sum' }] };
    const configB = { rows: ['region'], columns: [], values: [{ field: 'sales', aggregation: 'avg' }] };
    // Signatures must differ whenever configs differ (used for verify-on-hit)
    expect(getPivotConfigSignature(configA)).not.toBe(getPivotConfigSignature(configB));
  });
});
