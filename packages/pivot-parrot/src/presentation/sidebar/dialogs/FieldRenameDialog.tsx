import React, { useState } from 'react';
import Popover from '../shared/Popover';

export default function FieldRenameDialog({
  field,
  currentName,
  onApply,
  onClose,
  anchorEl
}) {
  const [newName, setNewName] = useState(currentName || field.id);

  const handleApply = () => {
    if (newName.trim()) {
      onApply(field.id, newName.trim());
    }
  };

  // Escape-to-close is handled by Popover; only Enter-to-apply lives here.
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleApply();
    }
  };

  // Get position from anchorEl
  const position = anchorEl ? (() => {
    const rect = anchorEl.getBoundingClientRect();
    return { x: rect.right + 8, y: rect.top };
  })() : null;

  return (
    <Popover
      title={`Rename Field`}
      onClose={onClose}
      position={position}
      width={300}
    >
      <div style={{ padding: '10px' }}>
        <div style={{ marginBottom: '8px' }}>
          <label style={{
            display: 'block',
            fontSize: 'var(--text-xs)',
            fontWeight: 500,
            color: 'var(--text-secondary)',
            marginBottom: '3px'
          }}>
            Field ID
          </label>
          <input
            type="text"
            value={field.id}
            disabled
            style={{
              width: '100%',
              padding: '4px 6px',
              border: '1px solid var(--border-color-medium)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'inherit',
              background: 'var(--surface-hover)',
              color: 'var(--text-muted)'
            }}
          />
        </div>

        <div style={{ marginBottom: '12px' }}>
          <label style={{
            display: 'block',
            fontSize: 'var(--text-xs)',
            fontWeight: 500,
            color: 'var(--text-secondary)',
            marginBottom: '3px'
          }}>
            Display Name
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Enter display name"
            autoFocus
            style={{
              width: '100%',
              padding: '4px 6px',
              border: '1px solid var(--border-color-medium)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'inherit'
            }}
          />
          <div style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            marginTop: '3px'
          }}>
            This changes how the field is displayed in the UI
          </div>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '4px',
          borderTop: '1px solid var(--border-color-light)',
          paddingTop: '8px'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '4px 10px',
              border: '1px solid var(--border-color-medium)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-bg)',
              color: 'var(--text-secondary)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!newName.trim()}
            style={{
              padding: '4px 10px',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: newName.trim() ? 'var(--color-accent)' : 'var(--text-disabled)',
              color: 'var(--text-inverse)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              cursor: newName.trim() ? 'pointer' : 'not-allowed'
            }}
          >
            Rename
          </button>
        </div>
      </div>
    </Popover>
  );
}
