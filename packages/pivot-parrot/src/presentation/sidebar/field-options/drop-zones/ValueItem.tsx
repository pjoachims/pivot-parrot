import React, { useRef } from 'react';
import { getAvailableAggregationsByTier } from '../../../../domain/query/sql/aggregations';
import { Arrow } from '../../../../domain/types/ArrowTypes';
import { ZoneMoveSelect } from '../../shared/ZoneMoveSelect';
import { Icon } from '../../../shared/Icon';

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
      className="pp-chip zone-field"
      draggable="true"
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      {...props}
    >
      <span className="pp-chip__label">{label}</span>
      {/* Move sits before the aggregation picker so the chevron keeps the chip's right edge */}
      {onMoveToZone && (
        <span className="pp-row-actions">
          <ZoneMoveSelect
            excludeZone={zone}
            label={`Move ${fieldLabel} to a different zone`}
            onMove={(targetZone) => onMoveToZone(dragId, targetZone)}
          />
        </span>
      )}
      {valueField.isCustom ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.(valueField);
          }}
          className="pp-icon-btn pp-icon-btn--sm"
          title="Edit metric"
          aria-label={`Edit ${fieldLabel}`}
        >
          <Icon name="pencil" />
        </button>
      ) : (
        <span className="pp-chip__agg" title="Aggregation">
          <Icon name="chevron-down" />
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
            aria-label={`Aggregation for ${fieldLabel}`}
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
        </span>
      )}

    </div>
  );
}
