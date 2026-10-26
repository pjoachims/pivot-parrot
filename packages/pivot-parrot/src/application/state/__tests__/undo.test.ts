import { describe, it, expect, beforeEach } from 'vitest';
import { createPivotStore } from '../store';

const base = { rows: ['city'], columns: [], values: [], filters: [], customMetrics: [], customFilters: [], customGroupings: [] };

describe('undo and redo of config changes', () => {
  beforeEach(() => localStorage.clear());

  it('undoes and redoes each config change, whichever action made it', () => {
    const store = createPivotStore('undo');
    store.getState().setConfig(base as any);
    store.getState().clearHistory();
    store.getState().handleDrop('region', 'available', 'columns', 0);
    store.getState().updateConfig({ rows: [] });

    store.getState().undo();
    expect(store.getState().config.rows).toEqual(['city']);
    expect(store.getState().config.columns).toEqual(['region']);
    store.getState().undo();
    expect(store.getState().config.columns).toEqual([]);
    store.getState().undo();
    expect(store.getState().config.rows).toEqual(['city']);

    store.getState().redo();
    store.getState().redo();
    expect(store.getState().config.rows).toEqual([]);
    expect(store.getState().config.columns).toEqual(['region']);
  });

  it('a new change drops the redo steps; a change to nothing is no step', () => {
    const store = createPivotStore('undo-2');
    store.getState().setConfig(base as any);
    store.getState().clearHistory();
    store.getState().updateConfig({ rows: [] });
    store.getState().undo();
    store.getState().updateConfig({ rows: ['city'] });
    expect(store.getState().configPast).toEqual([]);
    store.getState().updateConfig({ rows: ['shop'] });
    store.getState().undo();
    expect(store.getState().configFuture).toHaveLength(1);
    expect(store.getState().configPast).toHaveLength(0);
    store.getState().updateConfig({ columns: ['region'] });
    expect(store.getState().configFuture).toEqual([]);
  });

  it('closes an open filter dialog on undo', () => {
    const store = createPivotStore('undo-3');
    store.getState().setConfig(base as any);
    store.getState().updateConfig({ rows: [] });
    store.setState({ filterDialog: { field: { id: 'city' } as any, existingFilter: null, anchorFieldId: 'city' } });
    store.getState().undo();
    expect(store.getState().filterDialog).toBeNull();
  });
});
