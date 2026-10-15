import React from 'react';
import { usePivotStore, usePivotLocale } from '../../../application/state/store';
import type { SavedView } from '../../../domain/models/types';
import { Icon } from '../../shared/Icon';

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
    <div style={{ padding: 'var(--space-1) var(--space-3) var(--space-2)', borderTop: '1px solid var(--border-color-medium)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
        <button
          onClick={() => setShowSnapshots(!showSnapshots)}
          aria-expanded={showSnapshots}
          className="pp-btn pp-btn--quiet pp-btn--sm"
          style={{ flex: 1, justifyContent: 'flex-start', paddingLeft: 0 }}
        >
          <Icon name="chevron-right" style={{ transform: showSnapshots ? 'rotate(90deg)' : undefined, transition: 'transform var(--transition-fast)' }} />
          <Icon name="camera" />
          Snapshots ({snapshots.length})
        </button>
        {showSnapshots && (
          <button
            onClick={() => setSnapshotNameDialog(true)}
            className="pp-btn pp-btn--sm"
            title="Save the current layout as a snapshot"
          >
            <Icon name="plus" />
            New
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="pp-hint" style={{ color: 'var(--color-error)', padding: 'var(--space-1) 0' }}>
          {error}
        </div>
      )}

      {showSnapshots && (
        snapshots.length === 0 ? (
          <div className="pp-hint" style={{ padding: 'var(--space-2) 0 var(--space-1)' }}>
            No snapshots yet
          </div>
        ) : (
          <div style={{ maxHeight: '150px', overflowY: 'auto', marginTop: 'var(--space-1)' }}>
            {snapshots.map((snapshot) => (
              <div key={snapshot.id} className="pp-field-row" style={{ height: 'auto', minHeight: '32px', cursor: 'default', paddingLeft: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="pp-truncate" style={{ fontWeight: 500 }}>{snapshot.name}</div>
                  <div className="pp-hint">{new Date(snapshot.createdAt).toLocaleString(locale)}</div>
                </div>
                <button
                  onClick={() => onLoadSnapshot && onLoadSnapshot(snapshot.id)}
                  aria-label={`Load snapshot ${snapshot.name}`}
                  className="pp-btn pp-btn--sm"
                >
                  Load
                </button>
                <button
                  onClick={() => onDeleteSnapshot && onDeleteSnapshot(snapshot.id)}
                  aria-label={`Delete snapshot ${snapshot.name}`}
                  title="Delete snapshot"
                  className="pp-icon-btn pp-icon-btn--danger"
                >
                  <Icon name="trash" />
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
