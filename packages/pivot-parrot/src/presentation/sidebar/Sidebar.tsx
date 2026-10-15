import { Icon } from '../shared/Icon';
import React from 'react';

/**
 * Sidebar - Generic sidebar container with 3 sections
 * Handles layout, collapse state, and drag-and-drop container logic
 */
interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  children: React.ReactNode;
}

export function Sidebar({ isCollapsed, onToggleCollapse, onDrop, children }: SidebarProps) {
  // Collapsed state UI
  if (isCollapsed) {
    return (
      <div
        style={{
          width: '40px',
          maxWidth: '40px',
          boxSizing: 'border-box',
          overflow: 'hidden',
          background: 'var(--surface-bg)',
          borderRight: '1px solid var(--border-color-light)',
          display: 'flex',
          alignItems: 'flex-start',
          paddingTop: '8px',
          borderBottom: 'none'
        }}
      >
        <button
          onClick={onToggleCollapse}
          className="pp-icon-btn"
          style={{ margin: '0 auto' }}
          title="Show sidebar"
          aria-label="Show sidebar"
        >
          <Icon name="menu" />
        </button>
      </div>
    );
  }

  // Handle drop outside zones
  const handleOutsideDrop = (e: React.DragEvent) => {
    if (onDrop) {
      onDrop(e);
    }
  };

  // Main expanded layout
  return (
    <div
      className="sidebar-container"
      style={{
        // Fixed: sized by its content, one long field name widened the whole
        // sidebar instead of truncating in its row or chip
        width: '320px',
        minWidth: 0,
        flexShrink: 0,
        maxWidth: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        borderRight: '1px solid var(--border-color-light)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-bg)'
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleOutsideDrop}
    >
      {children}
    </div>
  );
}
