import React from 'react';
import { ZoneMoveSelect } from '../../shared/ZoneMoveSelect';

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
  const isCustom = typeof field === 'object' && field.isCustom;

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
      className={`relative flex items-center gap-1 px-2 py-1 bg-white hover:bg-gray-50 ${onClick && !isFilterZone ? 'cursor-pointer' : 'cursor-move'} field-item zone-field ${className}`}
      style={{
        border: isCustom ? '1px solid var(--color-accent-chip-border)' : '1px solid var(--border-color-light)',
        borderRadius: '4px'
      }}
      draggable="true"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      {...props}
    >
      <span className="text-xs flex-1 pp-truncate">
        {children || label}
      </span>

      {/* Filter icon for filter zone - replaces remove button */}
      {isFilterZone && onFilterClick ? (
        <button
          onClick={handleFilterIconClick}
          className="text-gray-500 hover:text-blue-600 pointer-events-auto pp-fade-btn"
          style={{ fontSize: '10px', padding: '0 2px', lineHeight: 1 }}
          title="Edit filter"
          aria-label={`Edit filter for ${label}`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="0" y1="2" x2="10" y2="2" />
            <line x1="1" y1="5" x2="9" y2="5" />
            <line x1="2" y1="8" x2="8" y2="8" />
          </svg>
        </button>
      ) : (
        <>
          {/* Derived fields button */}
          {isAvailableZone && isDateField && onShowDerived && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onShowDerived(fieldId);
              }}
              className="text-blue-500 hover:text-blue-700 pointer-events-auto pp-fade-btn"
              style={{ fontSize: '11px', fontWeight: 600, padding: '0 4px' }}
              title="Create derived fields"
              aria-label={`Create derived fields from ${label}`}
            >
              f
            </button>
          )}

          {/* Remove button */}
          {onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(fieldId, zone);
              }}
              className="text-gray-500 hover:text-red-600 text-sm pointer-events-auto pp-fade-btn"
              title="Remove"
              aria-label={`Remove ${label}`}
            >
              ×
            </button>
          )}
        </>
      )}

      {/* Move to another zone - keyboard-accessible equivalent of drag-and-drop */}
      {onMoveToZone && zone && (
        <span className="text-gray-500 hover:text-blue-600 pointer-events-auto pp-fade-btn">
          <ZoneMoveSelect
            excludeZone={zone}
            label={`Move ${label} to a different zone`}
            onMove={onMoveToZone}
          />
        </span>
      )}
    </div>
  );
}