import { it, expect } from 'vitest';
import JSZip from 'jszip';
import { serializeSnapshot, deserializeSnapshot } from '../serialize';
import type { SavedView } from '../../models/types';

const config = { rows: ['region'], columns: [], values: [{ field: 'sales', aggregation: 'sum' as const }], filters: [] };

const saved: SavedView = {
  id: 'srv-1',
  name: 'Q3 by region',
  createdAt: '2026-10-15T10:00:00.000Z',
  view: {
    v: 1,
    config: config as any,
    derivedFields: [],
    sortConfig: { valueKey: 'sum_sales', direction: 'asc' },
    activeView: 'drilldown',
    secondaryDisplayMode: 'split-right',
    chartConfig: null,
    splitPosition: 60,
    drilldownFilters: { region: 'Nord' }
  }
};

it('a saved view survives export and import', async () => {
  expect(await deserializeSnapshot(await serializeSnapshot(saved))).toEqual(saved);
});

it('an export from before saved views imports as a view, without its data', async () => {
  const legacy = new JSZip();
  legacy.file('config.json', JSON.stringify(config));
  legacy.file('meta.json', JSON.stringify({
    id: 'snapshot_1', name: 'old', timestamp: '2026-01-02T03:04:05.000Z', dtypes: { sum_sales: 'DOUBLE' },
    activeView: 'drilldown', secondaryDisplayMode: 'split-below', sortConfig: { valueKey: 'sum_sales', direction: 'asc' },
    sqlQuery: 'SELECT 42', splitPosition: 40
  }));
  legacy.file('cube.json', JSON.stringify([{ region: 'Nord', sum_sales: 1 }]));
  legacy.file('drilldown.json', JSON.stringify({ data: [{ region: 'Nord' }], filters: { region: 'Nord' }, sql: 'SELECT 1' }));
  expect(await deserializeSnapshot(await legacy.generateAsync({ type: 'blob' }))).toEqual({
    id: 'snapshot_1',
    name: 'old',
    createdAt: '2026-01-02T03:04:05.000Z',
    view: {
      v: 1, config, derivedFields: [], sortConfig: { valueKey: 'sum_sales', direction: 'asc' },
      activeView: 'drilldown', secondaryDisplayMode: 'split-below', chartConfig: null, splitPosition: 40,
      drilldownFilters: { region: 'Nord' }
    }
  });
});
