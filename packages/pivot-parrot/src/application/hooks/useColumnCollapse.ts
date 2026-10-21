import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePivotStore } from '../state/store';
import { columnPathKey } from '../utils/cubeIndex';
import { openGroup, closeGroup } from '../../domain/pivot/columnFit';
import type { ColumnFitView } from './usePivotDisplay';

const NO_GROUPS: unknown[][] = [];
const NO_KEYS: string[] = [];

/**
 * Collapse state of column groups. `groups` are the member paths that can
 * collapse (columnConfig.groups), undefined while there is no data; a group's
 * depth is its path length. `fit` is how the table was folded to fit the
 * column limit, when it was built with one.
 */
export function useColumnCollapse(groups: unknown[][] | undefined, fit?: ColumnFitView) {
  const collapsedColumns = usePivotStore((s) => s.collapsedColumns);
  const expandedColumns = usePivotStore((s) => s.expandedColumns);
  const setColumnFolds = usePivotStore((s) => s.setColumnFolds);
  // A refusal holds until the table is folded differently.
  const [refused, setRefused] = useState<{ group: unknown[]; fit: ColumnFitView } | null>(null);

  // Forget groups the data no longer has, so one does not come back collapsed or open later.
  useEffect(() => {
    if (!groups) return;
    const present = new Set(groups.map(columnPathKey));
    const collapsed = collapsedColumns.filter(key => present.has(key));
    const expanded = expandedColumns.filter(key => present.has(key));
    if (collapsed.length !== collapsedColumns.length || expanded.length !== expandedColumns.length) {
      setColumnFolds({ collapsed, expanded });
    }
  }, [groups, collapsedColumns, expandedColumns, setColumnFolds]);
  const known = groups ?? NO_GROUPS;

  const folds = useMemo(() => ({ collapsed: collapsedColumns, expanded: expandedColumns }), [collapsedColumns, expandedColumns]);
  const collapsed = useMemo(() => new Set(fit?.collapsed ?? collapsedColumns), [fit, collapsedColumns]);
  const collapsible = useMemo(() => new Set(known.map(columnPathKey)), [known]);
  const keysAt = useCallback((depth: number) => known.filter(g => g.length === depth).map(columnPathKey), [known]);

  const toggle = useCallback((group: unknown[]) => {
    if (!collapsed.has(columnPathKey(group))) {
      setColumnFolds(closeGroup(folds, group));
    } else if (!fit) {
      setColumnFolds(openGroup(folds, group));
    } else {
      const next = fit.expand(group);
      if (next) setColumnFolds(next);
      else setRefused({ group, fit });
    }
  }, [collapsed, fit, folds, setColumnFolds]);

  const foldLevel = useCallback((depth: number) => {
    const level = new Set(keysAt(depth));
    setColumnFolds({
      collapsed: [...new Set([...collapsedColumns, ...level])],
      expanded: expandedColumns.filter(k => !level.has(k))
    });
  }, [collapsedColumns, expandedColumns, keysAt, setColumnFolds]);

  // Clears only the user's collapses: groups folded to fit the column limit stay folded.
  const unfoldLevel = useCallback((depth: number) => {
    const level = new Set(keysAt(depth));
    setColumnFolds({ collapsed: collapsedColumns.filter(k => !level.has(k)), expanded: expandedColumns });
  }, [collapsedColumns, expandedColumns, keysAt, setColumnFolds]);

  const foldAll = useCallback(() => setColumnFolds({ collapsed: [...collapsible], expanded: [] }), [collapsible, setColumnFolds]);
  const unfoldAll = useCallback(() => setColumnFolds({ collapsed: [], expanded: [] }), [setColumnFolds]);

  return {
    canCollapse: (group: unknown[]) => collapsible.has(columnPathKey(group)),
    isCollapsed: (group: unknown[]) => collapsed.has(columnPathKey(group)),
    toggle,
    foldLevel,
    unfoldLevel,
    foldAll,
    unfoldAll,
    autoCollapsed: fit?.autoCollapsed ?? NO_KEYS,
    limit: fit?.limit,
    /** The group the user last tried to open while the table could not show it */
    refused: refused && refused.fit === fit ? refused.group : null
  };
}

export type ColumnCollapse = ReturnType<typeof useColumnCollapse>;
