import { describe, it, expect } from 'vitest';
import { buildHandleDrop } from '../actions';
import { FieldKind } from '../../../domain/models/types';

const available: any[] = [
  { id: 'region', kind: FieldKind.BASE_FIELD },
  { id: 'city', kind: FieldKind.BASE_FIELD },
  { id: 'shop', kind: FieldKind.BASE_FIELD },
  { id: 'sales', kind: FieldKind.BASE_FIELD }
];
const types = { sales: 'float64' };

function config(over: any = {}): any {
  return { rows: ['city'], columns: ['region'], values: [], filters: [], ...over };
}

describe('handleDrop keeps a dimension in one place', () => {
  it('moves a field already in columns when it is dropped from the list into rows', () => {
    const { config: c } = buildHandleDrop(config(), available, types)('region', 'available', 'rows', 1);
    expect(c.rows).toEqual(['city', 'region']);
    expect(c.columns).toEqual([]);
  });

  it('does not add a field to rows twice', () => {
    const { config: c } = buildHandleDrop(config(), available, types)('city', 'available', 'rows', 1);
    expect(c.rows).toEqual(['city']);
  });

  it('keyboard move from the list does not duplicate', () => {
    const { config: c } = buildHandleDrop(config(), available, types)('city', 'available', 'columns', null);
    expect(c.rows).toEqual([]);
    expect(c.columns).toEqual(['city', 'region']);
  });

  it('does not add an identical value twice, but allows another aggregation and a row field in Values', () => {
    const base = config({ rows: ['sales'], values: [{ field: 'sales', aggregation: 'Sum' }] });
    const drop = buildHandleDrop(base, available, types);
    expect(drop('sales', 'available', 'values', 1).config.values).toEqual([{ field: 'sales', aggregation: 'Sum' }]);
    expect(drop('sales', 'available', 'values', 1).config.rows).toEqual(['sales']);
  });

  it('keeps an existing filter when the field is dropped into Filters again', () => {
    const filter = { field: 'shop', type: 'in', values: ['A'] };
    const { config: c } = buildHandleDrop(config({ filters: [filter] }), available, types)('shop', 'available', 'filters', 1);
    expect(c.filters).toEqual([filter]);
  });
});
