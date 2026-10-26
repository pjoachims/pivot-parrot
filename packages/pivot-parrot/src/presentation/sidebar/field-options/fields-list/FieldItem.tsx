import React from 'react';
import { ZoneMoveSelect } from '../../shared/ZoneMoveSelect';
import { Icon } from '../../../shared/Icon';

export default function FieldItem({
  field,
  label,
  zone,
  onDragStart,
  onDragEnd,
  onRemove,
  onClick,
  onFilterClick,
  onMoveToZone,
  children,
  className = "",
  detectedTypes = {},
  onShowDerived,
  ...props
}) {
  const fieldId = typeof field === 'string' ? field : field.id;

  const isDateField = detectedTypes[fieldId] === 'date';
  const isAvailableZone = zone === 'available';
  const isFilterZone = zone === 'filters';

  const handleDragStart = (e) => {
    e.currentTarget.classList.add('dragging');
    onDragStart?.(e, fieldId, zone);
  };

  const handleDragEnd = (e) => {
    e.currentTarget.classList.remove('dragging');
    onDragEnd?.(e);
  };

  const handleClick = (e) => {
    if (onClick && !isFilterZone) {
      e.stopPropagation();
      onClick();
    }
  };

  const handleFilterIconClick = (e) => {
    if (onFilterClick) {
      e.stopPropagation();
      onFilterClick(e);
    }
  };

  return (
    <div
      className={`pp-chip zone-field${className ? ` ${className}` : ''}`}
      style={onClick && !isFilterZone ? { cursor: 'pointer' } : undefined}
      draggable="true"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      {...props}
    >
      <span className="pp-chip__label">{children || label}</span>

      <span className="pp-row-actions">
        {isFilterZone && onFilterClick && (
          <button
            onClick={handleFilterIconClick}
            className="pp-icon-btn pp-icon-btn--sm"
            title="Edit filter"
            aria-label={`Edit filter for ${label}`}
          >
            <Icon name="filter" />
          </button>
        )}
        {isAvailableZone && isDateField && onShowDerived && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShowDerived(fieldId);
            }}
            className="pp-icon-btn pp-icon-btn--sm"
            title="Create derived fields"
            aria-label={`Create derived fields from ${label}`}
          >
            <Icon name="calendar-plus" />
          </button>
        )}
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(fieldId, zone);
            }}
            className="pp-icon-btn pp-icon-btn--sm pp-icon-btn--danger"
            title="Remove"
            aria-label={`Remove ${label}`}
          >
            <Icon name="x" />
          </button>
        )}

        {onMoveToZone && zone && (
          <ZoneMoveSelect
            excludeZone={zone}
            label={`Move ${label} to a different zone`}
            onMove={onMoveToZone}
          />
        )}
      </span>
    </div>
  );
}
