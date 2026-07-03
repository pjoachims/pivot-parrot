import React, { useState } from 'react';

/**
 * SQLHistoryEntry Component
 * Displays a single SQL query with expandable section showing sample results and dtypes
 */
export default function SQLHistoryEntry({ entry, index }) {
  const [showResults, setShowResults] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(entry.sql);
  };

  const hasResults = entry.sampleRows || entry.dtypes;

  return (
    <div
      style={{
        border: '1px solid var(--border-color-light)',
        borderRadius: '6px',
        padding: '12px',
        background: 'var(--surface-subtle)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {new Date(entry.timestamp).toLocaleString()}
          </div>
          {entry.queryType && (
            <span style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '3px',
              background: 'var(--color-accent-chip-bg)',
              color: 'var(--color-accent-chip-text)',
              fontWeight: 500
            }}>
              {entry.queryType}
            </span>
          )}
          {hasResults && (
            <button
              onClick={() => setShowResults(!showResults)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '3px',
                background: showResults ? 'var(--color-accent-subtle)' : 'var(--surface-hover)',
                color: showResults ? 'var(--color-accent)' : 'var(--text-muted)',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 500
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="6" y1="20" x2="6" y2="14" />
                <line x1="12" y1="20" x2="12" y2="8" />
                <line x1="18" y1="20" x2="18" y2="4" />
              </svg>
              {showResults ? 'hide results' : 'show results'}
            </button>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="pp-accent-btn-hover"
          style={{
            padding: '4px 8px',
            fontSize: '10px',
            background: 'var(--color-accent)',
            color: 'var(--text-inverse)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Copy
        </button>
      </div>
      <pre style={{
        margin: 0,
        fontSize: '11px',
        fontFamily: 'monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        background: '#1f2937',
        color: '#f3f4f6',
        padding: '12px',
        borderRadius: '4px',
        overflow: 'auto',
        maxHeight: '200px'
      }}>
        {entry.sql}
      </pre>

      {/* Expandable results section */}
      {showResults && hasResults && (
        <div
          style={{
            marginTop: '12px',
            padding: '12px',
            background: 'var(--surface-bg)',
            border: '1px solid var(--border-color-medium)',
            borderRadius: '6px'
          }}
        >
          {/* Row count */}
          {entry.rowCount !== undefined && (
            <div style={{ marginBottom: '12px', fontSize: '11px', color: 'var(--text-muted)' }}>
              <strong>Rows:</strong> {entry.rowCount}
            </div>
          )}

          {/* Sample rows */}
          {entry.sampleRows && entry.sampleRows.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                Sample Rows ({entry.sampleRows.length}):
              </div>
              <div style={{
                overflowX: 'auto',
                fontSize: '10px',
                fontFamily: 'monospace'
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '10px'
                }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-hover)' }}>
                      {Object.keys(entry.sampleRows[0]).map(col => (
                        <th key={col} style={{
                          padding: '6px 8px',
                          textAlign: 'left',
                          borderBottom: '1px solid var(--border-color-medium)',
                          fontWeight: 600,
                          color: 'var(--text-secondary)'
                        }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {entry.sampleRows.map((row, idx) => (
                      <tr key={idx} style={{ background: idx % 2 === 0 ? 'var(--surface-bg)' : 'var(--surface-subtle)' }}>
                        {Object.values(row).map((val, colIdx) => (
                          <td key={colIdx} style={{
                            padding: '6px 8px',
                            borderBottom: '1px solid var(--border-color-light)',
                            color: 'var(--text-primary)'
                          }}>
                            {val === null || val === undefined ? (
                              <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>null</span>
                            ) : (
                              String(val).length > 50 ? String(val).slice(0, 47) + '...' : String(val)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Dtypes */}
          {entry.dtypes && Object.keys(entry.dtypes).length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                Data Types:
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: '6px',
                fontSize: '10px'
              }}>
                {Object.entries(entry.dtypes).map(([field, dtype]) => (
                  <div key={field} style={{
                    padding: '4px 8px',
                    background: 'var(--surface-hover)',
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{field}</span>
                    <span style={{
                      color: 'var(--text-muted)',
                      fontSize: '9px',
                      padding: '2px 4px',
                      background: 'var(--border-color-light)',
                      borderRadius: '3px'
                    }}>
                      {getDtypeName(dtype)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Format type name for display
 */
function getDtypeName(typeName) {
  // dtype is now a string type name - just lowercase it for display
  return typeName ? String(typeName).toLowerCase() : 'unknown';
}
