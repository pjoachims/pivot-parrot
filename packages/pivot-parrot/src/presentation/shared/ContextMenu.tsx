import React, { useRef } from 'react';
import { useClickOutside } from './useClickOutside';
import { useFixedPosition } from './useFixedPosition';
import { Icon } from './Icon';

/**
 * ContextMenu Component
 * Simple context menu that appears at mouse position
 */
export function ContextMenu({ x, y, onClose, onDrilldown }) {
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, onClose);
  useFixedPosition(menuRef, x, y);

  return (
    <div
      ref={menuRef}
      role="menu"
      className="pivot-context-menu pp-menu"
      style={{ position: 'fixed', left: `${x}px`, top: `${y}px`, zIndex: 'var(--z-popover)' as any }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        role="menuitem"
        onClick={() => {
          onDrilldown();
          onClose();
        }}
        className="pp-menu-item"
      >
        <Icon name="table" />
        Drilldown
      </button>
    </div>
  );
}
