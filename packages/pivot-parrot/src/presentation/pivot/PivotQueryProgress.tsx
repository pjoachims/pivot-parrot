import React, { useState } from 'react';

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

export const PivotQueryProgress: React.FC<PivotQueryProgressProps> = ({
  queryProgress,
  pivotTimeout = 60000,
  uniqueValuesTimeout = 20000,
  drilldownTimeout = 30000,
  onCancel,
  canCancel = false
}) => {
  const [showSQLTooltip, setShowSQLTooltip] = useState(false);

  if (!queryProgress || queryProgress.elapsed <= 500) {
    return null;
  }

  // Determine max time based on query type
  const maxTime = queryProgress.type === 'pivot' ? pivotTimeout
    : queryProgress.type === 'uniqueValues' ? uniqueValuesTimeout
    : queryProgress.type === 'drilldown' ? drilldownTimeout
    : 30000;

  const progress = Math.min((queryProgress.elapsed / maxTime) * 100, 100);
  const elapsedSeconds = (queryProgress.elapsed / 1000).toFixed(1);
  const maxSeconds = (maxTime / 1000).toFixed(0);

  const cleanSQL = (sql: string) => {
    if (!sql) return '';
    return sql.replace(/,\s*CAST\(GROUPING\([^)]+\)\s+AS\s+INTEGER\)\s+AS\s+_grouping_\w+/gi, '');
  };

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(255, 255, 255, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 'var(--z-progress)' as any,
      pointerEvents: 'all'
    }}>
      <div style={{
        background: 'var(--surface-bg)',
        padding: '24px 32px',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        minWidth: '300px',
        textAlign: 'center',
        position: 'relative'
      }}>
        {/* SQL Preview Icon */}
        {queryProgress.sql && (
          <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
            <button
              onMouseEnter={() => setShowSQLTooltip(true)}
              onMouseLeave={() => setShowSQLTooltip(false)}
              className="pp-icon-btn-hover"
              style={{
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                transition: 'background 0.15s'
              }}
              title="View SQL"
              aria-label="View SQL"
            >
              <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </button>
            {showSQLTooltip && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '8px',
                minWidth: '400px',
                maxWidth: '700px',
                background: '#1f2937',
                color: '#f9fafb',
                padding: '12px',
                borderRadius: '6px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                zIndex: 'var(--z-progress-tooltip)' as any,
                fontSize: '11px',
                fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                textAlign: 'left',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: '400px',
                overflowY: 'auto',
                lineHeight: '1.5'
              }}>
                {cleanSQL(queryProgress.sql)}
              </div>
            )}
          </div>
        )}

        <div style={{
          fontSize: '16px',
          fontWeight: 500,
          marginBottom: '12px',
          color: 'var(--text-secondary)'
        }}>
          {queryProgress.type === 'pivot' && 'Executing pivot query...'}
          {queryProgress.type === 'drilldown' && 'Fetching drilldown data...'}
          {queryProgress.type === 'uniqueValues' && 'Loading filter values...'}
          {queryProgress.type === 'query' && 'Executing query...'}
        </div>
        <div style={{
          fontSize: '14px',
          color: 'var(--text-muted)',
          marginBottom: '16px'
        }}>
          {elapsedSeconds}s / {maxSeconds}s
        </div>
        <div style={{
          width: '100%',
          height: '4px',
          background: 'var(--border-color-light)',
          borderRadius: '2px',
          overflow: 'hidden',
          marginBottom: canCancel ? '16px' : '0'
        }}>
          <div style={{
            height: '100%',
            background: progress >= 100 ? 'var(--color-error)' : 'var(--color-accent)',
            width: `${progress}%`,
            transition: 'width 0.1s linear, background-color 0.3s ease'
          }} />
        </div>
        {canCancel && onCancel && (
          <button
            onClick={onCancel}
            style={{
              marginTop: '8px',
              padding: '8px 20px',
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text-muted)',
              background: 'var(--surface-hover)',
              border: '1px solid var(--border-color-light)',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'var(--border-color-light)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'var(--surface-hover)';
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};
