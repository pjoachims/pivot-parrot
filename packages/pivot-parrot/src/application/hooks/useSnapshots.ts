import { useEffect, useRef, useState } from 'react';
import type { PivotView, SavedView, SnapshotStore } from '../../domain/models/types';
import { createMemorySnapshotStore } from '../../domain/snapshot/memoryStore';
import { toPlainJSON } from '../../domain/snapshot/json';

/**
 * The saved views of one pivot, kept in `store` (the host's) or in memory.
 * A failing store call leaves the list as it was and sets `error`; it never throws.
 */
export function useSnapshots(store?: SnapshotStore | null) {
  const [memoryStore] = useState(createMemorySnapshotStore);
  // Hosts often pass the store inline, a new object every render: read the latest
  // one when called instead of re-listing whenever its identity changes.
  const storeRef = useRef<SnapshotStore>(store ?? memoryStore);
  storeRef.current = store ?? memoryStore;

  const [snapshots, setSnapshots] = useState<SavedView[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function attempt<T>(action: string, call: () => Promise<T>): Promise<T | undefined> {
    try {
      const result = await call();
      setError(null);
      return result;
    } catch (err: any) {
      setError(`Could not ${action}: ${err?.message ?? err}`);
      return undefined;
    }
  }

  useEffect(() => {
    void attempt('load snapshots', () => storeRef.current.list()).then(list => {
      // A snapshot saved while the list was loading is not in it yet.
      if (list) setSnapshots(prev => [...list, ...prev.filter(s => !list.some(l => l.id === s.id))]);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function createSnapshot(name: string, view: PivotView): Promise<void> {
    const saved = await attempt('save snapshot', () => storeRef.current.save({ name, view: toPlainJSON(view) }));
    if (saved) setSnapshots(prev => [...prev.filter(s => s.id !== saved.id), saved]);
  }

  async function deleteSnapshot(id: string): Promise<void> {
    const done = await attempt('delete snapshot', async () => { await storeRef.current.remove(id); return true; });
    if (done) setSnapshots(prev => prev.filter(s => s.id !== id));
  }

  /** Imported views get new ids from the store, so importing twice keeps both copies. */
  async function importSnapshots(views: SavedView[]): Promise<void> {
    for (const { name, view } of views) {
      await createSnapshot(name, view);
    }
  }

  return {
    snapshots,
    error,
    createSnapshot,
    deleteSnapshot,
    importSnapshots
  };
}
