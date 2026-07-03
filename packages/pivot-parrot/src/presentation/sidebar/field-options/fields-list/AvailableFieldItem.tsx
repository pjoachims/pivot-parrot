import React from 'react';
import { FieldItem } from '../../../../domain/field/FieldItem';
import TypeIcon from '../../shared/TypeIcon';
import { ZoneMoveSelect } from '../../shared/ZoneMoveSelect';

interface AvailableFieldItemProps {
  field: FieldItem;
  isChecked: boolean;
  isDerivedField: boolean;
  canHaveDerivedFields: boolean;
  displayName: string;
  detectedType: string | number;
  onToggle: (fieldId: string, checked: boolean) => void;
  onMoveToZone?: (fieldId: string, targetZone: string) => void;
  onDragStart: (e: React.DragEvent, fieldId: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onRename?: (field: FieldItem, anchorEl: HTMLElement) => void;
  onShowDerived?: (fieldId: string, event: React.MouseEvent) => void;
}

/**
 * AvailableFieldItem - Renders a single field row in the available fields list
 * Handles checkboxes, type icons, drag-and-drop, and hover actions (rename, derived fields)
 */
export function AvailableFieldItem({
  field,
  isChecked,
  isDerivedField,
  canHaveDerivedFields,
  displayName,
  detectedType,
  onToggle,
  onMoveToZone,
  onDragStart,
  onDragEnd,
  onRename,
  onShowDerived
}: AvailableFieldItemProps) {
  const paddingLeft = isDerivedField ? '32px' : '8px';
  const opacity = isDerivedField ? 0.9 : 1;

  return (
    <div
      className="flex items-center gap-2 py-0.5 hover:bg-gray-100 cursor-move field-item"
      draggable={true}
      onDragStart={(e) => onDragStart(e, field.id)}
      onDragEnd={onDragEnd}
      style={{ paddingLeft, opacity }}
    >
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(e) => onToggle(field.id, e.target.checked)}
        className="w-3.5 h-3.5"
        aria-label={`Include ${displayName}`}
      />

      {/* Type Icon */}
      <span
        onDragStart={(e) => e.preventDefault()}
        draggable={false}
        title={field.originalType || field.dtype || String(detectedType)}
        className="pp-type-icon-badge"
        style={{
          cursor: 'help',
          display: 'flex',
          alignItems: 'center',
          padding: '2px',
          borderRadius: '3px'
        }}
      >
        <TypeIcon type={detectedType} size={14} />
      </span>

      {/* Field Name */}
      <label className="text-xs cursor-move select-none flex-1 pp-truncate">
        {displayName}
      </label>

      {/* Rename button - always in the DOM (dimmed via CSS) so it stays
          keyboard-reachable; previously rendered only on hover, which made
          it permanently unreachable by Tab. */}
      {!isDerivedField && onRename && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRename(field, e.currentTarget);
          }}
          className="text-gray-400 hover:text-blue-600 pointer-events-auto pp-fade-btn"
          style={{ fontSize: '10px', padding: '0 2px' }}
          title="Rename field"
          aria-label={`Rename ${displayName}`}
        >
          <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      )}

      {/* Derived fields button - always in the DOM, same reasoning as above */}
      {!isDerivedField && canHaveDerivedFields && onShowDerived && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onShowDerived(field.id, e);
          }}
          className="text-blue-500 hover:text-blue-700 pointer-events-auto pp-fade-btn"
          style={{ fontSize: '11px', fontWeight: 600, padding: '0 4px' }}
          title="Create derived fields"
          aria-label={`Create derived fields from ${displayName}`}
        >
          f
        </button>
      )}

      {/* Move to zone - keyboard-accessible equivalent of drag-and-drop */}
      {onMoveToZone && (
        <span className="text-gray-400 hover:text-blue-600 pp-fade-btn">
          <ZoneMoveSelect label={`Move ${displayName} to a zone`} onMove={(zone) => onMoveToZone(field.id, zone)} />
        </span>
      )}
    </div>
  );
}
