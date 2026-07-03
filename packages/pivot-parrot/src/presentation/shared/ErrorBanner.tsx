import React from 'react';

interface ErrorBannerProps {
  message: string;
  title?: string;
  onDismiss?: () => void;
  style?: React.CSSProperties;
}

/**
 * Single shared error banner used across the presentation layer, replacing
 * several near-duplicate inline error boxes (PivotMainPanel, SQLPlayground).
 */
export default function ErrorBanner({ message, title, onDismiss, style }: ErrorBannerProps) {
  return (
    <div style={{ ...styles.container, ...style }} role="alert">
      <span>{title && <strong>{title}: </strong>}{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} style={styles.dismissButton} aria-label="Dismiss error">
          Dismiss
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: 'var(--color-error-bg)',
    border: '1px solid var(--color-error-border)',
    borderRadius: 'var(--radius-md)',
    padding: '0.75rem',
    fontSize: 'var(--text-base)',
    color: 'var(--color-error)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px'
  },
  dismissButton: {
    padding: '4px 8px',
    fontSize: 'var(--text-sm)',
    fontWeight: 500,
    background: 'transparent',
    border: '1px solid var(--color-error-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-error)',
    cursor: 'pointer',
    flexShrink: 0
  }
};
