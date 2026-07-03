import React, { useState, useEffect, useRef } from 'react';
import BaseDialog from '../../shared/BaseDialog';

/**
 * Dialog for naming a snapshot
 * @param {Object} props
 * @param {Function} props.onSave - Called with the snapshot name
 * @param {Function} props.onCancel - Called when canceling
 * @param {string} props.defaultName - Pre-filled default name
 */
export default function SnapshotNameDialog({ onSave, onCancel, defaultName }) {
  const [name, setName] = useState(defaultName || '');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus and select text on mount
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const trimmedName = name.trim();

  const handleSave = () => {
    if (trimmedName) {
      onSave(trimmedName);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <BaseDialog
      title="Name Snapshot"
      onClose={onCancel}
      onSubmit={handleSave}
      submitLabel="Save"
      submitDisabled={!trimmedName}
      showCancelButton
      maxWidth="320px"
    >
      <div style={styles.inputGroup}>
        <label style={styles.label}>Snapshot Name:</label>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          style={styles.input}
          placeholder="Enter snapshot name..."
        />
      </div>
    </BaseDialog>
  );
}

const styles: Record<string, React.CSSProperties> = {
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  label: {
    fontSize: 'var(--text-sm)',
    fontWeight: 500,
    color: 'var(--text-secondary)'
  },
  input: {
    padding: '6px 8px',
    fontSize: 'var(--text-base)',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'inherit'
  }
};
