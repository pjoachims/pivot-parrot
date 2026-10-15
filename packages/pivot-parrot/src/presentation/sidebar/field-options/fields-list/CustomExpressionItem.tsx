import React from 'react';
import { CustomExpressionIcon, type CustomExpressionType } from '../../shared/CustomExpressionIcons';
import { Icon } from '../../../shared/Icon';
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
  return (
    <div
      className="pp-field-row field-item"
      draggable={true}
      onDragStart={(e) => onDragStart(e, id, 'list')}
      onDragEnd={onDragEnd}
    >
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(e) => onToggle(id, e.target.checked)}
        aria-label={`Include ${name} (custom ${type})`}
      />

      <span
        onDragStart={(e) => e.preventDefault()}
        draggable={false}
        title={`Custom ${type}`}
        className="pp-field-row__icon"
        style={{ cursor: 'help' }}
      >
        <CustomExpressionIcon type={type} />
      </span>

      <label className="pp-field-row__label">{name}</label>

      <span className="pp-row-actions">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="pp-icon-btn pp-icon-btn--sm"
          title={`Edit ${type}`}
          aria-label={`Edit ${name}`}
        >
          <Icon name="pencil" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="pp-icon-btn pp-icon-btn--sm pp-icon-btn--danger"
          title={`Delete ${type}`}
          aria-label={`Delete ${name}`}
        >
          <Icon name="trash" />
        </button>
        {onMoveToZone && (
          <ZoneMoveSelect label={`Move ${name} to a zone`} onMove={onMoveToZone} />
        )}
      </span>
    </div>
  );
}
