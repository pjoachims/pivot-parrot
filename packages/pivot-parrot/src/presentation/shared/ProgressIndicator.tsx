import React, { useState, useEffect } from 'react';

interface ProgressIndicatorProps {
  message: string;
  startTime: number;
  onCancel?: () => void;
  maxTime?: number; // in milliseconds
}

/**
 * Inline progress panel for a host that renders its own loading state:
 * message, elapsed / limit, and a bar that moves to the warning and error
 * colours as the limit nears.
 */
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
    <div style={styles.container} role="status" aria-live="polite">
      <div className="pp-dialog" style={styles.panel}>
        <div className="pp-dialog-body" style={{ alignItems: 'center' }}>
          <span className="pp-spinner" aria-hidden="true" style={{ width: 24, height: 24 }} />
          <div style={styles.message}>{message}</div>
          <div className="pp-readout">
            <span>Elapsed</span>
            <span>{elapsedSeconds}s{maxSeconds && ` / ${maxSeconds}s`}</span>
          </div>
          {progress !== null && (
            <div style={styles.track} aria-hidden="true">
              <div
                style={{
                  ...styles.bar,
                  width: `${progress}%`,
                  backgroundColor: progress > 90 ? 'var(--color-error)' : progress > 70 ? 'var(--color-warning)' : 'var(--color-accent)'
                }}
              />
            </div>
          )}
        </div>
        {onCancel && (
          <div className="pp-dialog-footer">
            <button onClick={onCancel} className="pp-btn">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-4)'
  },
  panel: {
    width: 320,
    boxShadow: 'none'
  },
  message: {
    fontSize: 'var(--text-md)',
    fontWeight: 600,
    color: 'var(--text-primary)',
    textAlign: 'center'
  },
  track: {
    width: '100%',
    height: 4,
    background: 'var(--border-color-light)',
    overflow: 'hidden'
  },
  bar: {
    height: '100%',
    transition: 'width 0.1s ease-out, background-color 0.3s ease'
  }
};
