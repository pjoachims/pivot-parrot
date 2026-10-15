import { describe, it, expect } from 'vitest';
import { buildHandleDrop } from '../actions';
import { FieldKind } from '../../../domain/models/types';
import { getFieldById } from '../../../domain/field/getFieldById';
import { fieldDisplayName } from '../../../domain/field/fieldDisplayName';

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

describe('an aggregation moved from Values to Filters stays one field', () => {
  const withQty = () => config({ values: [{ field: 'qty', aggregation: 'Sum' }] });
  const typesWithQty = { ...types, qty: 'int64' };

  it('is a HAVING filter the resolvers still know, by kind and by name', () => {
    const result = buildHandleDrop(withQty(), available, typesWithQty)('SUM_qty', 'values', 'filters', null, 0);
    expect(result.shouldOpenHavingDialog).toBe(true);
    expect(result.config.values).toEqual([]);
    expect(result.config.filters[0]).toMatchObject({ field: 'SUM_qty', sourceField: 'qty', aggregation: 'Sum', filterType: 'having' });

    const item = getFieldById('SUM_qty', available, result.config);
    expect(item).toMatchObject({ id: 'SUM_qty', kind: FieldKind.AGGREGATION, sourceField: 'qty', aggregation: 'Sum' });
    expect(fieldDisplayName('SUM_qty', result.config, available)).toBe('SUM(qty)');
  });

  it('moves back to Values as the same aggregation of the same column', () => {
    const inFilters = buildHandleDrop(withQty(), available, typesWithQty)('SUM_qty', 'values', 'filters', null, 0).config;
    const { config: back } = buildHandleDrop(inFilters, available, typesWithQty)('SUM_qty', 'filters', 'values', null);
    expect(back.values).toEqual([{ field: 'qty', aggregation: 'Sum' }]);
    expect(back.filters).toEqual([]);
  });
});
