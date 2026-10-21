/**
 * Fitting a table under the column limit by folding column groups.
 *
 * The user's choices stay theirs: the groups they collapsed, and the groups
 * they opened while the table was folded to fit. What is folded to fit is
 * derived from those choices on every build and never stored, so a table that
 * fits again (after a filter, say) shows every group the user left open.
 */

import { columnPathKey } from '../../application/utils/cubeIndex';

export interface ColumnFolds {
  /** columnPathKey of each group the user collapsed */
  collapsed: string[];
  /** columnPathKey of each group the user opened */
  expanded: string[];
}

export type ColumnFit =
  /** `collapsed` holds the user's groups and `autoCollapsed`, the groups folded to fit */
  | { collapsed: string[]; autoCollapsed: string[]; columnCount: number }
  /** Too wide even with every group folded; `columnCount` is that narrowest table */
  | { error: true; columnCount: number };

type CountColumns = (collapsed: Set<string>) => number;

const prefixKeys = (path: unknown[]) => path.map((_, i) => columnPathKey(path.slice(0, i + 1)));

/** Whether a group with this path is hidden or folded by one of `collapsed`. */
const isFolded = (path: unknown[], collapsed: Set<string>) => prefixKeys(path).some(k => collapsed.has(k));

/**
 * The groups to fold so the table has at most `limit` columns. Folds whole
 * levels, deepest first, so the table stays regular: the first depth whose
 * groups, all folded, bring the table under the limit. Groups the user opened
 * stay open, with their ancestors, unless no depth fits with them open.
 */
export function fitColumns(groups: unknown[][], folds: ColumnFolds, limit: number, countColumns: CountColumns): ColumnFit {
  const own = new Set(folds.collapsed);
  const ownCount = countColumns(own);
  if (ownCount <= limit) return { collapsed: folds.collapsed, autoCollapsed: [], columnCount: ownCount };

  const opened = new Set(folds.expanded);
  const keptOpen = new Set(groups.filter(g => opened.has(columnPathKey(g))).flatMap(prefixKeys));
  const deepest = Math.max(0, ...groups.map(g => g.length));
  let narrowest = ownCount;
  for (const kept of [keptOpen, new Set<string>()]) {
    for (let depth = deepest; depth >= 1; depth--) {
      const folded = new Set(own);
      groups.forEach(g => {
        const k = columnPathKey(g);
        if (g.length >= depth && !kept.has(k)) folded.add(k);
      });
      // Only what still shows: a group inside a folded group is not folded on its own
      const visible = groups.filter(g => folded.has(columnPathKey(g)) && !isFolded(g.slice(0, -1), folded));
      const collapsed = new Set(visible.map(columnPathKey));
      const columnCount = countColumns(collapsed);
      narrowest = Math.min(narrowest, columnCount);
      if (columnCount <= limit) {
        return {
          collapsed: [...collapsed],
          autoCollapsed: [...collapsed].filter(k => !own.has(k)),
          columnCount
        };
      }
    }
  }
  return { error: true, columnCount: narrowest };
}

/** The user's choices once they open `group`. */
export function openGroup(folds: ColumnFolds, group: unknown[]): ColumnFolds {
  const key = columnPathKey(group);
  return {
    collapsed: folds.collapsed.filter(k => k !== key),
    expanded: folds.expanded.includes(key) ? folds.expanded : [...folds.expanded, key]
  };
}

/** The user's choices once they collapse `group`. */
export function closeGroup(folds: ColumnFolds, group: unknown[]): ColumnFolds {
  const key = columnPathKey(group);
  return {
    collapsed: folds.collapsed.includes(key) ? folds.collapsed : [...folds.collapsed, key],
    expanded: folds.expanded.filter(k => k !== key)
  };
}

/**
 * The user's choices once they open a folded `group`, or null when the table
 * cannot show it open without folding a group that shows open now. Groups
 * inside `group` may fold: they were hidden before.
 */
export function expandGroup(groups: unknown[][], folds: ColumnFolds, group: unknown[], limit: number, countColumns: CountColumns): ColumnFolds | null {
  const next = openGroup(folds, group);
  const after = fitColumns(groups, next, limit, countColumns);
  if ('error' in after) return null;
  const foldedAfter = new Set(after.collapsed);
  if (isFolded(group, foldedAfter)) return null;

  const before = fitColumns(groups, folds, limit, countColumns);
  const foldedBefore = new Set('error' in before ? [] : before.collapsed);
  const pathOf = new Map(groups.map(g => [columnPathKey(g), g]));
  const foldsAnOpenGroup = after.collapsed.some(k => {
    const path = pathOf.get(k);
    return path !== undefined && !isFolded(path, foldedBefore);
  });
  return foldsAnOpenGroup ? null : next;
}
