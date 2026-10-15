import React from 'react';
import { FieldItem } from '../../../../domain/field/FieldItem';
import TypeIcon from '../../shared/TypeIcon';
import { ZoneMoveSelect } from '../../shared/ZoneMoveSelect';
import { Icon } from '../../../shared/Icon';

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
  return (
    <div
      className="pp-field-row field-item"
      draggable={true}
      onDragStart={(e) => onDragStart(e, field.id)}
      onDragEnd={onDragEnd}
      style={isDerivedField ? { paddingLeft: 'calc(var(--space-2) + 19px)' } : undefined}
    >
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(e) => onToggle(field.id, e.target.checked)}
        aria-label={`Include ${displayName}`}
      />

      <span
        onDragStart={(e) => e.preventDefault()}
        draggable={false}
        title={field.originalType || field.dtype || String(detectedType)}
        className="pp-field-row__icon"
        style={{ cursor: 'help' }}
      >
        <TypeIcon type={detectedType} />
      </span>

      <label className="pp-field-row__label">{displayName}</label>

      {/* Always in the DOM (hidden via CSS until hover/focus) so the actions stay keyboard-reachable */}
      <span className="pp-row-actions">
        {!isDerivedField && canHaveDerivedFields && onShowDerived && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShowDerived(field.id, e);
            }}
            className="pp-icon-btn pp-icon-btn--sm"
            title="Create derived fields"
            aria-label={`Create derived fields from ${displayName}`}
          >
            <Icon name="calendar-plus" />
          </button>
        )}
        {!isDerivedField && onRename && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRename(field, e.currentTarget);
            }}
            className="pp-icon-btn pp-icon-btn--sm"
            title="Rename field"
            aria-label={`Rename ${displayName}`}
          >
            <Icon name="pencil" />
          </button>
        )}
        {onMoveToZone && (
          <ZoneMoveSelect label={`Move ${displayName} to a zone`} onMove={(zone) => onMoveToZone(field.id, zone)} />
        )}
      </span>
    </div>
  );
}
