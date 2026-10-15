import React from 'react';
import { usePivotStore, usePivotLocale } from '../../../application/state/store';
import type { SavedView } from '../../../domain/models/types';

/**
 * Snapshots Panel Component
 * Displays snapshot management UI
 */
interface SnapshotsPanelProps {
  snapshots: SavedView[];
  error?: string | null;
  onCreateSnapshot?: (name: string) => void;
  onLoadSnapshot?: (snapshotId: string) => void;
  onDeleteSnapshot?: (snapshotId: string) => void;
}

export function SnapshotsPanel({
  snapshots,
  error = null,
  onCreateSnapshot,
  onLoadSnapshot,
  onDeleteSnapshot
}: SnapshotsPanelProps) {
  // Store state
  const locale = usePivotLocale();
  const showSnapshots = usePivotStore(s => s.showSnapshots);
  const setShowSnapshots = usePivotStore(s => s.setShowSnapshots);
  const setSnapshotNameDialog = usePivotStore(s => s.setSnapshotNameDialog);

  // Only render if snapshots are supported
  if (!onCreateSnapshot) {
    return null;
  }

  return (
    <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-color-medium)' }}>
      <button
        onClick={() => setShowSnapshots(!showSnapshots)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'transparent',
          border: 'none',
          padding: '4px 0',
          fontSize: '11px',
          fontWeight: 500,
          color: 'var(--text-secondary)',
          cursor: 'pointer'
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          Snapshots ({snapshots.length})
        </span>
        <span style={{ transform: showSnapshots ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
      </button>

      {error && (
        <div role="alert" style={{ fontSize: '10px', color: 'var(--color-error)', padding: '4px 2px' }}>
          {error}
        </div>
      )}

      {showSnapshots && (
        <div style={{ marginTop: '8px' }}>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
            <button
              onClick={() => setSnapshotNameDialog(true)}
              style={{
                flex: 1,
                padding: '3px 6px',
                fontSize: '11px',
                color: 'var(--color-accent)',
                background: 'var(--surface-bg)',
                border: '1px solid var(--color-accent)',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              + New
            </button>
          </div>

          {snapshots.length === 0 ? (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center', padding: '8px' }}>
              No snapshots yet
            </div>
          ) : (
            <div style={{ maxHeight: '150px', overflowY: 'auto' }}>
              {snapshots.map((snapshot) => (
                <div
                  key={snapshot.id}
                  style={{
                    padding: '4px 6px',
                    marginBottom: '5px',
                    background: 'transparent',
                    border: '1px dashed var(--border-color-medium)',
                    borderRadius: '3px',
                    fontSize: '10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                    <div
                      className="pp-truncate"
                      style={{
                        fontWeight: 500,
                        color: 'var(--text-secondary)',
                        fontSize: '10px'
                      }}
                    >
                      {snapshot.name}
                    </div>
                    <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '1px' }}>
                      {new Date(snapshot.createdAt).toLocaleString(locale)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '3px', flexShrink: 0 }}>
                    <button
                      onClick={() => onLoadSnapshot && onLoadSnapshot(snapshot.id)}
                      aria-label={`Load snapshot ${snapshot.name}`}
                      style={{
                        padding: '2px 5px',
                        fontSize: '9px',
                        color: 'var(--color-accent)',
                        background: 'var(--surface-bg)',
                        border: '1px solid var(--border-color-medium)',
                        borderRadius: '2px',
                        cursor: 'pointer'
                      }}
                    >
                      Load
                    </button>
                    <button
                      onClick={() => onDeleteSnapshot && onDeleteSnapshot(snapshot.id)}
                      aria-label={`Delete snapshot ${snapshot.name}`}
                      className="pp-danger-btn-hover"
                      style={{
                        padding: '2px 5px',
                        fontSize: '10px',
                        color: 'var(--color-error)',
                        background: 'var(--surface-bg)',
                        border: '1px solid var(--border-color-medium)',
                        borderRadius: '2px',
                        cursor: 'pointer',
                        lineHeight: '1'
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
