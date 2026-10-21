import { useCallback, useEffect, useMemo } from 'react';
import { usePivotStore } from '../state/store';
import { columnPathKey } from '../utils/cubeIndex';

const NO_GROUPS: unknown[][] = [];

/**
 * Collapse state of column groups. `groups` are the member paths that can
 * collapse (columnConfig.groups), undefined while there is no data; a group's
 * depth is its path length.
 */
export function useColumnCollapse(groups: unknown[][] | undefined) {
  const collapsedColumns = usePivotStore((s) => s.collapsedColumns);
  const setCollapsedColumns = usePivotStore((s) => s.setCollapsedColumns);

  // Forget groups the data no longer has, so one does not come back collapsed later.
  useEffect(() => {
    if (!groups) return;
    const present = new Set(groups.map(columnPathKey));
    const kept = collapsedColumns.filter(key => present.has(key));
    if (kept.length !== collapsedColumns.length) setCollapsedColumns(kept);
  }, [groups, collapsedColumns, setCollapsedColumns]);
  const known = groups ?? NO_GROUPS;

  const collapsed = useMemo(() => new Set(collapsedColumns), [collapsedColumns]);
  const collapsible = useMemo(() => new Set(known.map(columnPathKey)), [known]);
  const keysAt = useCallback((depth: number) => known.filter(g => g.length === depth).map(columnPathKey), [known]);

  const toggle = useCallback((group: unknown[]) => {
    const key = columnPathKey(group);
    setCollapsedColumns(collapsed.has(key) ? collapsedColumns.filter(k => k !== key) : [...collapsedColumns, key]);
  }, [collapsed, collapsedColumns, setCollapsedColumns]);

  const foldLevel = useCallback((depth: number) => {
    setCollapsedColumns([...new Set([...collapsedColumns, ...keysAt(depth)])]);
  }, [collapsedColumns, keysAt, setCollapsedColumns]);

  const unfoldLevel = useCallback((depth: number) => {
    const level = new Set(keysAt(depth));
    setCollapsedColumns(collapsedColumns.filter(k => !level.has(k)));
  }, [collapsedColumns, keysAt, setCollapsedColumns]);

  const foldAll = useCallback(() => setCollapsedColumns([...collapsible]), [collapsible, setCollapsedColumns]);
  const unfoldAll = useCallback(() => setCollapsedColumns([]), [setCollapsedColumns]);

  return {
    canCollapse: (group: unknown[]) => collapsible.has(columnPathKey(group)),
    isCollapsed: (group: unknown[]) => collapsed.has(columnPathKey(group)),
    toggle,
    foldLevel,
    unfoldLevel,
    foldAll,
    unfoldAll
  };
}
