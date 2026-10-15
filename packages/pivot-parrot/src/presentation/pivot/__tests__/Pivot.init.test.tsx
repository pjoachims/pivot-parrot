import React, { useState } from 'react';
import { it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { Pivot } from '../Pivot';
import { usePivotStore } from '../../../application/state/store';

function remoteEngine() {
  const base: any = {
    getAvailableFields: vi.fn(() => [
      { id: 'region', name: 'region', kind: 'base_field', dtype: 'utf8' },
      { id: 'city', name: 'city', kind: 'base_field', dtype: 'utf8' }
    ]),
    getDetectedTypes: vi.fn(() => ({ region: 'utf8', city: 'utf8' })),
    getDialect: () => null,
    executeQuery: vi.fn(async () => ({ rows: [] }))
  };
  // Every other engine method is a no-op.
  const engine = new Proxy(base, { get: (t, k) => (k in t ? t[k] : k === 'then' ? undefined : () => () => {}) });
  return { base, engine };
}

const settle = () => act(async () => { await new Promise(res => setTimeout(res, 50)); });

it('a parent re-render with an inline config neither refetches the schema nor resets the user edits', async () => {
  const { base, engine } = remoteEngine();
  const inlineConfig = (): any => ({
    instanceKey: 'init-rerender', mode: 'remote', dataEngine: engine,
    initialConfig: { rows: ['region'], columns: [], values: [], filters: [] },
    settings: { autoUpdate: false }
  });
  const store: any = {};
  function Probe() {
    store.config = usePivotStore(s => s.config);
    store.setConfig = usePivotStore(s => s.setConfig);
    return null;
  }

  const view = render(<Pivot config={inlineConfig()}><Probe /></Pivot>);
  await settle();
  expect(store.config.rows).toEqual(['region']);
  act(() => store.setConfig({ ...store.config, rows: ['city'] }));

  view.rerender(<Pivot config={inlineConfig()}><Probe /></Pivot>);
  view.rerender(<Pivot config={inlineConfig()}><Probe /></Pivot>);
  await settle();

  expect(base.getAvailableFields).toHaveBeenCalledTimes(1);
  expect(store.config.rows).toEqual(['city']);
});

it('a host that stores the config from onConfigChange does not loop', async () => {
  const { base, engine } = remoteEngine();
  const onConfigChange = vi.fn();
  function Host() {
    const [, setSaved] = useState<any>(null);
    return (
      <Pivot config={{
        instanceKey: 'init-host', mode: 'remote', dataEngine: engine,
        initialConfig: { rows: ['region'], columns: [], values: [], filters: [] },
        settings: { autoUpdate: false },
        callbacks: { onConfigChange: (c: any) => { onConfigChange(c); if (onConfigChange.mock.calls.length < 100) setSaved({ ...c }); } }
      } as any} />
    );
  }

  render(<Host />);
  await act(async () => { await new Promise(res => setTimeout(res, 300)); });

  expect(base.getAvailableFields).toHaveBeenCalledTimes(1);
  expect(onConfigChange.mock.calls.length).toBeLessThanOrEqual(3);
  expect(onConfigChange.mock.lastCall?.[0].rows).toEqual(['region']);
}, 10000);

it('a changed initialConfig loads the new view, an equal one keeps the user edits', async () => {
  const { engine } = remoteEngine();
  const cfg = (initialConfig: any): any => ({ instanceKey: 'init-changed', mode: 'remote', dataEngine: engine, initialConfig, settings: { autoUpdate: false } });
  const store: any = {};
  function Probe() {
    store.config = usePivotStore(s => s.config);
    store.setConfig = usePivotStore(s => s.setConfig);
    return null;
  }

  const view = render(<Pivot config={cfg({ rows: ['region'], columns: [], values: [], filters: [] })}><Probe /></Pivot>);
  await settle();
  act(() => store.setConfig({ ...store.config, rows: ['city'] }));

  view.rerender(<Pivot config={cfg({ rows: ['region'], columns: [], values: [], filters: [] })}><Probe /></Pivot>);
  await settle();
  expect(store.config.rows).toEqual(['city']);

  view.rerender(<Pivot config={cfg({ rows: [], columns: ['region'], values: [], filters: [], fieldNameOverrides: { region: 'Area' } })}><Probe /></Pivot>);
  await settle();
  expect(store.config.rows).toEqual([]);
  expect(store.config.columns).toEqual(['region']);
  expect(store.config.fieldNameOverrides).toEqual({ region: 'Area' });
});

it('a host that feeds onConfigChange back into initialConfig settles', async () => {
  const { engine } = remoteEngine();
  const onConfigChange = vi.fn();
  const store: any = {};
  function Probe() {
    store.config = usePivotStore(s => s.config);
    store.setConfig = usePivotStore(s => s.setConfig);
    return null;
  }
  function Host() {
    const [saved, setSaved] = useState<any>({ rows: ['region'], columns: [], values: [], filters: [] });
    return (
      <Pivot config={{
        instanceKey: 'init-feedback', mode: 'remote', dataEngine: engine, initialConfig: saved,
        settings: { autoUpdate: false },
        callbacks: { onConfigChange: (c: any) => { onConfigChange(c); if (onConfigChange.mock.calls.length < 100) setSaved({ ...c }); } }
      } as any}><Probe /></Pivot>
    );
  }

  render(<Host />);
  await settle();
  act(() => store.setConfig({ ...store.config, rows: ['city'] }));
  await act(async () => { await new Promise(res => setTimeout(res, 300)); });

  expect(store.config.rows).toEqual(['city']);
  expect(onConfigChange.mock.calls.length).toBeLessThanOrEqual(6);
}, 10000);
