import React, { useRef } from 'react';
import { useClickOutside } from './useClickOutside';
import { useFixedPosition } from './useFixedPosition';

/**
 * Context menu for chevron expand/collapse buttons
 */
export function ChevronContextMenu({ x, y, onClose, onFoldLevel, onUnfoldLevel, onFoldAll, onUnfoldAll, levelName, isExpanded }) {
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, onClose);
  useFixedPosition(menuRef, x, y);

  React.useEffect(() => {
    const handleContextMenu = (e) => {
      e.preventDefault();
      onClose();
    };

    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [onClose]);

  const handleAction = (action) => {
    action();
    onClose();
  };

  const items: Array<[string, () => void] | null> = [
    [`Fold ${levelName}`, onFoldLevel],
    [`Unfold ${levelName}`, onUnfoldLevel],
    null,
    ['Fold all', onFoldAll],
    ['Unfold all', onUnfoldAll]
  ];

  return (
    <div
      ref={menuRef}
      role="menu"
      className="pivot-context-menu pp-menu"
      style={{ position: 'fixed', left: `${x}px`, top: `${y}px`, zIndex: 'var(--z-popover)' as any, minWidth: '180px' }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => item ? (
        <button key={item[0]} role="menuitem" className="pp-menu-item" onClick={() => handleAction(item[1])}>
          {item[0]}
        </button>
      ) : (
        <div key={`sep-${i}`} role="separator" style={{ height: '1px', background: 'var(--border-color-light)', margin: 'var(--space-1) 0' }} />
      ))}
    </div>
  );
}
