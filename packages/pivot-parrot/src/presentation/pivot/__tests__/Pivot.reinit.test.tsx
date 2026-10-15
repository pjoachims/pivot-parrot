import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { Pivot } from '../Pivot';
import { RemoteDataEngine } from '../../../infrastructure/data-engines/RemoteDataEngine';
import { DuckDBDialect } from '../../../domain/query/dialects/DuckDBDialect';

const schema = [{ name: 'region', type: 'VARCHAR' }, { name: 'sales', type: 'INTEGER' }];
const view = { rows: ['region'], columns: [], values: [{ field: 'sales', aggregation: 'Sum' }], filters: [] };

function remote(label: string) {
  const executeQuery = vi.fn(async () => ({ rows: [{ region: label, _grouping_region: 0, sum_sales: 1 }], schema: null }));
  return { executeQuery, engine: new RemoteDataEngine({ dialect: 'duckdb', schema, executeQuery }) };
}

/** A local engine that records what it was asked; the pivot query itself is a mock. */
function local() {
  const dialect = new DuckDBDialect();
  const executeQuery = vi.fn(async () => ({ data: [{ region: 'x', _grouping_region: 0, sum_sales: 1 }], dtypes: {}, rowCount: 1 }));
  const engine: any = {
    executeQuery,
    loadCSV: vi.fn(async () => {}),
    init: async () => {},
    getAvailableFields: async () => schema.map(c => ({ id: c.name, name: c.name, kind: 'base_field', dtype: c.name === 'sales' ? 'int32' : 'string' })),
    getSchema: async () => schema,
    detectFieldTypes: () => ({ region: 'string', sales: 'int32' }),
    getDialect: () => dialect,
    subscribeToQueries: () => () => {},
    getCurrentQuery: () => null
  };
  return { executeQuery, engine };
}

const settle = (ms = 150) => act(async () => { await new Promise(res => setTimeout(res, ms)); });

const remoteConfig = (key: string, engine: any) => ({ instanceKey: key, mode: 'remote', dataEngine: engine, initialConfig: view, settings: { autoUpdate: true } }) as any;

it('a new dataEngine is queried with the current view', async () => {
  const a = remote('A');
  const b = remote('B');
  const ui = render(<Pivot config={remoteConfig('swap-engine', a.engine)} />);
  await settle();
  expect(a.executeQuery).toHaveBeenCalledTimes(1);

  ui.rerender(<Pivot config={remoteConfig('swap-engine', b.engine)} />);
  await settle();
  expect(b.executeQuery).toHaveBeenCalledTimes(1);
  expect(b.executeQuery.mock.calls[0][0].sql).toContain('sum');
});

it('new data on the same engine re-runs the pivot, the same data does not', async () => {
  const { engine, executeQuery } = local();
  const cfg = (data: any) => ({ instanceKey: 'swap-data', mode: 'local', dataEngine: engine, data, initialConfig: view, settings: { autoUpdate: true } }) as any;
  const ui = render(<Pivot config={cfg([{ region: 'a', sales: 1 }])} />);
  await settle();
  expect(executeQuery).toHaveBeenCalledTimes(1);

  ui.rerender(<Pivot config={cfg([{ region: 'a', sales: 1 }])} />);
  await settle();
  expect(executeQuery).toHaveBeenCalledTimes(1);

  ui.rerender(<Pivot config={cfg([{ region: 'b', sales: 2 }])} />);
  await settle();
  expect(engine.loadCSV).toHaveBeenCalledTimes(2);
  expect(executeQuery).toHaveBeenCalledTimes(2);
});
