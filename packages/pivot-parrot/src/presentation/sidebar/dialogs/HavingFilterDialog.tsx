import React, { useState } from 'react';
import Popover from '../shared/Popover';

/**
 * Simple numeric filter dialog for HAVING filters (aggregations and custom metrics)
 * Only supports numeric comparison operators and a single value
 */
export function HavingFilterDialog({ field, onApply, onClose, existingFilter, anchorEl }) {
  const [operator, setOperator] = useState(existingFilter?.type || 'greater');
  const [value, setValue] = useState(existingFilter?.value || '');

  const operators = [
    { value: 'equal', label: 'Equal to (=)' },
    { value: 'not_equal', label: 'Not equal to (≠)' },
    { value: 'greater', label: 'Greater than (>)' },
    { value: 'greater_equal', label: 'Greater than or equal (≥)' },
    { value: 'less', label: 'Less than (<)' },
    { value: 'less_equal', label: 'Less than or equal (≤)' }
  ];

  const handleApply = () => {
    const filter = {
      field: field.name,
      type: operator,
      value: value,
      filterType: 'having'
    };
    onApply(filter);
    onClose();
  };

  // Get position from anchorEl
  const position = anchorEl ? (() => {
    const rect = anchorEl.getBoundingClientRect();
    return { x: rect.right + 8, y: rect.top };
  })() : null;

  return (
    <Popover
      title={`Filter: ${field.name}`}
      onClose={onClose}
      position={position}
      width={350}
    >
      <div style={{ padding: '10px' }}>
        {/* Operator Selection */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Operator
          </label>
          <select
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--border-color-medium)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-base)' }}
          >
            {operators.map(op => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        </div>

        {/* Value Input */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '4px' }}>
            Value
          </label>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter numeric value"
            style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--border-color-medium)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-base)' }}
            autoFocus
          />
        </div>

        {/* Footer */}
        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '4px 12px',
              fontSize: 'var(--text-base)',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              background: 'var(--surface-bg)',
              border: '1px solid var(--border-color-medium)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!value}
            style={{
              padding: '4px 12px',
              fontSize: 'var(--text-base)',
              fontWeight: 500,
              color: 'var(--text-inverse)',
              background: value ? 'var(--color-accent)' : 'var(--text-disabled)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: value ? 'pointer' : 'not-allowed'
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </Popover>
  );
}
