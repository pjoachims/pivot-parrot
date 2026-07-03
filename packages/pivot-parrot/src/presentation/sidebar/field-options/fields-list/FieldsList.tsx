import React from 'react';
import { useFieldsListLogic } from './useFieldsListLogic';
import { AvailableFieldsSection } from './AvailableFieldsSection';
import { CustomMetricsSection } from './CustomMetricsSection';
import { CustomFiltersSection } from './CustomFiltersSection';
import { CustomGroupingsSection } from './CustomGroupingsSection';
import { ActiveAggregationsSection } from './ActiveAggregationsSection';
import FieldRenameDialog from '../../dialogs/FieldRenameDialog';
import { filterAvailableFields, filterCustomMetrics } from '../../../../application/utils/fieldUtils';

/**
 * FieldsList component - Refactored orchestrator
 * Renders the available fields list with checkboxes, derived fields, and custom metrics
 * All business logic is extracted to useFieldsListLogic hook
 */
export default function FieldsList() {
  const {
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
  } = useFieldsListLogic();

  // Compute filtered lists locally
  const availableFieldsFiltered = filterAvailableFields(availableFields, derivedFieldsMap, searchQuery);
  const customMetrics = filterCustomMetrics(config.customMetrics || [], searchQuery);
  const customFilters = filterCustomMetrics(config.customFilters || [], searchQuery);
  const customGroupings = filterCustomMetrics(config.customGroupings || [], searchQuery);

  // Get display name for a field (override or original)
  const getFieldDisplayName = (fieldId: string) => {
    return config.fieldNameOverrides?.[fieldId] || fieldId;
  };

  return (
    <div className="flex-1 overflow-y-auto bg-white">
      <div className="px-3 py-2">
        {availableFieldsFiltered.length === 0 && customMetrics.length === 0 && searchQuery ? (
          <div className="text-xs text-gray-500 text-center py-4">
            No fields matching "{searchQuery}"
          </div>
        ) : null}

        {/* Available Fields Section */}
        <AvailableFieldsSection
          fields={availableFieldsFiltered}
          searchQuery={searchQuery}
          checkedFields={checkedFields}
          derivedFieldsMap={derivedFieldsMap}
          detectedTypes={detectedTypes}
          fieldNameOverrides={config.fieldNameOverrides || {}}
          onToggleField={handleFieldCheckboxChange}
          onMoveToZone={handleMoveFieldToZone}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onRename={handleRenameClick}
          onShowDerived={handleShowDerivedDialog}
        />

        {/* Custom Metrics Section */}
        <CustomMetricsSection
          customMetrics={customMetrics}
          searchQuery={searchQuery}
          checkedMetrics={checkedMetrics}
          onToggleMetric={handleCustomMetricCheckboxChange}
          onMoveToZone={handleMoveFieldToZone}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onEdit={(metric) => handleEditExpression(metric, 'metric')}
          onDelete={(metric) => handleDeleteExpression(metric, 'metric')}
        />

        {/* Custom Groupings Section */}
        <CustomGroupingsSection
          customGroupings={customGroupings}
          searchQuery={searchQuery}
          checkedGroupings={checkedGroupings}
          onToggleGrouping={handleFieldCheckboxChange}
          onMoveToZone={handleMoveFieldToZone}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onEdit={(grouping) => handleEditExpression(grouping, 'grouping')}
          onDelete={(grouping) => handleDeleteExpression(grouping, 'grouping')}
        />

        {/* Custom Filters Section */}
        <CustomFiltersSection
          customFilters={customFilters}
          searchQuery={searchQuery}
          checkedFilters={checkedFilters}
          onToggleFilter={handleFieldCheckboxChange}
          onMoveToZone={handleMoveFieldToZone}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onEdit={(filter) => handleEditExpression(filter, 'filter')}
          onDelete={(filter) => handleDeleteExpression(filter, 'filter')}
        />

        {/* Active Aggregations Section */}
        <ActiveAggregationsSection
          config={config}
          searchQuery={searchQuery}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onSaveAsMetric={handleSaveAsMetric}
        />
      </div>

      {/* Field Rename Dialog */}
      {renameDialog && (
        <FieldRenameDialog
          field={renameDialog.field}
          currentName={getFieldDisplayName(renameDialog.field.id)}
          onApply={handleFieldRename}
          onClose={() => setRenameDialog(null)}
          anchorEl={renameDialog.anchorEl}
        />
      )}
    </div>
  );
}
