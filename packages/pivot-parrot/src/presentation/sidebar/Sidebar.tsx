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
          className="pp-icon-btn-hover"
          style={{
            width: '28px',
            height: '28px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--surface-subtle)',
            border: '1px solid var(--border-color-light)',
            borderRadius: '4px',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            transition: 'all 0.2s',
            padding: 0
          }}
          title="Show sidebar"
          aria-label="Show sidebar"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
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
