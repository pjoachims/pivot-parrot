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

describe('a field may be filtered while it sits in Rows or Columns; Rows and Columns hold it once between them', () => {
  it('keeps a row field in Rows when it is sent to Filters from the list, and opens its filter', () => {
    const result = buildHandleDrop(config({ rows: ['region'], columns: [] }), available, types)('region', 'available', 'filters', null);
    expect(result.config.rows).toEqual(['region']);
    expect(result.config.filters).toEqual([{ field: 'region', type: 'equal' }]);
    expect(result.shouldOpenFilterDialog).toBe(true);
  });

  it('keeps a column field in Columns when it is sent to Filters from the list', () => {
    const { config: c } = buildHandleDrop(config(), available, types)('region', 'available', 'filters', 0);
    expect(c.columns).toEqual(['region']);
    expect(c.filters.map((f: any) => f.field)).toEqual(['region']);
  });

  it('keeps the filter of a field sent to Rows or Columns, from the list or out of Filters', () => {
    const filter = { field: 'shop', type: 'in', values: ['A'] };
    const drop = buildHandleDrop(config({ filters: [filter] }), available, types);
    const fromList = drop('shop', 'available', 'rows', 1).config;
    expect(fromList.rows).toEqual(['city', 'shop']);
    expect(fromList.filters).toEqual([filter]);
    const toRows = drop('shop', 'filters', 'rows', 1, 0).config;
    expect(toRows.rows).toEqual(['city', 'shop']);
    expect(toRows.filters).toEqual([filter]);
    const toColumns = drop('shop', 'filters', 'columns', 0, 0).config;
    expect(toColumns.columns).toEqual(['shop', 'region']);
    expect(toColumns.filters).toEqual([filter]);
  });

  it('drops the filter when it is dragged out of Filters onto nothing', () => {
    const base = config({ filters: [{ field: 'shop', type: 'in', values: ['A'] }] });
    const { config: c } = buildHandleDrop(base, available, types)('shop', 'filters', null);
    expect(c.filters).toEqual([]);
  });

  it('moves a row field to Columns, keeping its filter', () => {
    const base = config({ rows: ['region'], columns: [], filters: [{ field: 'region', type: 'in', values: ['North'] }] });
    const { config: c } = buildHandleDrop(base, available, types)('region', 'available', 'columns', 0);
    expect(c.rows).toEqual([]);
    expect(c.columns).toEqual(['region']);
    expect(c.filters).toEqual([{ field: 'region', type: 'in', values: ['North'] }]);
  });

  it('keeps the field in Rows and Values when it is filtered too', () => {
    const base = config({ rows: ['sales'], columns: [], values: [{ field: 'sales', aggregation: 'Sum' }] });
    const { config: c } = buildHandleDrop(base, available, types)('sales', 'available', 'filters', 0);
    expect(c.rows).toEqual(['sales']);
    expect(c.values).toEqual([{ field: 'sales', aggregation: 'Sum' }]);
    expect(c.filters.map((f: any) => f.field)).toEqual(['sales']);
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

describe('a metric dropped on Rows or Columns lays the metrics out there', () => {
  const metrics: any[] = [
    ...available,
    { id: 'revenue', kind: FieldKind.CUSTOM_METRIC },
    { id: 'orders', kind: FieldKind.CUSTOM_METRIC }
  ];
  const revenue = { field: 'revenue', aggregation: 'custom', isCustom: true };
  const orders = { field: 'orders', aggregation: 'custom', isCustom: true };

  it('moves Σ Values to Rows when a metric is dragged from Values to Rows, keeping the metrics', () => {
    const base = config({ rows: ['city'], columns: ['region', 'Σ Values'], values: [revenue, orders] });
    const { config: c } = buildHandleDrop(base, metrics, types)('revenue', 'values', 'rows', 1, 0);
    expect(c.rows).toEqual(['city', 'Σ Values']);
    expect(c.columns).toEqual(['region']);
    expect(c.values).toEqual([revenue, orders]);
  });

  it('puts a single metric in Rows', () => {
    const base = config({ rows: ['city'], columns: [], values: [revenue] });
    const { config: c } = buildHandleDrop(base, metrics, types)('revenue', 'values', 'rows', 0, 0);
    expect(c.rows).toEqual(['Σ Values', 'city']);
    expect(c.values).toEqual([revenue]);
  });

  it('adds a metric from the field list to Values and lays the metrics out in Columns', () => {
    const base = config({ rows: ['city', 'Σ Values'], columns: ['region'], values: [revenue, orders] });
    const { config: c } = buildHandleDrop(base, metrics, types)('orders', 'available', 'columns', 0);
    expect(c.rows).toEqual(['city']);
    expect(c.columns).toEqual(['Σ Values', 'region']);
    expect(c.values).toEqual([revenue, orders]);
  });

  it('counts the drop position as seen when Σ Values moves within Rows', () => {
    const base = config({ rows: ['Σ Values', 'city', 'shop'], columns: [], values: [revenue, orders] });
    const { config: c } = buildHandleDrop(base, metrics, types)('revenue', 'values', 'rows', 3, 0);
    expect(c.rows).toEqual(['city', 'shop', 'Σ Values']);
  });

  it('a single metric in Rows stays there; Σ Values in Columns goes with the second metric', () => {
    const inRows = config({ rows: ['city', 'Σ Values'], columns: [], values: [revenue, orders] });
    const removedFromRows = buildHandleDrop(inRows, metrics, types)('orders', 'values', null, null, 1).config;
    expect(removedFromRows.rows).toEqual(['city', 'Σ Values']);
    const inColumns = config({ rows: ['city'], columns: ['Σ Values'], values: [revenue, orders] });
    const removedFromColumns = buildHandleDrop(inColumns, metrics, types)('orders', 'values', null, null, 1).config;
    expect(removedFromColumns.columns).toEqual([]);
    const lastGone = buildHandleDrop(removedFromRows, metrics, types)('revenue', 'values', null, null, 0).config;
    expect(lastGone.rows).toEqual(['city']);
  });

  it('does not put Σ Values into Values or Filters', () => {
    const base = config({ rows: ['city'], columns: ['Σ Values'], values: [revenue, orders] });
    const drop = buildHandleDrop(base, metrics, types);
    expect(drop('Σ Values', 'columns', 'values', 0).config).toBe(base);
    expect(drop('Σ Values', 'columns', 'filters', 0).config).toBe(base);
  });
});
