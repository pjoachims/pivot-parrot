/**
 * Expansion state management hook
 * Consolidates all expand/collapse logic from PivotDisplay
 */

import { useCallback, useEffect } from 'react';
import { setLevelExpansion, expandAll, collapseAll, pruneExpanded } from '../utils/treeOperations';
import { usePivotStore } from '../state/store';

interface TreeNode {
  children?: TreeNode[];
  [key: string]: any;
}

interface UseExpansionStateProps {
  data: { rowGroups: TreeNode[] };
}

export function useExpansionState({ data }: UseExpansionStateProps) {
  // In the store, so the sheet mode shows and changes the same open rows.
  const expanded = usePivotStore(s => s.expanded);
  const setExpanded = usePivotStore(s => s.setExpanded);
  const toggle = usePivotStore(s => s.toggleExpanded);

  useEffect(() => {
    setExpanded(pruneExpanded(data.rowGroups, expanded));
  }, [data.rowGroups]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Fold all nodes at a specific depth
   */
  const foldLevel = useCallback((depth: number) => {
    const newExpanded = setLevelExpansion(data.rowGroups, expanded, depth, false);
    setExpanded(newExpanded);
  }, [data.rowGroups, expanded, setExpanded]);

  /**
   * Unfold all nodes at a specific depth
   */
  const unfoldLevel = useCallback((depth: number) => {
    const newExpanded = setLevelExpansion(data.rowGroups, expanded, depth, true);
    setExpanded(newExpanded);
  }, [data.rowGroups, expanded, setExpanded]);

  /**
   * Fold all nodes
   */
  const foldAll = useCallback(() => {
    setExpanded(collapseAll());
  }, [setExpanded]);

  /**
   * Unfold all nodes
   */
  const unfoldAll = useCallback(() => {
    const newExpanded = expandAll(data.rowGroups);
    setExpanded(newExpanded);
  }, [data.rowGroups, setExpanded]);

  return {
    expanded,
    toggle,
    foldLevel,
    unfoldLevel,
    foldAll,
    unfoldAll
  };
}
