import React, { useMemo, useState, useEffect } from 'react';
import { usePivotStore } from '../../../application/state/store';
import CustomExpressionDialog from './CustomExpressionDialog';
import DerivedFieldsDialog from './DerivedFieldsDialog';
import { FilterDialog } from './FilterDialog';
import { HavingFilterDialog } from './HavingFilterDialog';
import Popover from '../shared/Popover';
import SnapshotNameDialog from '../snapshots/SnapshotNameDialog';
import { filterCustomMetrics } from '../../../application/utils/fieldUtils';
import { buildFieldItemFilters, buildWhereCondition } from '../../../domain/query/sql/sql-builder';
import { fieldDisplayName } from '../../../domain/field/fieldDisplayName';
import { resolveFieldExpr } from '../../../domain/field/resolveFieldExpr';
import { useFilterPill } from '../filterPills';

/**
 * DialogsManager Component
 * Centralized manager for all dialogs in FieldOptions
 * Reads all data from store, only receives external callbacks as props
 */
interface DialogsManagerProps {
  // External data not in store
  dataEngine: any;
  snapshots: any[];
  // External callbacks
  onCreateSnapshot?: (name: string) => void;
  onManualUpdate?: (previewMode?: boolean) => Promise<string | void>;
}

export function DialogsManager({
  dataEngine,
  snapshots,
  onCreateSnapshot,
  onManualUpdate
}: DialogsManagerProps) {
  // Read data from store (single source of truth)
  const config = usePivotStore(s => s.config);
  const availableFields = usePivotStore(s => s.availableFields);

  // Store dialog states
  const expressionDialog = usePivotStore(s => s.expressionDialog);
  const derivedFieldDialog = usePivotStore(s => s.derivedFieldDialog);
  const filterDialog = usePivotStore(s => s.filterDialog);
  const havingFilterDialog = usePivotStore(s => s.havingFilterDialog);
  const showSqlDialog = usePivotStore(s => s.showSqlDialog);
  const snapshotNameDialog = usePivotStore(s => s.snapshotNameDialog);

  // Store dialog setters
  const setExpressionDialog = usePivotStore(s => s.setExpressionDialog);
  const setDerivedFieldDialog = usePivotStore(s => s.setDerivedFieldDialog);
  const setFilterDialog = usePivotStore(s => s.setFilterDialog);
  const setHavingFilterDialog = usePivotStore(s => s.setHavingFilterDialog);
  const setShowSqlDialog = usePivotStore(s => s.setShowSqlDialog);
  const setSnapshotNameDialog = usePivotStore(s => s.setSnapshotNameDialog);

  // Store actions
  const handleCreateExpression = usePivotStore(s => s.handleCreateExpression);
  const handleAddDerivedFields = usePivotStore(s => s.handleAddDerivedFields);
  const handleApplyFilter = usePivotStore(s => s.handleApplyFilter);

  const filterPill = useFilterPill(filterDialog?.anchorFieldId ?? null);
  const havingFilterPill = useFilterPill(havingFilterDialog?.anchorFieldId ?? null);

  // Local state for SQL preview
  const [previewSQL, setPreviewSQL] = useState<string | null>(null);

  // Detected dtype for custom groupings (cached)
  const [customGroupingDtypes, setCustomGroupingDtypes] = useState<Record<string, string>>({});

  // Generate SQL preview when dialog opens or config changes
  useEffect(() => {
    if (showSqlDialog && onManualUpdate) {
      const loadSQL = async () => {
        try {
          const sql = await onManualUpdate(true); // Preview mode = true
          setPreviewSQL(sql || 'No SQL generated');
        } catch (err) {
          setPreviewSQL(`Error: ${err.message}`);
        }
      };
      loadSQL();
    }
  }, [showSqlDialog, onManualUpdate, config]);

  // Compute custom metrics locally for dialog
  const customMetrics = useMemo(
    () => filterCustomMetrics(config.customMetrics || [], ''),
    [config.customMetrics]
  );

  return (
    <>
      {/* Custom Expression Dialog (Metric, Filter, Grouping) */}
      {expressionDialog && (
        <CustomExpressionDialog
          type={expressionDialog.type}
          onSave={(data) => handleCreateExpression(data, expressionDialog.type, expressionDialog.editing?.id)}
          onCancel={() => setExpressionDialog(null)}
          initialName={expressionDialog.editing?.name || ''}
          initialFormula={expressionDialog.editing?.expr || ''}
          initialFormat={(expressionDialog.editing && 'format' in expressionDialog.editing) ? expressionDialog.editing.format : null}
          availableMetrics={customMetrics.filter((m: any) => !expressionDialog.editing || m.id !== expressionDialog.editing.id)}
          availableFields={availableFields}
          config={config}
          editingId={expressionDialog.editing?.id}
        />
      )}

      {/* Derived Fields Dialog */}
      {derivedFieldDialog && (
        <DerivedFieldsDialog
          fieldName={derivedFieldDialog.fieldName}
          displayName={fieldDisplayName(derivedFieldDialog.fieldName, config, availableFields)}
          fieldType={derivedFieldDialog.fieldType}
          existingDerived={derivedFieldDialog.existingDerivedFields}
          position={derivedFieldDialog.position}
          dialect={dataEngine?.getDialect()}
          onClose={() => setDerivedFieldDialog(null)}
          onAdd={(fields) => handleAddDerivedFields(derivedFieldDialog.fieldName, fields)}
        />
      )}

      {/* Filter Dialog */}
      {filterDialog && (() => {
        // Enrich field with getUniqueValues if not present
        const enrichedField = ('getUniqueValues' in filterDialog.field)
          ? filterDialog.field
          : {
              ...filterDialog.field,
              getUniqueValues: async (filtersToApply = []) => {
                if (!dataEngine) return { values: [], truncated: false };
                try {
                  const dialect = dataEngine.getDialect();
                  const whereClause = buildWhereCondition(
                    buildFieldItemFilters(filtersToApply, dialect, availableFields, config),
                    dialect,
                    availableFields,
                    config
                  );

                  // Use field.id if available (FieldItem), otherwise field.name
                  const fieldId = filterDialog.field.id || filterDialog.field.name;

                  const expression = resolveFieldExpr(fieldId, availableFields, config, dialect);

                  return await dataEngine.getUniqueValues(
                    fieldId,
                    undefined, // tableName
                    whereClause,
                    undefined, // limit: the engine's default cap
                    null, // timeout
                    expression,
                    filterDialog.field.dtype // dtype for display conversion
                  );
                } catch (err) {
                  console.error('Failed to load unique values:', err);
                  return { values: [], truncated: false };
                }
              }
            };

        // Look up Arrow type object from dialect's type registry
        const dialect = dataEngine?.getDialect();
        const arrowType = dialect?.types?.[enrichedField.dtype];

        return (
          <FilterDialog
            field={enrichedField}
            displayName={fieldDisplayName(enrichedField.id || enrichedField.name, config, availableFields)}
            fieldType={arrowType}
            existingFilter={filterDialog.existingFilter}
            anchorEl={filterPill}
            onApply={handleApplyFilter}
            onClose={() => setFilterDialog(null)}
            activeFilters={config.filters || []}
          />
        );
      })()}

      {/* HAVING Filter Dialog (for aggregations and custom metrics) */}
      {havingFilterDialog && (
        <HavingFilterDialog
          field={havingFilterDialog.field}
          displayName={fieldDisplayName(havingFilterDialog.field.name, config, availableFields)}
          existingFilter={havingFilterDialog.existingFilter}
          anchorEl={havingFilterPill}
          onApply={handleApplyFilter}
          onClose={() => setHavingFilterDialog(null)}
        />
      )}

      {/* SQL Preview Dialog */}
      {showSqlDialog && (
        <Popover
          title="Generated SQL Preview"
          onClose={() => setShowSqlDialog(false)}
          width={700}
        >
          <div className="pp-dialog-body">
            <pre style={{
              margin: 0,
              padding: 'var(--space-3)',
              background: 'var(--surface-subtle)',
              border: '1px solid var(--border-color-light)',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'inherit',
              fontSize: 'var(--text-sm)',
              lineHeight: 1.5,
              maxHeight: '500px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              {!previewSQL ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                  <span className="pp-spinner" aria-hidden="true" />
                  Loading SQL preview...
                </span>
              ) : (() => {
                // Remove internal _grouping_* columns from display
                const cleanSQL = previewSQL.replace(/,\s*CAST\(GROUPING\([^)]+\)\s+AS\s+INTEGER\)\s+AS\s+_grouping_\w+/gi, '');
                return cleanSQL;
              })()}
            </pre>
            <div className="pp-hint">
              Note: This is the exact SQL that will be executed. Internal grouping columns have been hidden for clarity.
            </div>
          </div>
          <div className="pp-dialog-footer">
            <button onClick={() => setShowSqlDialog(false)} className="pp-btn">Close</button>
          </div>
        </Popover>
      )}

      {/* Snapshot Name Dialog */}
      {snapshotNameDialog && onCreateSnapshot && (
        <SnapshotNameDialog
          defaultName={`Snapshot ${snapshots.length + 1}`}
          onSave={(name: string) => {
            onCreateSnapshot(name);
            setSnapshotNameDialog(false);
          }}
          onCancel={() => setSnapshotNameDialog(false)}
        />
      )}
    </>
  );
}
