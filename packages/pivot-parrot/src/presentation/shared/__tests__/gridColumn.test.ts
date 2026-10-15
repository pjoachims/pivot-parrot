import { it, expect } from 'vitest';
import { gridColumnDef } from '../gridColumn';
import { DuckDBDialect } from '../../../domain/query/dialects/DuckDBDialect';

const dialect = new DuckDBDialect();

/** What the grid shows for a raw cell: read through the valueGetter, then formatted. */
const cell = (typeName: string, raw: any, locale: string) => {
  const def = gridColumnDef('c', 'C', typeName, locale, dialect, () => raw);
  return def.valueFormatter({ value: def.valueGetter({ data: { __row: 0 } }) });
};

function decimal128(unscaled: bigint): Uint32Array {
  let v = unscaled < 0n ? unscaled + (1n << 128n) : unscaled;
  const out = new Uint32Array(4);
  for (let i = 0; i < 4; i++) { out[i] = Number(v & 0xffffffffn); v >>= 32n; }
  return out;
}

it('formats numeric grid cells in the locale, as the pivot table does', () => {
  expect(cell('double', 1234.5, 'de-DE')).toBe('1234,50');
  expect(cell('decimal<10,2>', 10.5, 'de-DE')).toBe('10,50');
  expect(cell('int64', 1234567, 'de-DE')).toBe('1234567');
  expect(cell('double', 1234.5, 'en-US')).toBe('1234.50');
  expect(cell('int64', 9007199254740993n, 'de-DE')).toBe('9007199254740993');
  expect(cell('decimal<10,2>', decimal128(1050n), 'de-DE')).toBe('10,50');
});

it('formats timestamps and dates in the locale', () => {
  const t = new Date(2024, 0, 31, 13, 5);
  expect(cell('timestamp', t, 'de-DE')).toBe(t.toLocaleString('de-DE'));
  expect(cell('date32', t, 'de-DE')).toBe('31.1.2024');
});

it('leaves text to the grid and empty numeric cells empty', () => {
  expect(gridColumnDef('c', 'C', 'string', 'de-DE', dialect, () => 'Köln').valueFormatter).toBeUndefined();
  expect(cell('double', null, 'de-DE')).toBe('');
});
