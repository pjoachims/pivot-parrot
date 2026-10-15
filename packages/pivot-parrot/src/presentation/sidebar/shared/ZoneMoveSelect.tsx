import React from 'react';
import { Icon } from '../../shared/Icon';

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
}

/**
 * Keyboard-accessible equivalent of dragging a field between the
 * Filters/Columns/Rows/Values zones: an icon button with a transparent native
 * <select> on top, which is fully operable by keyboard and announced
 * correctly by screen readers with no extra ARIA.
 */
export function ZoneMoveSelect({ excludeZone, label, onMove }: ZoneMoveSelectProps) {
  const options = ZONE_OPTIONS.filter(z => z.value !== excludeZone);

  return (
    <span className="pp-icon-btn pp-icon-btn--sm pp-zone-move-select">
      <Icon name="move" />
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
      >
        <option value="">Move to…</option>
        {options.map(z => (
          <option key={z.value} value={z.value}>{z.label}</option>
        ))}
      </select>
    </span>
  );
}
