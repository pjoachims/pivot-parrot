import React, { useState } from 'react';
import Popover from '../shared/Popover';

/**
 * Simple numeric filter dialog for HAVING filters (aggregations and custom metrics)
 * Only supports numeric comparison operators and a single value
 */
export function HavingFilterDialog({ field, displayName, onApply, onClose, existingFilter, anchorEl }) {
  // "Not equal" is a negated equal filter; no filter type of its own.
  const [operator, setOperator] = useState(
    existingFilter?.type === 'equal' && existingFilter.isNot ? 'not_equal' : existingFilter?.type || 'greater'
  );
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
      type: operator === 'not_equal' ? 'equal' : operator,
      isNot: operator === 'not_equal',
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
      title={`Filter: ${displayName}`}
      onClose={onClose}
      position={position}
      width={320}
    >
      <div className="pp-dialog-body">
        <div className="pp-field">
          <label className="pp-label" htmlFor={`${field.name}-having-op`}>Operator</label>
          <select
            id={`${field.name}-having-op`}
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            className="pp-select"
          >
            {operators.map(op => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
        </div>

        <div className="pp-field">
          <label className="pp-label" htmlFor={`${field.name}-having-value`}>Value</label>
          <input
            id={`${field.name}-having-value`}
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter numeric value"
            className="pp-input"
            autoFocus
          />
        </div>
      </div>

      <div className="pp-dialog-footer">
        <button onClick={onClose} className="pp-btn">Cancel</button>
        <button onClick={handleApply} disabled={!value} className="pp-btn pp-btn--primary">Apply</button>
      </div>
    </Popover>
  );
}
