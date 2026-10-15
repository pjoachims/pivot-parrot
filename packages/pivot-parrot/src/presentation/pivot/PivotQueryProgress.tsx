import React, { useState } from 'react';
import { Icon } from '../shared/Icon';

interface QueryProgress {
  sql?: string;
  elapsed: number;
  type: 'pivot' | 'uniqueValues' | 'drilldown' | 'query';
}

interface PivotQueryProgressProps {
  queryProgress: QueryProgress | null;
  pivotTimeout?: number;
  uniqueValuesTimeout?: number;
  drilldownTimeout?: number;
  onCancel?: () => void;
  canCancel?: boolean;
}

const MESSAGE: Record<QueryProgress['type'], string> = {
  pivot: 'Running the pivot query…',
  drilldown: 'Fetching drilldown rows…',
  uniqueValues: 'Loading filter values…',
  query: 'Running the query…'
};

/**
 * The full-panel veil while a query runs longer than half a second: one
 * dialog panel with the message, elapsed / limit, a progress bar that turns
 * to the error colour once the limit is reached, and Cancel when the engine
 * can cancel. The SQL sits behind an icon button.
 */
export const PivotQueryProgress: React.FC<PivotQueryProgressProps> = ({
  queryProgress,
  pivotTimeout = 60000,
  uniqueValuesTimeout = 20000,
  drilldownTimeout = 30000,
  onCancel,
  canCancel = false
}) => {
  const [showSQL, setShowSQL] = useState(false);

  if (!queryProgress || queryProgress.elapsed <= 500) {
    return null;
  }

  const maxTime = queryProgress.type === 'pivot' ? pivotTimeout
    : queryProgress.type === 'uniqueValues' ? uniqueValuesTimeout
    : queryProgress.type === 'drilldown' ? drilldownTimeout
    : 30000;

  const progress = Math.min((queryProgress.elapsed / maxTime) * 100, 100);
  const elapsedSeconds = (queryProgress.elapsed / 1000).toFixed(1);
  const maxSeconds = (maxTime / 1000).toFixed(0);

  const cleanSQL = (sql: string) =>
    sql.replace(/,\s*CAST\(GROUPING\([^)]+\)\s+AS\s+INTEGER\)\s+AS\s+_grouping_\w+/gi, '');

  return (
    <div style={styles.veil} role="status" aria-live="polite">
      <div className="pp-dialog" style={styles.panel}>
        <div className="pp-dialog-header">
          <span className="pp-dialog-title">{MESSAGE[queryProgress.type]}</span>
          {queryProgress.sql && (
            <button
              onClick={() => setShowSQL(v => !v)}
              className="pp-icon-btn"
              aria-pressed={showSQL}
              title="Show SQL"
              aria-label="Show SQL"
            >
              <Icon name="code" />
            </button>
          )}
        </div>
        <div className="pp-dialog-body">
          <div className="pp-readout">
            <span>Elapsed</span>
            <span>{elapsedSeconds}s / {maxSeconds}s</span>
          </div>
          <div style={styles.track} aria-hidden="true">
            <div
              style={{
                ...styles.bar,
                width: `${progress}%`,
                background: progress >= 100 ? 'var(--color-error)' : 'var(--color-accent)'
              }}
            />
          </div>
          {showSQL && queryProgress.sql && (
            <pre style={styles.sql}>{cleanSQL(queryProgress.sql)}</pre>
          )}
        </div>
        {canCancel && onCancel && (
          <div className="pp-dialog-footer">
            <button onClick={onCancel} className="pp-btn">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  veil: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 'var(--z-progress)' as any,
    pointerEvents: 'all'
  },
  panel: {
    width: 360,
    maxWidth: 'calc(100% - 2 * var(--space-4))'
  },
  track: {
    height: 4,
    background: 'var(--border-color-light)',
    overflow: 'hidden'
  },
  bar: {
    height: '100%',
    transition: 'width 0.1s linear, background-color 0.3s ease'
  },
  sql: {
    margin: 0,
    padding: 'var(--space-2)',
    maxHeight: 240,
    overflow: 'auto',
    background: 'var(--surface-subtle)',
    border: '1px solid var(--border-color-light)',
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    color: 'var(--text-secondary)'
  }
};
