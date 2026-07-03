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

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${x}px`,
    top: `${y}px`,
    background: 'var(--surface-bg)',
    border: '1px solid var(--border-color-light)',
    boxShadow: '0 10px 25px rgba(0,0,0,0.1), 0 4px 10px rgba(0,0,0,0.05)',
    borderRadius: '4px',
    padding: '4px',
    zIndex: 'var(--z-popover)' as any,
    minWidth: '180px',
    fontSize: '12px'
  };

  const menuItemStyle: React.CSSProperties = {
    padding: '6px 12px',
    cursor: 'pointer',
    borderRadius: '2px',
    transition: 'background 0.15s',
    color: 'var(--text-secondary)',
    fontWeight: '500',
    background: 'transparent'
  };

  const handleAction = (action) => {
    action();
    onClose();
  };

  return (
    <div ref={menuRef} className="pivot-context-menu" style={menuStyle} onClick={(e) => e.stopPropagation()}>
      <div
        className="pp-icon-btn-hover"
        style={menuItemStyle}
        onClick={() => handleAction(onFoldLevel)}
      >
        Fold {levelName}
      </div>
      <div
        className="pp-icon-btn-hover"
        style={menuItemStyle}
        onClick={() => handleAction(onUnfoldLevel)}
      >
        Unfold {levelName}
      </div>
      <div style={{ height: '1px', background: 'var(--border-color-light)', margin: '4px 0' }} />
      <div
        className="pp-icon-btn-hover"
        style={menuItemStyle}
        onClick={() => handleAction(onFoldAll)}
      >
        Fold all
      </div>
      <div
        className="pp-icon-btn-hover"
        style={menuItemStyle}
        onClick={() => handleAction(onUnfoldAll)}
      >
        Unfold all
      </div>
    </div>
  );
}
