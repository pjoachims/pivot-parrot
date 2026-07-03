import React, { ReactNode, useId, useRef } from 'react';
import { useDialogA11y } from './useDialogA11y';

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
  maxWidth = '400px',
  showFooter = true,
  showCancelButton = false,
  cancelLabel = 'Cancel'
}: BaseDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef, onClose);

  return (
    <div style={styles.overlay} className="pp-dialog-overlay">
      <div
        ref={dialogRef}
        style={{ ...styles.dialog, maxWidth }}
        className="pp-dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div style={styles.header}>
          <div style={styles.headerContent}>
            <h3 id={titleId} style={styles.title}>{title}</h3>
            <button onClick={onClose} style={styles.closeButton} title="Close" aria-label="Close dialog">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" style={styles.closeIcon}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div style={styles.content}>
          {children}
        </div>

        {showFooter && (
          <div style={styles.footer}>
            <div style={{ flex: 1 }}></div>
            {showCancelButton && (
              <button onClick={onClose} style={styles.secondaryButtonInFooter}>
                {cancelLabel}
              </button>
            )}
            {onSubmit && (
              <button
                onClick={onSubmit}
                style={{
                  ...styles.submitButton,
                  ...(submitDisabled ? styles.submitButtonDisabled : {})
                }}
                disabled={submitDisabled}
              >
                {submitLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 'var(--z-dialog)' as any
  },
  dialog: {
    backgroundColor: 'var(--surface-bg)',
    borderRadius: 'var(--radius-sm)',
    minWidth: '300px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column' as const,
    boxShadow: '0 8px 20px rgba(0, 0, 0, 0.15)'
  },
  header: {
    padding: '8px 12px',
    backgroundColor: 'var(--surface-hover)',
    borderTopLeftRadius: 'var(--radius-sm)',
    borderTopRightRadius: 'var(--radius-sm)'
  },
  headerContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  title: {
    margin: 0,
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    color: 'var(--text-primary)'
  },
  closeButton: {
    padding: '0 2px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    fontSize: '18px',
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  closeIcon: {
    width: '18px',
    height: '18px'
  },
  content: {
    padding: '12px',
    overflowY: 'auto' as const,
    flex: 1,
    backgroundColor: 'var(--surface-bg)'
  },
  footer: {
    padding: '8px 12px',
    backgroundColor: 'var(--surface-hover)',
    borderBottomLeftRadius: 'var(--radius-sm)',
    borderBottomRightRadius: 'var(--radius-sm)',
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },
  submitButton: {
    padding: '4px 10px',
    fontSize: 'var(--text-sm)',
    fontWeight: 500,
    color: 'var(--text-inverse)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--color-accent)',
    cursor: 'pointer'
  },
  submitButtonDisabled: {
    backgroundColor: 'var(--text-disabled)',
    cursor: 'not-allowed',
    opacity: 0.6
  },
  secondaryButtonInFooter: {
    padding: '4px 10px',
    fontSize: 'var(--text-sm)',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--surface-bg)',
    cursor: 'pointer'
  }
};

// Shared form element styles that dialogs can import
export const dialogFormStyles = {
  section: {
    marginBottom: '8px'
  },
  label: {
    display: 'block',
    marginBottom: '3px',
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    color: 'var(--text-secondary)'
  },
  input: {
    width: '100%',
    padding: '4px 6px',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--surface-bg)',
    color: 'var(--text-primary)',
    fontFamily: 'inherit'
  },
  select: {
    width: '100%',
    padding: '4px 6px',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--surface-bg)',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    cursor: 'pointer'
  },
  textarea: {
    width: '100%',
    padding: '4px 6px',
    fontSize: 'var(--text-sm)',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--surface-bg)',
    color: 'var(--text-primary)',
    fontFamily: 'inherit',
    resize: 'vertical' as const
  },
  divider: {
    height: '1px',
    backgroundColor: 'var(--border-color-light)',
    margin: '8px 0',
    border: 'none'
  },
  buttonGroup: {
    display: 'flex',
    gap: '4px',
    padding: '2px',
    backgroundColor: 'var(--surface-subtle)',
    borderRadius: 'var(--radius-sm)'
  },
  toggleButton: {
    flex: 1,
    padding: '4px 8px',
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer'
  },
  secondaryButton: {
    padding: '4px 10px',
    fontSize: 'var(--text-sm)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--surface-bg)',
    cursor: 'pointer',
    fontWeight: 500
  }
};
