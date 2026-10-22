import React from 'react';
import { useFieldsListLogic } from './useFieldsListLogic';
import { FieldTree } from './FieldTree';
import { CustomFiltersSection } from './CustomFiltersSection';
import { CustomGroupingsSection } from './CustomGroupingsSection';
import { ActiveAggregationsSection } from './ActiveAggregationsSection';
import FieldRenameDialog from '../../dialogs/FieldRenameDialog';
import { filterCustomMetrics } from '../../../../application/utils/fieldUtils';
import { fieldDisplayName } from '../../../../domain/field/fieldDisplayName';

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
  const customFilters = filterCustomMetrics(config.customFilters || [], searchQuery);
  const customGroupings = filterCustomMetrics(config.customGroupings || [], searchQuery);

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--surface-bg)' }}>
      <div style={{ padding: '0 var(--space-1) var(--space-2)' }}>
        <FieldTree
          fields={availableFields}
          metrics={config.customMetrics || []}
          searchQuery={searchQuery}
          config={config}
          checkedFields={checkedFields}
          checkedMetrics={checkedMetrics}
          derivedFieldsMap={derivedFieldsMap}
          detectedTypes={detectedTypes}
          onToggleField={handleFieldCheckboxChange}
          onToggleMetric={handleCustomMetricCheckboxChange}
          onMoveToZone={handleMoveFieldToZone}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onRename={handleRenameClick}
          onShowDerived={handleShowDerivedDialog}
          onEditMetric={(metric) => handleEditExpression(metric, 'metric')}
          onDeleteMetric={(metric) => handleDeleteExpression(metric, 'metric')}
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
          currentName={fieldDisplayName(renameDialog.field.id, config, availableFields)}
          onApply={handleFieldRename}
          onClose={() => setRenameDialog(null)}
          anchorEl={renameDialog.anchorEl}
        />
      )}
    </div>
  );
}
