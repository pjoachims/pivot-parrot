import React, { useEffect, useId, useRef } from 'react';
import { useDialogA11y } from '../../shared/useDialogA11y';
import { useClickOutside } from '../../shared/useClickOutside';
import { useFixedPosition } from '../../shared/useFixedPosition';

interface PopoverProps {
  children: React.ReactNode;
  onClose: () => void;
  title?: string;
  position?: { x: number; y: number };
  width?: number;
}

/**
 * Shared minimal popover component
 */
export default function Popover({ children, onClose, title, position, width = 280 }: PopoverProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useClickOutside(dialogRef, onClose);
  useDialogA11y(dialogRef, onClose);
  // Pin to the requested viewport coordinates even when an embedding host
  // (e.g. JupyterLab) re-roots position:fixed; no-op without a position.
  useFixedPosition(dialogRef, position?.x ?? NaN, position?.y ?? NaN);

  // Adjust position after render to ensure it's fully visible. Shift by the
  // overflow amount (rather than assigning absolute viewport coordinates)
  // so the correction composes with useFixedPosition's re-rooting delta.
  useEffect(() => {
    if (dialogRef.current && position) {
      const el = dialogRef.current;
      const rect = el.getBoundingClientRect();

      if (rect.right > window.innerWidth) {
        const shift = Math.min(rect.right - window.innerWidth + 10, rect.left - 10);
        el.style.left = `${parseFloat(el.style.left) - shift}px`;
      }

      if (rect.bottom > window.innerHeight) {
        const shift = Math.min(rect.bottom - window.innerHeight + 10, rect.top - 10);
        el.style.top = `${parseFloat(el.style.top) - shift}px`;
      }
    }
  }, [position]);

  // Calculate position
  const getDialogStyle = () => {
    const baseStyle = {
      ...styles.dialog,
      width: `${width}px`,
      maxHeight: `${window.innerHeight - 40}px`,
      overflowY: 'auto' as const
    };

    if (!position) return baseStyle;

    // Position near click
    return {
      ...baseStyle,
      position: 'fixed' as const,
      left: `${position.x}px`,
      top: `${position.y}px`
    };
  };

  return (
    <div style={styles.overlay} className="pp-dialog-overlay">
      <div
        ref={dialogRef}
        style={getDialogStyle()}
        className="pp-dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title ? undefined : 'Dialog'}
        aria-labelledby={title ? titleId : undefined}
      >
        {title && (
          <div style={styles.header}>
            <h3 id={titleId} style={styles.title}>{title}</h3>
            <button onClick={onClose} style={styles.closeButton} aria-label="Close dialog" title="Close">×</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 'var(--z-popover)' as any
  },
  dialog: {
    background: 'var(--surface-bg)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-color-medium)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
  },
  header: {
    padding: '8px 10px',
    borderBottom: '1px solid var(--border-color-light)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  title: {
    margin: 0,
    fontSize: 'var(--text-sm)',
    fontWeight: 500,
    color: 'var(--text-secondary)'
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '16px',
    color: 'var(--text-disabled)',
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1
  }
};
