import { it, expect } from 'vitest';
import { gridColumnDef } from '../gridColumn';

const cell = (typeName: string, value: any, locale: string) =>
  gridColumnDef('c', 'C', typeName, locale, () => value).valueFormatter({ value });

it('formats numeric grid cells in the locale, as the pivot table does', () => {
  expect(cell('double', 1234.5, 'de-DE')).toBe('1234,50');
  expect(cell('decimal<10,2>', 10.5, 'de-DE')).toBe('10,50');
  expect(cell('int64', 1234567, 'de-DE')).toBe('1234567');
  expect(cell('double', 1234.5, 'en-US')).toBe('1234.50');
  expect(cell('int64', '9007199254740993', 'de-DE')).toBe('9007199254740993');
});

it('formats timestamps and dates in the locale', () => {
  const t = new Date(2024, 0, 31, 13, 5);
  expect(cell('timestamp', t, 'de-DE')).toBe(t.toLocaleString('de-DE'));
  expect(cell('date32', t, 'de-DE')).toBe('31.1.2024');
});

it('leaves text to the grid and empty numeric cells empty', () => {
  expect(gridColumnDef('c', 'C', 'string', 'de-DE', () => 'Köln').valueFormatter).toBeUndefined();
  expect(cell('double', null, 'de-DE')).toBe('');
});
