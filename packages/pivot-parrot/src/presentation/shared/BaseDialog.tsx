import React, { ReactNode, useId, useRef } from 'react';
import { useDialogA11y } from './useDialogA11y';
import { Icon } from './Icon';

interface BaseDialogProps {
  title: string;
  onClose: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  children: ReactNode;
  maxWidth?: string;
  showFooter?: boolean;
  showCancelButton?: boolean;
  cancelLabel?: string;
}

export default function BaseDialog({
  title,
  onClose,
  onSubmit,
  submitLabel = 'Save',
  submitDisabled = false,
  children,
  maxWidth = '480px',
  showFooter = true,
  showCancelButton = false,
  cancelLabel = 'Cancel'
}: BaseDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef, onClose);

  return (
    <div style={overlayStyle} className="pp-dialog-overlay">
      <div
        ref={dialogRef}
        style={{ width: '100%', maxWidth, minWidth: '300px' }}
        className="pp-dialog pp-dialog-panel"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="pp-dialog-header">
          <h3 id={titleId} className="pp-dialog-title">{title}</h3>
          <button onClick={onClose} className="pp-icon-btn" title="Close" aria-label="Close dialog">
            <Icon name="x" />
          </button>
        </div>

        <div className="pp-dialog-body">
          {children}
        </div>

        {showFooter && (showCancelButton || onSubmit) && (
          <div className="pp-dialog-footer">
            {showCancelButton && (
              <button onClick={onClose} className="pp-btn">
                {cancelLabel}
              </button>
            )}
            {onSubmit && (
              <button onClick={onSubmit} className="pp-btn pp-btn--primary" disabled={submitDisabled}>
                {submitLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  padding: 'var(--space-4)',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 'var(--z-dialog)' as any
};
