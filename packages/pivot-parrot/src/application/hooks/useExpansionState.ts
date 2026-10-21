/**
 * Expansion state management hook
 * Consolidates all expand/collapse logic from PivotDisplay
 */

import { useState, useCallback } from 'react';
import { setLevelExpansion, expandAll, collapseAll, pruneExpanded } from '../utils/treeOperations';

interface TreeNode {
  children?: TreeNode[];
  [key: string]: any;
}

interface UseExpansionStateProps {
  data: { rowGroups: TreeNode[] };
}

export function useExpansionState({ data }: UseExpansionStateProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [prevRowGroups, setPrevRowGroups] = useState(data.rowGroups);
  if (prevRowGroups !== data.rowGroups) {
    setPrevRowGroups(data.rowGroups);
    setExpanded(prev => pruneExpanded(data.rowGroups, prev));
  }

  /**
   * Toggle a single node by its row key (see rowKey)
   */
  const toggle = useCallback((key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  /**
   * Fold all nodes at a specific depth
   */
  const foldLevel = useCallback((depth: number) => {
    const newExpanded = setLevelExpansion(data.rowGroups, expanded, depth, false);
    setExpanded(newExpanded);
  }, [data.rowGroups, expanded]);

  /**
   * Unfold all nodes at a specific depth
   */
  const unfoldLevel = useCallback((depth: number) => {
    const newExpanded = setLevelExpansion(data.rowGroups, expanded, depth, true);
    setExpanded(newExpanded);
  }, [data.rowGroups, expanded]);

  /**
   * Fold all nodes
   */
  const foldAll = useCallback(() => {
    setExpanded(collapseAll());
  }, []);

  /**
   * Unfold all nodes
   */
  const unfoldAll = useCallback(() => {
    const newExpanded = expandAll(data.rowGroups);
    setExpanded(newExpanded);
  }, [data.rowGroups]);

  return {
    expanded,
    toggle,
    foldLevel,
    unfoldLevel,
    foldAll,
    unfoldAll
  };
}
