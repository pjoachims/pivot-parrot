import React, { useState } from 'react';
import { Icon } from '../../shared/Icon';

/**
 * One query of the SQL history: when it ran, its type, the SQL, and on
 * request the sample rows and column types the engine returned.
 */
export default function SQLHistoryEntry({ entry }) {
  const [showResults, setShowResults] = useState(false);

  const hasResults = Boolean(entry.sampleRows || entry.dtypes);
  const columns = entry.sampleRows?.length ? Object.keys(entry.sampleRows[0]) : [];

  return (
    <div style={styles.card}>
      <div style={styles.head}>
        <span className="pp-hint">{new Date(entry.timestamp).toLocaleString()}</span>
        {entry.queryType && <span style={styles.tag}>{entry.queryType}</span>}
        {entry.rowCount !== undefined && <span className="pp-hint">{entry.rowCount} rows</span>}
        <span style={{ flex: 1 }} />
        {hasResults && (
          <button
            onClick={() => setShowResults(!showResults)}
            className="pp-btn pp-btn--quiet pp-btn--sm"
            aria-pressed={showResults}
          >
            <Icon name="table" />
            Results
          </button>
        )}
        <button onClick={() => navigator.clipboard.writeText(entry.sql)} className="pp-btn pp-btn--sm">
          <Icon name="copy" />
          Copy
        </button>
      </div>
      <pre style={styles.sql}>{entry.sql}</pre>

      {showResults && hasResults && (
        <div style={styles.results}>
          {columns.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {columns.map(col => (
                      <th key={col} style={styles.th}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {entry.sampleRows.map((row, idx) => (
                    <tr key={idx}>
                      {Object.values(row).map((val, colIdx) => (
                        <td key={colIdx} style={styles.td}>
                          {val === null || val === undefined
                            ? <span className="pp-hint">null</span>
                            : String(val).length > 50 ? String(val).slice(0, 47) + '…' : String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {entry.dtypes && Object.keys(entry.dtypes).length > 0 && (
            <div style={styles.dtypes}>
              {Object.entries(entry.dtypes).map(([field, dtype]) => (
                <span key={field} className="pp-readout">
                  <span>{field}</span>
                  <span>{dtype ? String(dtype).toLowerCase() : 'unknown'}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    padding: 'var(--space-2) var(--space-3) var(--space-3)',
    border: '1px solid var(--border-color-light)',
    borderRadius: 'var(--radius-sm)'
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    minHeight: 'var(--control-h-sm)'
  },
  tag: {
    padding: '1px var(--space-1)',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-xs)',
    color: 'var(--text-secondary)',
    textTransform: 'lowercase'
  },
  sql: {
    margin: 0,
    padding: 'var(--space-2)',
    maxHeight: 200,
    overflow: 'auto',
    background: 'var(--surface-subtle)',
    border: '1px solid var(--border-color-light)',
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    color: 'var(--text-primary)'
  },
  results: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-2)',
    paddingTop: 'var(--space-2)',
    borderTop: '1px solid var(--border-color-light)'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)'
  },
  th: {
    padding: '3px var(--space-2)',
    textAlign: 'left',
    borderBottom: '1px solid var(--border-color-medium)',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap'
  },
  td: {
    padding: '3px var(--space-2)',
    borderBottom: '1px solid var(--border-color-light)',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap'
  },
  dtypes: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 'var(--space-1) var(--space-3)'
  }
};
