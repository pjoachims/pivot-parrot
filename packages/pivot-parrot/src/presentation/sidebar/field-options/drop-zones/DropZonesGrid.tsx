import React, { useEffect, useMemo } from 'react';
import { usePivotStore } from '../../../../application/state/store';
import { FieldKind } from '../../../../domain/models/types';
import DropZone from './DropZone';
import FieldItem from '../fields-list/FieldItem';
import ValueItem from './ValueItem';
import { enrichValuesWithMetrics } from '../../../../application/utils/fieldUtils';
import { getFieldById } from '../../../../application/utils/getFieldById';
import { fieldDisplayName, valueDisplayName } from '../../../../domain/field/fieldDisplayName';

/**
 * DropZonesGrid component
 * Renders the 4 drop zones: Filters, Columns, Rows, Values
 */
export default function DropZonesGrid() {
  // Read from store
  const config = usePivotStore(s => s.config);
  const detectedTypes = usePivotStore(s => s.detectedTypes);
  const availableFields = usePivotStore(s => s.availableFields);

  // UI state from store
  const dragOverZone = usePivotStore(s => s.dragOverZone);
  const insertionIndex = usePivotStore(s => s.insertionIndex);

  // Store setters
  const setDragOverZone = usePivotStore(s => s.setDragOverZone);
  const setInsertionIndex = usePivotStore(s => s.setInsertionIndex);
  const setFilterDialog = usePivotStore(s => s.setFilterDialog);
  const setHavingFilterDialog = usePivotStore(s => s.setHavingFilterDialog);
  const setExpressionDialog = usePivotStore(s => s.setExpressionDialog);

  // Pending filter open (set by handleDrop in store, handled here in component layer)
  const pendingFilterOpen = usePivotStore(s => s.pendingFilterOpen);
  const setPendingFilterOpen = usePivotStore(s => s.setPendingFilterOpen);

  // Store actions
  const handleDropAction = usePivotStore(s => s.handleDrop);
  const handleRemoveFilter = usePivotStore(s => s.handleRemoveFilter);
  const changeAggregation = usePivotStore(s => s.changeAggregation);

  // Open filter dialog after a drop adds a new filter field
  useEffect(() => {
    if (!pendingFilterOpen) return;
    const { fieldName, type } = pendingFilterOpen;
    setPendingFilterOpen(null);

    const rafId = requestAnimationFrame(() => {
      const anchorEl = document.querySelector(`[data-filter-field="${fieldName}"]`) as HTMLElement;
      if (!anchorEl) return;

      const fieldItem = getFieldById(fieldName, availableFields, config);
      if (!fieldItem) return;

      if (type === 'having') {
        setHavingFilterDialog({
          field: { name: fieldItem.id },
          existingFilter: null,
          anchorEl
        });
      } else {
        setFilterDialog({
          field: fieldItem,
          existingFilter: null,
          anchorEl
        });
      }
    });

    return () => cancelAnimationFrame(rafId);
  }, [pendingFilterOpen]);

  // Compute enriched values locally
  const enrichedValues = useMemo(
    () => enrichValuesWithMetrics(config),
    [config]
  );

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, fieldName: string, sourceZone: string, sourceIndex: number | null = null) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ fieldName, sourceZone, sourceIndex }));
    (e.currentTarget as HTMLElement).classList.add('dragging');
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove('dragging');
    setDragOverZone(null);
    setInsertionIndex(null);
  };

  const handleDragOver = (e: React.DragEvent, zone: string, index?: number | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverZone(zone);
    setInsertionIndex(index !== undefined ? index : null);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDragOverZone(null);
      setInsertionIndex(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetZone: string | null, index?: number | null) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      const { fieldName, sourceZone, sourceIndex = null } = data;

      if (targetZone) {
        handleDropAction(fieldName, sourceZone, targetZone, index !== undefined ? index : null, sourceIndex);
      }
    } catch (err) {
      console.error('Drop failed:', err);
    } finally {
      setDragOverZone(null);
      setInsertionIndex(null);
    }
  };

  const handleFilterClick = (fieldId: string, anchorEl: HTMLElement) => {
    console.log('[handleFilterClick] fieldId:', fieldId);

    const fieldItem = getFieldById(fieldId, availableFields, config);
    if (!fieldItem) {
      console.error(`FieldItem not found for: ${fieldId}`);
      return;
    }

    console.log('[handleFilterClick] fieldItem:', {
      id: fieldItem.id,
      name: fieldItem.name,
      kind: fieldItem.kind,
      dtype: fieldItem.dtype
    });

    const existingFilter = (config.filters || []).find(f => f.field === fieldId);

    switch (fieldItem.kind) {
      case FieldKind.BASE_FIELD:
      case FieldKind.DERIVED_FIELD:
      case FieldKind.CUSTOM_GROUPING:
        // Regular WHERE filter
        console.log('[handleFilterClick] fieldItem.dtype:', fieldItem.dtype, 'type:', typeof fieldItem.dtype);
        setFilterDialog({
          field: fieldItem,
          existingFilter,
          anchorEl
        });
        break;

      case FieldKind.AGGREGATION:
      case FieldKind.CUSTOM_METRIC:
        // HAVING filter
        console.log('[handleFilterClick] Opening HavingFilterDialog');
        setHavingFilterDialog({
          field: { name: fieldItem.id },
          existingFilter,
          anchorEl
        });
        break;

      case FieldKind.CUSTOM_FILTER:
        // Open expression editor
        console.log('[handleFilterClick] Opening ExpressionDialog');
        const customFilter = (config.customFilters || []).find(f => f.id === fieldId);
        if (customFilter) {
          setExpressionDialog({ type: 'filter', editing: customFilter });
        }
        break;

      default:
        console.error(`Unexpected field kind in filters: ${fieldItem.kind}`);
    }
  };

  const handleEditCustomMetric = (expressionOrValueField: any, type: string) => {
    if (expressionOrValueField.isCustom || expressionOrValueField.aggregation === 'custom') {
      const metricId = expressionOrValueField.field;
      const metric = (config.customMetrics || []).find((m: any) => m.id === metricId);
      if (metric) {
        setExpressionDialog({ type: 'metric', editing: metric });
      }
      return;
    }
    setExpressionDialog({ type: type as 'metric' | 'filter' | 'grouping', editing: expressionOrValueField });
  };

  return (
    <div className="grid grid-cols-2 bg-white" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--surface-bg)', borderTop: '1px solid var(--border-color-light)' }}>
      {/* Filters */}
      <DropZone
        title="Filters"
        zone="filters"
        dragOverZone={dragOverZone}
        insertionIndex={dragOverZone === 'filters' ? insertionIndex : null}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        borderClass="border-r border-b border-gray-200"
        borderStyle={{ borderRight: '1px solid var(--border-color-light)', borderBottom: '1px solid var(--border-color-light)' }}
        isEmpty={config.filters.length === 0}
        icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-gray-500"><rect x="3" y="7" width="10" height="2" rx="1" fill="currentColor"/></svg>
        }
      >
        {config.filters.map((field) => {
          const fieldId = typeof field === 'string' ? field : field.field;
          const fieldItem = getFieldById(fieldId, availableFields, config) || fieldId;
          // Check if filter has been configured (has values)
          const hasActiveFilter = field.value !== undefined ||
            (field.selectedValues && field.selectedValues.length > 0) ||
            (field.betweenStart !== undefined && field.betweenEnd !== undefined);

          return (
            <div key={fieldId} className="relative" data-filter-field={fieldId}>
              <FieldItem
                field={fieldItem}
                label={fieldDisplayName(fieldId, config, availableFields)}
                zone="filters"
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onRemove={handleRemoveFilter}
                onFilterClick={(e) => handleFilterClick(fieldId, e.currentTarget.parentElement)}
                onMoveToZone={(targetZone) => handleDropAction(fieldId, 'filters', targetZone, null)}
                className={hasActiveFilter ? 'border-blue-500 bg-blue-50' : ''}
                onClick={undefined}
                onShowDerived={undefined}
              >
                {null}
              </FieldItem>
            </div>
          );
        })}
      </DropZone>

      {/* Columns */}
      <DropZone
        title="Columns"
        zone="columns"
        dragOverZone={dragOverZone}
        insertionIndex={dragOverZone === 'columns' ? insertionIndex : null}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        borderClass="border-b border-gray-200"
        borderStyle={{ borderBottom: '1px solid var(--border-color-light)' }}
        isEmpty={config.columns.length === 0}
        icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-gray-500"><rect x="3" y="3" width="4" height="4" rx="1" fill="currentColor"/><rect x="9" y="3" width="4" height="4" rx="1" fill="currentColor"/><rect x="3" y="9" width="4" height="4" rx="1" fill="currentColor"/><rect x="9" y="9" width="4" height="4" rx="1" fill="currentColor"/></svg>
        }
      >
        {config.columns.map((fieldId) => {
          const fieldItem = availableFields.find(f => f.id === fieldId) || fieldId;
          return (
            <FieldItem
              key={fieldId}
              field={fieldItem}
              label={fieldDisplayName(fieldId, config, availableFields)}
              zone="columns"
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onRemove={undefined}
              onClick={undefined}
              onFilterClick={undefined}
              onShowDerived={undefined}
              onMoveToZone={(targetZone) => handleDropAction(fieldId, 'columns', targetZone, null)}
            >
              {null}
            </FieldItem>
          );
        })}
      </DropZone>

      {/* Rows */}
      <DropZone
        title="Rows"
        zone="rows"
        dragOverZone={dragOverZone}
        insertionIndex={dragOverZone === 'rows' ? insertionIndex : null}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        borderClass="border-r border-gray-200"
        borderStyle={{ borderRight: '1px solid var(--border-color-light)' }}
        isEmpty={config.rows.length === 0}
        icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-gray-500"><rect x="3" y="3" width="10" height="2" rx="1" fill="currentColor"/><rect x="3" y="7" width="10" height="2" rx="1" fill="currentColor"/><rect x="3" y="11" width="10" height="2" rx="1" fill="currentColor"/></svg>
        }
      >
        {config.rows.map((fieldId) => {
          const fieldItem = availableFields.find(f => f.id === fieldId) || fieldId;
          return (
            <FieldItem
              key={fieldId}
              field={fieldItem}
              label={fieldDisplayName(fieldId, config, availableFields)}
              zone="rows"
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onRemove={undefined}
              onClick={undefined}
              onFilterClick={undefined}
              onShowDerived={undefined}
              onMoveToZone={(targetZone) => handleDropAction(fieldId, 'rows', targetZone, null)}
            >
              {null}
            </FieldItem>
          );
        })}
      </DropZone>

      {/* Values */}
      <DropZone
        title="Values"
        zone="values"
        dragOverZone={dragOverZone}
        insertionIndex={dragOverZone === 'values' ? insertionIndex : null}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        isEmpty={config.values.length === 0}
        icon={
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-gray-500"><text x="8" y="12" textAnchor="middle" fontSize="14" fontWeight="bold" fill="currentColor">Σ</text></svg>
        }
      >
        {enrichedValues.map((valueField, index) => (
          <ValueItem
            key={`${valueField.field}-${valueField.aggregation}-${index}`}
            valueField={valueField}
            label={valueDisplayName(valueField, config, availableFields)}
            fieldLabel={fieldDisplayName(valueField.field, config, availableFields)}
            index={index}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onAggregationChange={changeAggregation}
            onEdit={valueField.isCustom ? handleEditCustomMetric : undefined}
            onMoveToZone={(dragId, targetZone) => handleDropAction(dragId, 'values', targetZone, null, index)}
            detectedTypes={detectedTypes}
          />
        ))}
      </DropZone>
    </div>
  );
}
