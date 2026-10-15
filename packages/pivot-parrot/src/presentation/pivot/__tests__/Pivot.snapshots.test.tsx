import React from 'react';
import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pivot } from '../Pivot';
import type { SavedView, SnapshotStore } from '../../../domain/models/types';

function remoteEngine() {
  const base: any = {
    getAvailableFields: vi.fn(() => [{ id: 'region', name: 'region', kind: 'base_field', dtype: 'utf8' }]),
    getDetectedTypes: vi.fn(() => ({ region: 'utf8' })),
    getDialect: () => null,
    executeQuery: vi.fn(async () => ({ rows: [] }))
  };
  return new Proxy(base, { get: (t, k) => (k in t ? t[k] : k === 'then' ? undefined : () => () => {}) });
}

const saved: SavedView = {
  id: 'srv-1',
  name: 'Team view',
  createdAt: '2026-10-15T10:00:00.000Z',
  view: {
    v: 1, config: { rows: ['region'], columns: [], values: [], filters: [] }, derivedFields: [],
    sortConfig: { valueKey: null, direction: 'desc' }, activeView: null, secondaryDisplayMode: 'hidden',
    chartConfig: null, splitPosition: 50, drilldownFilters: null
  }
};

const pivotConfig = (instanceKey: string, snapshotStore: SnapshotStore): any => ({
  instanceKey, mode: 'remote', dataEngine: remoteEngine(), snapshotStore, settings: { autoUpdate: false }
});

it('a Pivot lists the snapshots of the host store in its Snapshots panel', async () => {
  const snapshotStore: SnapshotStore = { list: vi.fn(async () => [saved]), save: vi.fn(), remove: vi.fn() };
  render(<Pivot config={pivotConfig('snapshots-host', snapshotStore)} />);

  fireEvent.click(await screen.findByText('Snapshots (1)'));

  expect(screen.getByText('Team view')).toBeTruthy();
  expect(snapshotStore.list).toHaveBeenCalledTimes(1);
});

it('a Pivot shows a failing host store without the panel being opened', async () => {
  const snapshotStore: SnapshotStore = { list: vi.fn(async () => { throw new Error('401 Unauthorized'); }), save: vi.fn(), remove: vi.fn() };
  render(<Pivot config={pivotConfig('snapshots-host-error', snapshotStore)} />);

  expect((await screen.findByRole('alert')).textContent).toBe('Could not load snapshots: 401 Unauthorized');
});
