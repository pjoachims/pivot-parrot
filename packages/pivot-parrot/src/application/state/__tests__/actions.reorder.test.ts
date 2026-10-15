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

describe('handleDrop reorders within a zone', () => {
  const rows = { rows: ['region', 'city', 'shop'], columns: [] };

  it('moving down lands right after the drop target', () => {
    // DropZone reports index 2 for the lower half of `city`, counted with `region` still in the list
    const { config: c } = buildHandleDrop(config(rows), available, types)('region', 'rows', 'rows', 2, 0);
    expect(c.rows).toEqual(['city', 'region', 'shop']);
  });

  it('moving up is unchanged', () => {
    const { config: c } = buildHandleDrop(config(rows), available, types)('shop', 'rows', 'rows', 0, 2);
    expect(c.rows).toEqual(['shop', 'region', 'city']);
  });

  it('moving a value down lands right after the drop target', () => {
    const values = [
      { field: 'sales', aggregation: 'Sum' },
      { field: 'sales', aggregation: 'Avg' },
      { field: 'sales', aggregation: 'Max' }
    ];
    const { config: c } = buildHandleDrop(config({ values }), available, types)('SUM_sales', 'values', 'values', 2, 0);
    expect(c.values.map((v: any) => v.aggregation)).toEqual(['Avg', 'Sum', 'Max']);
  });

  it('moving a filter keeps its values', () => {
    const a = { field: 'shop', type: 'in', values: ['A'] };
    const b = { field: 'city', type: 'in', values: ['X'] };
    const { config: c } = buildHandleDrop(config({ filters: [a, b] }), available, types)('shop', 'filters', 'filters', 2);
    expect(c.filters).toEqual([b, a]);
  });
});
