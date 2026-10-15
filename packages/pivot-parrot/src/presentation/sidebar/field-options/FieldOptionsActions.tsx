import React from 'react';
import { usePivotStore } from '../../../application/state/store';
import { CustomExpressionIcon, type CustomExpressionType } from '../shared/CustomExpressionIcons';

const CREATE: Array<{ type: CustomExpressionType; label: string }> = [
  { type: 'metric', label: 'Metric' },
  { type: 'grouping', label: 'Group' },
  { type: 'filter', label: 'Filter' }
];

/**
 * Create a custom metric, grouping or filter: three neutral buttons, each with
 * the glyph its result carries in the field list.
 */
export function FieldOptionsActions() {
  const setExpressionDialog = usePivotStore(s => s.setExpressionDialog);

  return (
    <div
      role="group"
      aria-label="Create custom field"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 'var(--space-1)',
        padding: 'var(--space-2) var(--space-3)',
        borderTop: '1px solid var(--border-color-light)'
      }}
    >
      {CREATE.map(({ type, label }) => (
        <button
          key={type}
          onClick={() => setExpressionDialog({ type, editing: null })}
          className="pp-btn pp-btn--sm"
          title={`Create custom ${type}`}
          aria-label={`Create custom ${type}`}
        >
          <CustomExpressionIcon type={type} />
          <span className="pp-truncate">{label}</span>
        </button>
      ))}
    </div>
  );
}
