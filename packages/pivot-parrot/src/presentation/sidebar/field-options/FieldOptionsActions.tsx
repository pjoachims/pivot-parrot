import React from 'react';
import { usePivotStore } from '../../../application/state/store';
import {
  CustomExpressionColors,
  CustomExpressionSymbols,
  type CustomExpressionType
} from '../shared/CustomExpressionIcons';

interface CreateButtonProps {
  type: CustomExpressionType;
  onClick: () => void;
}

function CreateButton({ type, onClick }: CreateButtonProps) {
  const color = CustomExpressionColors[type];
  const symbol = CustomExpressionSymbols[type];

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        padding: '2px 4px',
        fontSize: '11px',
        color,
        background: 'transparent',
        border: `1px solid ${color}`,
        borderRadius: '3px',
        cursor: 'pointer'
      }}
      title={`Create custom ${type}`}
      aria-label={`Create custom ${type}`}
    >
      <span style={{ fontSize: '10px' }}>+</span>
      <span style={{ fontSize: '12px' }}>{symbol}</span>
    </button>
  );
}

/**
 * FieldOptionsActions component
 * Displays action buttons for creating custom metrics, groupings, and filters
 */
export function FieldOptionsActions() {
  const setExpressionDialog = usePivotStore(s => s.setExpressionDialog);

  return (
    <div
      className="px-3 py-2 text-xs bg-white"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}
    >
      <span>Drag fields:</span>
      <div style={{ display: 'flex', gap: '4px' }}>
        <CreateButton type="metric" onClick={() => setExpressionDialog({ type: 'metric', editing: null })} />
        <CreateButton type="grouping" onClick={() => setExpressionDialog({ type: 'grouping', editing: null })} />
        <CreateButton type="filter" onClick={() => setExpressionDialog({ type: 'filter', editing: null })} />
      </div>
    </div>
  );
}
