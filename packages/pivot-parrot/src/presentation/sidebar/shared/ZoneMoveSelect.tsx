import React from 'react';

export const ZONE_OPTIONS = [
  { value: 'filters', label: 'Filters' },
  { value: 'columns', label: 'Columns' },
  { value: 'rows', label: 'Rows' },
  { value: 'values', label: 'Values' }
];

interface ZoneMoveSelectProps {
  /** Zone to omit from the option list (the zone this item already lives in). */
  excludeZone?: string;
  label: string;
  onMove: (targetZone: string) => void;
  className?: string;
}

/**
 * Keyboard-accessible equivalent of dragging a field between the
 * Filters/Columns/Rows/Values zones. Uses the same "visible icon + full-size
 * invisible native <select> on top" technique as the aggregation picker in
 * ValueItem.tsx - a plain <select> is fully operable by keyboard (Tab,
 * Enter/Space, arrow keys) and announced correctly by screen readers with no
 * extra ARIA required.
 */
export function ZoneMoveSelect({ excludeZone, label, onMove, className = '' }: ZoneMoveSelectProps) {
  const options = ZONE_OPTIONS.filter(z => z.value !== excludeZone);

  return (
    <span
      className={`pp-zone-move-select ${className}`}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px' }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true" style={{ pointerEvents: 'none' }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 3L4 7m0 0l4 4M4 7h16m-4 10l4-4m0 0l-4-4m4 4H4" />
      </svg>
      <select
        value=""
        onChange={(e) => {
          const value = e.target.value;
          e.target.value = '';
          if (value) onMove(value);
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        draggable={false}
        aria-label={label}
        title="Move to zone"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
      >
        <option value="">Move to…</option>
        {options.map(z => (
          <option key={z.value} value={z.value}>{z.label}</option>
        ))}
      </select>
    </span>
  );
}
