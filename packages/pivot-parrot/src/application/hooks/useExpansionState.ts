/**
 * Expansion state management hook
 * Consolidates all expand/collapse logic from PivotDisplay
 */

import { useState, useCallback } from 'react';
import { setLevelExpansion, expandAll, collapseAll, toggleFieldLevel, pruneExpanded } from '../utils/treeOperations';

interface TreeNode {
  children?: TreeNode[];
  [key: string]: any;
}

interface UseExpansionStateProps {
  data: { rowGroups: TreeNode[] };
  rowFields?: string[];
}

export function useExpansionState({ data, rowFields }: UseExpansionStateProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [fieldExpanded, setFieldExpanded] = useState<Record<string, boolean>>({});

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
   * Toggle all nodes at a specific field level
   */
  const toggleField = useCallback((fieldName: string) => {
    const isCurrentlyExpanded = fieldExpanded[fieldName] !== false;
    const newExpandedState = !isCurrentlyExpanded;

    setFieldExpanded(prev => ({ ...prev, [fieldName]: newExpandedState }));

    const fieldDepth = (rowFields || []).indexOf(fieldName);
    if (fieldDepth === -1) return;

    const newExpanded = toggleFieldLevel(data.rowGroups, expanded, fieldDepth, newExpandedState);
    setExpanded(newExpanded);
  }, [data.rowGroups, expanded, fieldExpanded, rowFields]);

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
    fieldExpanded,
    toggle,
    toggleField,
    foldLevel,
    unfoldLevel,
    foldAll,
    unfoldAll
  };
}
