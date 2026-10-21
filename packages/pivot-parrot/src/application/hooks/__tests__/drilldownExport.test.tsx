import React from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createPivotStore, PivotStoreContext } from '../../state/store';
import { useDrilldown } from '../useDrilldown';
import { adaptQueryResult } from '../../utils/columnarResult';
import { DuckDBDialect } from '../../../domain/query/dialects/DuckDBDialect';

afterEach(() => vi.restoreAllMocks());

function decimal128(unscaled: bigint): Uint32Array {
  let v = unscaled < 0n ? unscaled + (1n << 128n) : unscaled;
  const out = new Uint32Array(4);
  for (let i = 0; i < 4; i++) { out[i] = Number(v & 0xffffffffn); v >>= 32n; }
  return out;
}

it('the drilldown CSV decodes Arrow DECIMAL cells', async () => {
  let blob: Blob | undefined;
  URL.createObjectURL = vi.fn((b: Blob) => { blob = b; return 'blob:x'; }) as any;
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  const store = createPivotStore('drilldown-export-test');
  const wrapper = ({ children }: any) => (
    <PivotStoreContext.Provider value={{ store, instanceKey: 'drilldown-export-test' }}>{children}</PivotStoreContext.Provider>
  );
  const engine: any = { getDialect: () => new DuckDBDialect() };
  const { result } = renderHook(() => useDrilldown(engine, engine), { wrapper });
  const rows = adaptQueryResult({ data: [{ city: 'Köln', price: decimal128(1050n) }], dtypes: { city: 'string', price: 'decimal<10,2>' } });

  result.current.exportDrilldownCSV(rows, 'de-DE');

  const text = await new Promise<string>(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(blob!);
  });
  expect(text.replace(/^\uFEFF/, '')).toBe('city;price\nKöln;10,5');
});
