import { useState, useEffect, useCallback } from 'react';

type ViewType = 'chart' | 'drilldown' | 'sql' | null;
type DisplayMode = 'hidden' | 'full' | 'split-below' | 'split-right';

interface ViewState {
  mode: DisplayMode;
  position: number;
}

interface SavedViewStates {
  chart: ViewState;
  drilldown: ViewState;
  sql: ViewState;
}

/**
 * Custom hook to manage split pane resizing with draggable divider
 * Fixes memory leak by properly cleaning up event listeners
 */
export function useSplitPane(activeView: ViewType, secondaryDisplayMode: DisplayMode) {
  const [splitPosition, setSplitPosition] = useState<number>(50);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [savedViewStates, setSavedViewStates] = useState<SavedViewStates>({
    chart: { mode: 'split-below', position: 50 },
    drilldown: { mode: 'split-below', position: 50 },
    sql: { mode: 'split-below', position: 50 }
  });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const cursorStyle = secondaryDisplayMode === 'split-right' ? 'col-resize' : 'row-resize';
    document.body.style.cursor = cursorStyle;
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      if (secondaryDisplayMode === 'split-right') {
        const container = document.querySelector('.split-container');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const newPosition = ((e.clientX - rect.left) / rect.width) * 100;
        setSplitPosition(Math.min(Math.max(newPosition, 10), 90));
      } else if (secondaryDisplayMode === 'split-below') {
        const container = document.querySelector('.split-container');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const newPosition = ((e.clientY - rect.top) / rect.height) * 100;
        setSplitPosition(Math.min(Math.max(newPosition, 10), 90));
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      if (activeView) {
        setSavedViewStates(prev => ({
          ...prev,
          [activeView]: { mode: secondaryDisplayMode, position: splitPosition }
        }));
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // FIXED: Proper cleanup happens immediately when isDragging becomes false
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, secondaryDisplayMode, splitPosition, activeView]);

  return {
    splitPosition,
    setSplitPosition,
    isDragging,
    savedViewStates,
    setSavedViewStates,
    handleMouseDown
  };
}
