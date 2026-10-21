import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Pivot } from '../Pivot';
import { RemoteDataEngine } from '../../../infrastructure/data-engines/RemoteDataEngine';
import { DuckDBDialect } from '../../../domain/query/dialects/DuckDBDialect';

const schema = [{ name: 'region', type: 'VARCHAR' }, { name: 'sales', type: 'INTEGER' }];
const view = { rows: ['region'], columns: [], values: [{ field: 'sales', aggregation: 'Sum' }], filters: [] };
const PLAYGROUND_SQL = 'SELECT region FROM pivot_data';

/** A host backend that, like a guarded server, answers the pivot query and rejects anything but SELECT. */
function remote() {
  const executeQuery = vi.fn(async (request: any) => {
    if (!/^\s*select/i.test(request.sql)) throw new Error('Only SELECT is allowed');
    if (request.sql === PLAYGROUND_SQL) return { rows: [{ region: 'North' }, { region: 'South' }], schema: null };
    return { rows: [{ region: 'North', _grouping_region: 0, sum_sales: 1 }], schema: null };
  });
  return { executeQuery, engine: new RemoteDataEngine({ dialect: 'duckdb', schema, executeQuery }) };
}

function local() {
  const dialect = new DuckDBDialect();
  const engine: any = {
    executeQuery: vi.fn(async () => ({ data: [{ region: 'x', _grouping_region: 0, sum_sales: 1 }], dtypes: {}, rowCount: 1 })),
    loadCSV: vi.fn(async () => {}),
    init: async () => {},
    getAvailableFields: async () => schema.map(c => ({ id: c.name, name: c.name, kind: 'base_field', dtype: c.name === 'sales' ? 'int32' : 'string' })),
    getSchema: async () => schema,
    detectFieldTypes: () => ({ region: 'string', sales: 'int32' }),
    getDialect: () => dialect,
    subscribeToQueries: () => () => {},
    getCurrentQuery: () => null
  };
  return engine;
}

const settle = (ms = 150) => act(async () => { await new Promise(res => setTimeout(res, ms)); });

const remoteConfig = (key: string, engine: any, settings: Record<string, unknown> = {}) =>
  ({ instanceKey: key, mode: 'remote', dataEngine: engine, initialConfig: view, settings: { autoUpdate: true, ...settings } }) as any;

async function runInPlayground(sql: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'SQL Playground' }));
  const editor = await screen.findByLabelText('SQL query');
  fireEvent.change(editor, { target: { value: sql } });
  fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true });
  await settle();
  return screen.getByRole('status').textContent;
}

it('remote mode with enableSQLPlayground: true runs playground SQL through the host executeQuery', async () => {
  const { engine, executeQuery } = remote();
  render(<Pivot config={remoteConfig('sql-remote-on', engine, { enableSQLPlayground: true })} />);
  await settle();

  const status = await runInPlayground(PLAYGROUND_SQL);

  expect(executeQuery.mock.calls.map(([request]) => request.sql)).toContain(PLAYGROUND_SQL);
  expect(status).toMatch(/^2 rows · \d+ ms/);
});

it('remote mode shows the host rejecting a query in the playground status line', async () => {
  const { engine } = remote();
  render(<Pivot config={remoteConfig('sql-remote-reject', engine, { enableSQLPlayground: true })} />);
  await settle();

  const status = await runInPlayground('DELETE FROM pivot_data');

  expect(status).toContain('Only SELECT is allowed');
});

it('remote mode without the setting has no SQL Playground', async () => {
  const { engine } = remote();
  render(<Pivot config={remoteConfig('sql-remote-default', engine)} />);
  await settle();

  expect(screen.getByRole('button', { name: 'Create chart' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'SQL Playground' })).toBeNull();
});

it('local mode keeps the SQL Playground on by default', async () => {
  const engine = local();
  render(<Pivot config={{ instanceKey: 'sql-local-default', mode: 'local', dataEngine: engine, data: [{ region: 'a', sales: 1 }], initialConfig: view, settings: { autoUpdate: true } } as any} />);
  await settle();

  expect(screen.getByRole('button', { name: 'SQL Playground' })).toBeTruthy();
});
