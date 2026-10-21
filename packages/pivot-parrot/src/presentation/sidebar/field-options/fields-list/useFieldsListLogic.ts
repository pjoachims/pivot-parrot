import React, { useMemo, useCallback, useState } from 'react';
import { usePivotStore } from '../../../../application/state/store';
import { FieldItem } from '../../../../domain/field/FieldItem';
import { isFieldUsed, isCustomMetricInUse } from '../../../../application/utils/fieldUtils';
import { clearResolverCache } from '../../../../domain/field/derived-field-resolver-v2';
import { checkboxTargetZone } from '../../../../application/state/actions';

/**
 * useFieldsListLogic - Business logic hook for FieldsList component
 * Extracts all state management and event handlers from the UI components
 */
export function useFieldsListLogic() {
  // Read from store
  const config = usePivotStore(s => s.config);
  const availableFields = usePivotStore(s => s.availableFields);
  const searchQuery = usePivotStore(s => s.searchQuery);
  const detectedTypes = usePivotStore(s => s.detectedTypes);
  const dialect = usePivotStore(s => s.dialect);

  // Store actions
  const setConfig = usePivotStore(s => s.setConfig);
  const setDerivedFieldDialog = usePivotStore(s => s.setDerivedFieldDialog);
  const setExpressionDialog = usePivotStore(s => s.setExpressionDialog);
  const handleDrop = usePivotStore(s => s.handleDrop);
  const removeFieldFromAllZones = usePivotStore(s => s.removeFieldFromAllZones);
  const deleteCustomExpression = usePivotStore(s => s.deleteCustomExpression);

  // Local state
  const [renameDialog, setRenameDialog] = useState<any>(null);

  // Compute derivedFieldsMap locally from availableFields
  const derivedFieldsMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    availableFields.forEach(field => {
      if (field.kind === 'derived_field' && field.sourceField && field.formula) {
        if (!map[field.sourceField]) {
          map[field.sourceField] = [];
        }
        map[field.sourceField].push({
          id: field.id,
          label: field.name,
          sql: field.formula
        });
      }
    });
    return map;
  }, [availableFields]);

  // Handle field checkbox change
  const handleFieldCheckboxChange = useCallback((fieldId: string, checked: boolean) => {
    if (checked) {
      const zone = checkboxTargetZone(fieldId, config, availableFields, detectedTypes);
      handleDrop(fieldId, 'available', zone, (config[zone] || []).length);
    } else {
      removeFieldFromAllZones(fieldId);
    }
  }, [config, availableFields, detectedTypes, handleDrop, removeFieldFromAllZones]);

  // Handle custom metric checkbox change
  const handleCustomMetricCheckboxChange = useCallback((metricId: string, checked: boolean) => {
    if (checked) {
      handleDrop(metricId, 'available', 'values', config.values.length);
    } else {
      // Remove only from values, keep in customMetrics
      const newConfig = {
        ...config,
        values: config.values.filter(v => {
          const fieldId = typeof v.field === 'string' ? v.field : (v.field as { id: string }).id;
          return fieldId !== metricId;
        })
      };
      setConfig(newConfig);
    }
  }, [config, handleDrop, setConfig]);

  // Keyboard-accessible equivalent of dragging a field/expression from the
  // list onto a zone - same store entry point (handleDrop) as both the
  // checkbox and mouse drag-and-drop use, so behavior stays identical.
  const handleMoveFieldToZone = useCallback((fieldId: string, targetZone: string) => {
    handleDrop(fieldId, 'available', targetZone, null);
  }, [handleDrop]);

  // Handle drag start
  const handleDragStart = useCallback((e: React.DragEvent, fieldName: string, sourceZone: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ fieldName, sourceZone }));
    (e.currentTarget as HTMLElement).classList.add('dragging');
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback((e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove('dragging');
  }, []);

  // Handle show derived dialog
  const handleShowDerivedDialog = useCallback((fieldName: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const existingDerivedFields = derivedFieldsMap[fieldName] || [];
    const fieldType = detectedTypes[fieldName];
    setDerivedFieldDialog({ fieldName, fieldType: String(fieldType), existingDerivedFields });
  }, [derivedFieldsMap, detectedTypes, setDerivedFieldDialog]);

  // Handle edit expression
  const handleEditExpression = useCallback((expr: any, type: string) => {
    if (expr.isCustom || expr.aggregation === 'custom') {
      const metricId = expr.field;
      const metric = (config.customMetrics || []).find((m: any) => m.id === metricId);
      if (metric) {
        setExpressionDialog({ type: 'metric', editing: metric });
      }
      return;
    }
    setExpressionDialog({ type: type as 'metric' | 'filter' | 'grouping', editing: expr });
  }, [config.customMetrics, setExpressionDialog]);

  // Handle delete expression
  const handleDeleteExpression = useCallback((expression: any, type: 'metric' | 'filter' | 'grouping') => {
    const typeName = type === 'metric' ? 'metric' : type === 'filter' ? 'filter' : 'grouping';

    if (window.confirm(`Delete ${typeName} "${expression.name}"?`)) {
      deleteCustomExpression(expression.id, type);
      clearResolverCache();
    }
  }, [deleteCustomExpression]);

  // Handle field rename
  const handleFieldRename = useCallback((fieldId: string, newName: string) => {
    const newConfig = {
      ...config,
      fieldNameOverrides: {
        ...(config.fieldNameOverrides || {}),
        [fieldId]: newName
      }
    };
    setConfig(newConfig);
    setRenameDialog(null);
  }, [config, setConfig]);

  // Handle rename button click
  const handleRenameClick = useCallback((field: FieldItem, anchorEl: HTMLElement) => {
    setRenameDialog({ field: { id: field.id, name: field.name }, anchorEl });
  }, []);

  // Handle save aggregation as metric
  const handleSaveAsMetric = useCallback((agg: any) => {
    if (!dialect) return;
    const expr = dialect.buildAggregation(agg.field, agg.aggregation);

    const newMetric = {
      id: `metric_${Date.now()}`,
      name: agg.name,
      expr
    };

    // Replace the regular aggregation in Values with the new custom metric reference
    const updatedValues = config.values.map(v => {
      if (v.field === agg.field && v.aggregation === agg.aggregation) {
        return {
          field: newMetric.id,
          aggregation: 'sum' as const,
          isCustom: true
        };
      }
      return v;
    });

    const newConfig = {
      ...config,
      customMetrics: [...(config.customMetrics || []), newMetric],
      values: updatedValues
    };
    setConfig(newConfig);
  }, [config, setConfig, dialect]);

  // Compute sets for checking if fields are in use
  const checkedFields = useMemo(() => {
    return new Set(
      availableFields
        .map(f => f.id)
        .filter(fieldId => isFieldUsed(fieldId, config))
    );
  }, [availableFields, config]);

  const checkedMetrics = useMemo(() => {
    return new Set(
      (config.customMetrics || [])
        .map((m: any) => m.id)
        .filter(metricId => isCustomMetricInUse(metricId, config))
    );
  }, [config]);

  const checkedFilters = useMemo(() => {
    return new Set(
      (config.customFilters || [])
        .map((f: any) => f.id)
        .filter(filterId => isFieldUsed(filterId, config))
    );
  }, [config]);

  const checkedGroupings = useMemo(() => {
    return new Set(
      (config.customGroupings || [])
        .map((g: any) => g.id)
        .filter(groupingId => isFieldUsed(groupingId, config))
    );
  }, [config]);

  return {
    // State
    config,
    availableFields,
    searchQuery,
    detectedTypes,
    derivedFieldsMap,
    renameDialog,
    checkedFields,
    checkedMetrics,
    checkedFilters,
    checkedGroupings,

    // Handlers
    handleFieldCheckboxChange,
    handleCustomMetricCheckboxChange,
    handleMoveFieldToZone,
    handleDragStart,
    handleDragEnd,
    handleShowDerivedDialog,
    handleEditExpression,
    handleDeleteExpression,
    handleFieldRename,
    handleRenameClick,
    handleSaveAsMetric,
    setRenameDialog
  };
}
