import React, { useRef } from 'react';
import { getAvailableAggregationsByTier } from '../../../../domain/query/sql/aggregations';
import { Arrow } from '../../../../domain/types/ArrowTypes';
import { ZoneMoveSelect } from '../../shared/ZoneMoveSelect';

export default function ValueItem({
  valueField,
  label,
  fieldLabel,
  index,
  zone = 'values',
  onDragStart,
  onDragEnd,
  onAggregationChange,
  onEdit,
  onMoveToZone,
  detectedTypes = {},
  dialect = null,  // Optional: pass dialect to filter by DB support
  ...props
}) {
  const containerRef = useRef(null);

  // Same id resolution the store's handleDrop expects, shared by drag-start
  // and the keyboard "move to zone" control below.
  const dragId = valueField.isCustom
    ? valueField.field
    : `${String(valueField.aggregation).toUpperCase()}_${valueField.field}`;

  const handleDragStart = (e) => {
    e.currentTarget.classList.add('dragging');
    onDragStart?.(e, dragId, zone, index);
  };

  const handleDragEnd = (e) => {
    e.currentTarget.classList.remove('dragging');
    onDragEnd?.(e);
  };

  // Get available aggregations based on Arrow type and dialect support, grouped by tier
  const fieldTypeName = detectedTypes[valueField.field]; // e.g., 'int64', 'float64'
  const fieldTypeInfo = Arrow[fieldTypeName]; // Look up the Arrow type object
  const { basic: basicOptions, advanced: advancedOptions } = getAvailableAggregationsByTier(fieldTypeInfo, dialect);

  return (
    <div
      ref={containerRef}
      className="relative cursor-move zone-field"
      draggable="true"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      {...props}
    >
      <div
        className="flex items-center gap-1 px-2 py-1 bg-white hover:bg-gray-50"
        style={{
          border: valueField.isCustom ? '1px solid var(--color-accent-chip-border)' : '1px solid var(--border-color-light)',
          borderRadius: '4px',
          backgroundColor: valueField.isCustom ? 'var(--color-accent-subtle)' : 'var(--surface-bg)'
        }}
      >
        <span
          className="text-xs flex-1 pp-truncate"
          style={{
            color: valueField.isCustom ? 'var(--color-accent)' : 'inherit',
            fontWeight: valueField.isCustom ? 500 : 'normal'
          }}
        >
          {label}
        </span>
        {valueField.isCustom ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit?.(valueField);
            }}
            className="text-blue-500 hover:text-blue-700 text-sm pp-fade-btn"
            title="Edit metric"
            aria-label={`Edit ${fieldLabel}`}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        ) : (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <select
              value={valueField.aggregation}
              onChange={(e) => {
                e.stopPropagation();
                onAggregationChange?.(index, e.target.value);
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onFocus={(e) => e.stopPropagation()}
              draggable={false}
              className="text-xs cursor-pointer"
              aria-label={`Aggregation for ${fieldLabel}`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: 0,
                cursor: 'pointer',
                zIndex: 1
              }}
            >
              {basicOptions.length > 0 && (
                <optgroup label="Basic">
                  {basicOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              )}
              {advancedOptions.length > 0 && (
                <optgroup label="Advanced">
                  {advancedOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ pointerEvents: 'none' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        )}

        {/* Move to another zone - keyboard-accessible equivalent of drag-and-drop */}
        {onMoveToZone && (
          <span className="text-gray-500 hover:text-blue-600 pp-fade-btn">
            <ZoneMoveSelect
              excludeZone={zone}
              label={`Move ${fieldLabel} to a different zone`}
              onMove={(targetZone) => onMoveToZone(dragId, targetZone)}
            />
          </span>
        )}
      </div>
    </div>
  );
}
