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
      width={320}
    >
      <div className="pp-dialog-body">
        <div className="pp-field">
          <label className="pp-label" htmlFor={`${field.id}-rename-id`}>Field ID</label>
          <input id={`${field.id}-rename-id`} type="text" value={field.id} disabled className="pp-input" style={{ color: 'var(--text-muted)', background: 'var(--surface-subtle)' }} />
        </div>

        <div className="pp-field">
          <label className="pp-label" htmlFor={`${field.id}-rename-name`}>Display Name</label>
          <input
            id={`${field.id}-rename-name`}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Enter display name"
            autoFocus
            className="pp-input"
          />
          <div className="pp-hint">This changes how the field is displayed in the UI</div>
        </div>
      </div>

      <div className="pp-dialog-footer">
        <button onClick={onClose} className="pp-btn">Cancel</button>
        <button onClick={handleApply} disabled={!newName.trim()} className="pp-btn pp-btn--primary">Rename</button>
      </div>
    </Popover>
  );
}
