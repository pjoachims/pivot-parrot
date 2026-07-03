import React from 'react';
import {
  CustomExpressionIcon,
  CustomExpressionColors,
  type CustomExpressionType
} from '../../shared/CustomExpressionIcons';
import { ZoneMoveSelect } from '../../shared/ZoneMoveSelect';

interface CustomExpressionItemProps {
  id: string;
  name: string;
  type: CustomExpressionType;
  isChecked: boolean;
  onToggle: (id: string, checked: boolean) => void;
  onMoveToZone?: (targetZone: string) => void;
  onDragStart: (e: React.DragEvent, id: string, sourceZone: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * CustomExpressionItem - Renders a single custom expression (metric, grouping, or filter)
 * Aligned with AvailableFieldItem structure for consistent appearance
 */
export function CustomExpressionItem({
  id,
  name,
  type,
  isChecked,
  onToggle,
  onMoveToZone,
  onDragStart,
  onDragEnd,
  onEdit,
  onDelete
}: CustomExpressionItemProps) {
  const color = CustomExpressionColors[type];
  // CSS custom properties carry the per-type accent into hover states below,
  // replacing JS onMouseEnter/onMouseLeave style mutation. Also fixes a dead
  // Tailwind-style class (`hover:${hoverBg}` / `text-gray-400` / etc. were
  // never defined in styles.css, so the old hover effects were silent no-ops).
  const accentVars = { '--pp-item-accent': color, '--pp-item-accent-subtle': `${color}15` } as React.CSSProperties;

  return (
    <div
      className="flex items-center gap-2 py-0.5 cursor-move field-item"
      draggable={true}
      onDragStart={(e) => onDragStart(e, id, 'list')}
      onDragEnd={onDragEnd}
      style={{ paddingLeft: '8px', ...accentVars }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(e) => onToggle(id, e.target.checked)}
        className="w-3.5 h-3.5"
        style={{ accentColor: color }}
        aria-label={`Include ${name} (custom ${type})`}
      />

      {/* Type Icon */}
      <span
        onDragStart={(e) => e.preventDefault()}
        draggable={false}
        title={`Custom ${type}`}
        className="pp-custom-expr-icon-badge"
        style={{
          cursor: 'help',
          display: 'flex',
          alignItems: 'center',
          padding: '2px',
          borderRadius: '3px'
        }}
      >
        <CustomExpressionIcon type={type} size={14} />
      </span>

      {/* Name */}
      <label
        className="text-xs cursor-move select-none flex-1 pp-truncate"
        style={{ color }}
      >
        {name}
      </label>

      {/* Edit button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="text-xs p-0.5 pp-fade-btn pp-fade-btn-accent"
        title={`Edit ${type}`}
        aria-label={`Edit ${name}`}
        style={{ color: 'var(--text-muted)' }}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>

      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="text-xs p-0.5 pp-fade-btn pp-fade-btn-danger"
        title={`Delete ${type}`}
        aria-label={`Delete ${name}`}
        style={{ color: 'var(--text-muted)' }}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>

      {/* Move to another zone - keyboard-accessible equivalent of drag-and-drop.
          Last, matching the edit/remove-then-move order used by every other
          row type (AvailableFieldItem, FieldItem, ValueItem). */}
      {onMoveToZone && (
        <span className="pp-fade-btn pp-fade-btn-accent" style={{ color: 'var(--text-muted)' }}>
          <ZoneMoveSelect label={`Move ${name} to a zone`} onMove={onMoveToZone} />
        </span>
      )}
    </div>
  );
}
