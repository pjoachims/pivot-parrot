import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { createPivotStore, PivotStoreContext } from '../../../../../application/state/store';
import FieldsList from '../FieldsList';
import { fromSchema } from '../../../../../domain/field/FieldItem';
import { DatabricksDialect } from '../../../../../domain/query/dialects/DatabricksDialect';

const schema = [
  { name: 'category_1', type: 'VARCHAR' },
  { name: 'category_2', type: 'VARCHAR' },
  { name: 'region', type: 'VARCHAR' },
  { name: 'order_date', type: 'DATE' },
  { name: 'is_promo', type: 'BOOLEAN' },
  { name: 'revenue', type: 'DOUBLE' },
  { name: 'article_id', type: 'BIGINT' }
];

describe('FieldsList - checkbox placement', () => {
  let store: any;

  beforeEach(() => {
    const detectedTypes = new DatabricksDialect().detectFieldTypes(schema);
    store = createPivotStore('checkbox-placement');
    act(() => {
      store.getState().setAvailableFields(
        schema.map(col => fromSchema({ name: col.name, type: detectedTypes[col.name], originalType: col.type }))
      );
      store.getState().setDetectedTypes(detectedTypes);
      store.getState().setConfig({
        rows: ['category_1'],
        columns: ['region'],
        values: [],
        filters: [],
        customMetrics: [{ id: 'margin', name: 'Margin', expr: 'SUM(revenue) * 0.1' }],
        customFilters: [{ id: 'big_orders', name: 'Big orders', expr: 'revenue > 100' }],
        customGroupings: [{ id: 'region_type', name: 'Region type', expr: "CASE WHEN region = 'N' THEN 'north' ELSE 'other' END" }]
      });
      store.getState().setSearchQuery('');
    });
    render(
      <PivotStoreContext.Provider value={{ store, instanceKey: 'checkbox-placement' }}>
        <FieldsList />
      </PivotStoreContext.Provider>
    );
  });

  const tick = (label: string) => fireEvent.click(screen.getByRole('checkbox', { name: label }));
  const config = () => store.getState().config;

  it.each(['category_2', 'order_date', 'is_promo'])('appends dimension %s to Rows, not Values', field => {
    tick(`Include ${field}`);

    expect(config().rows).toEqual(['category_1', field]);
    expect(config().values).toEqual([]);
  });

  it('puts a numeric field in Values with Sum', () => {
    tick('Include revenue');

    expect(config().values).toEqual([{ field: 'revenue', aggregation: 'Sum' }]);
    expect(config().rows).toEqual(['category_1']);
  });

  it('puts a custom metric in Values', () => {
    tick('Include Margin (custom metric)');

    expect(config().values).toEqual([{ field: 'margin', aggregation: 'custom', isCustom: true }]);
  });

  it('appends a custom grouping to Rows', () => {
    tick('Include Region type (custom grouping)');

    expect(config().rows).toEqual(['category_1', 'region_type']);
    expect(config().values).toEqual([]);
  });

  it('puts a custom filter in Filters', () => {
    tick('Include Big orders (custom filter)');

    expect(config().filters).toHaveLength(1);
    expect(config().filters[0]).toMatchObject({ field: 'big_orders', type: 'custom_filter', isCustom: true });
    expect(config().values).toEqual([]);
  });

  it('appends a second numeric field after the first in Values', () => {
    tick('Include revenue');
    tick('Include article_id');

    expect(config().values.map((v: any) => v.field)).toEqual(['revenue', 'article_id']);
  });
});
