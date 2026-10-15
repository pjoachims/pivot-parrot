import React, { useEffect, useId, useRef } from 'react';
import { useDialogA11y } from '../../shared/useDialogA11y';
import { useClickOutside } from '../../shared/useClickOutside';
import { useFixedPosition } from '../../shared/useFixedPosition';
import { Icon } from '../../shared/Icon';

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
export default function Popover({ children, onClose, title, position, width = 320 }: PopoverProps) {
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
      width: `${width}px`,
      maxHeight: `${window.innerHeight - 40}px`
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
    <div style={overlayStyle} className="pp-dialog-overlay">
      <div
        ref={dialogRef}
        style={getDialogStyle()}
        className="pp-dialog pp-dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title ? undefined : 'Dialog'}
        aria-labelledby={title ? titleId : undefined}
      >
        {title && (
          <div className="pp-dialog-header">
            <h3 id={titleId} className="pp-dialog-title">{title}</h3>
            <button onClick={onClose} className="pp-icon-btn" aria-label="Close dialog" title="Close">
              <Icon name="x" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.2)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 'var(--z-popover)' as any
};
