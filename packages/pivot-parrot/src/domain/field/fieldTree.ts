/**
 * The field list as a tree: a field's `path` (folder names from the top,
 * e.g. ['Article', 'Category']) places it in nested folders. A field without
 * a path sits at the top level. Pure; the sidebar renders the result.
 */

export interface FieldFolder<L> {
  key: string;        // the path joined by PATH_SEP; '' for the root
  name: string;
  depth: number;      // 0 for the root's folders
  folders: FieldFolder<L>[];
  leaves: L[];
}

// Joins a path into a folder key: a control character no folder name holds,
// so a name may contain anything else, '/' included.
export const PATH_SEP = '\u001f';

/** A path from outside: an array of non-empty strings, else undefined. */
export function normalizePath(path: unknown): string[] | undefined {
  if (!Array.isArray(path)) return undefined;
  const segments = path
    .filter((s): s is string => typeof s === 'string')
    .map(s => s.trim())
    .filter(Boolean);
  return segments.length ? segments : undefined;
}

/**
 * Folders in order of first appearance, each level listing its folders
 * before its loose fields. Without any path the root holds every leaf in
 * input order, which is the flat list.
 */
export function buildFieldTree<L>(leaves: L[], pathOf: (leaf: L) => readonly string[] | undefined): FieldFolder<L> {
  const root: FieldFolder<L> = { key: '', name: '', depth: -1, folders: [], leaves: [] };
  const byKey = new Map<string, FieldFolder<L>>();
  for (const leaf of leaves) {
    let folder = root;
    for (const name of pathOf(leaf) ?? []) {
      const key = folder.key ? folder.key + PATH_SEP + name : name;
      let child = byKey.get(key);
      if (!child) {
        child = { key, name, depth: folder.depth + 1, folders: [], leaves: [] };
        byKey.set(key, child);
        folder.folders.push(child);
      }
      folder = child;
    }
    folder.leaves.push(leaf);
  }
  return root;
}

/** Whether a search query hits a field: any of its texts (name, id, folders). */
export function matchesSearch(query: string, texts: readonly string[]): boolean {
  const q = query.trim().toLowerCase();
  return !q || texts.some(t => t.toLowerCase().includes(q));
}
