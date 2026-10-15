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
  const inputId = React.useId();

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
      maxWidth="360px"
    >
      <div className="pp-field">
        <label className="pp-label" htmlFor={inputId}>Name</label>
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="pp-input"
          placeholder="Enter snapshot name..."
        />
      </div>
    </BaseDialog>
  );
}
