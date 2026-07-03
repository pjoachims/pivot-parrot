import React, { useRef } from 'react';
import { useClickOutside } from './useClickOutside';
import { useFixedPosition } from './useFixedPosition';

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
      className="pivot-context-menu"
      style={{
        position: 'fixed',
        left: `${x}px`,
        top: `${y}px`,
        backgroundColor: 'var(--surface-bg)',
        border: '1px solid var(--border-color-medium)',
        borderRadius: '6px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        zIndex: 'var(--z-popover)' as any,
        minWidth: '150px',
        padding: '4px 0'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => {
          onDrilldown();
          onClose();
        }}
        className="pp-icon-btn-hover"
        style={{
          width: '100%',
          padding: '8px 16px',
          border: 'none',
          background: 'transparent',
          textAlign: 'left',
          cursor: 'pointer',
          fontSize: '14px',
          color: 'var(--text-secondary)',
          transition: 'background-color 0.2s'
        }}
      >
        Drilldown
      </button>
    </div>
  );
}
