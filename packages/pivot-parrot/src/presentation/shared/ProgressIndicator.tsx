import React, { useState, useEffect } from 'react';

interface ProgressIndicatorProps {
  message: string;
  startTime: number;
  onCancel?: () => void;
  maxTime?: number; // in milliseconds
}

export function ProgressIndicator({ message, startTime, onCancel, maxTime }: ProgressIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 100);

    return () => clearInterval(interval);
  }, [startTime]);

  const elapsedSeconds = (elapsed / 1000).toFixed(1);
  const maxSeconds = maxTime ? (maxTime / 1000).toFixed(0) : null;
  const progress = maxTime ? Math.min((elapsed / maxTime) * 100, 100) : null;

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        {/* Spinner */}
        <div
          className="pp-spinner"
          style={{ width: '40px', height: '40px', borderWidth: '4px', borderTopColor: 'var(--color-accent)' }}
        ></div>

        {/* Message */}
        <div style={styles.message}>{message}</div>

        {/* Time Display */}
        <div style={styles.timeDisplay}>
          <span style={styles.elapsed}>{elapsedSeconds}s</span>
          {maxSeconds && (
            <>
              <span style={styles.separator}>/</span>
              <span style={styles.max}>{maxSeconds}s</span>
            </>
          )}
        </div>

        {/* Progress Bar (if maxTime provided) */}
        {progress !== null && (
          <div style={styles.progressBarContainer}>
            <div
              style={{
                ...styles.progressBar,
                width: `${progress}%`,
                backgroundColor: progress > 90 ? 'var(--color-error)' : progress > 70 ? 'var(--color-warning)' : 'var(--color-accent)'
              }}
            />
          </div>
        )}

        {/* Cancel Button */}
        {onCancel && (
          <button
            onClick={onCancel}
            className="pp-danger-btn-hover"
            style={styles.cancelButton}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px',
    color: 'var(--text-secondary)'
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    background: 'var(--surface-bg)',
    padding: '24px 32px',
    borderRadius: '8px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    minWidth: '280px'
  },
  message: {
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--text-primary)',
    textAlign: 'center'
  },
  timeDisplay: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
    fontSize: '13px',
    fontFamily: 'ui-monospace, monospace'
  },
  elapsed: {
    fontWeight: 600,
    color: 'var(--color-accent)'
  },
  separator: {
    color: 'var(--text-muted)'
  },
  max: {
    color: 'var(--text-muted)'
  },
  progressBarContainer: {
    width: '100%',
    height: '6px',
    background: 'var(--border-color-light)',
    borderRadius: '3px',
    overflow: 'hidden'
  },
  progressBar: {
    height: '100%',
    transition: 'width 0.1s ease-out, background-color 0.3s ease',
    borderRadius: '3px'
  },
  cancelButton: {
    marginTop: '8px',
    padding: '6px 16px',
    fontSize: '12px',
    fontWeight: 500,
    color: 'var(--color-error)',
    background: 'var(--surface-bg)',
    border: '1px solid var(--color-error)',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'background 0.15s ease'
  }
};
