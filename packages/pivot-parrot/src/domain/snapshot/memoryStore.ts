import type { SavedView, SnapshotStore } from '../models/types';

/** The store a pivot uses when the host passes none: views last as long as the component. */
export function createMemorySnapshotStore(): SnapshotStore {
  let views: SavedView[] = [];
  let seq = 0;
  return {
    async list() {
      return views;
    },
    async save({ id, name, view }) {
      const saved: SavedView = {
        id: id ?? `snapshot_${Date.now()}_${++seq}`,
        name,
        createdAt: new Date().toISOString(),
        view
      };
      views = [...views.filter(v => v.id !== saved.id), saved];
      return saved;
    },
    async remove(id) {
      views = views.filter(v => v.id !== id);
    }
  };
}
