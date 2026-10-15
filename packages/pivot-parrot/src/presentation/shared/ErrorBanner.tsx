import React from 'react';

interface ErrorBannerProps {
  message: string;
  title?: string;
  onDismiss?: () => void;
  style?: React.CSSProperties;
}

/**
 * The one error banner of the presentation layer (pivot errors, display
 * limits, export and settings errors): a .pp-alert with an optional
 * Dismiss, which inherits the alert's colour.
 */
export default function ErrorBanner({ message, title, onDismiss, style }: ErrorBannerProps) {
  return (
    <div className="pp-alert" style={style} role="alert">
      <span style={{ flex: 1, minWidth: 0 }}>{title && <strong>{title}: </strong>}{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="pp-btn pp-btn--quiet pp-btn--sm" aria-label="Dismiss error">
          Dismiss
        </button>
      )}
    </div>
  );
}
