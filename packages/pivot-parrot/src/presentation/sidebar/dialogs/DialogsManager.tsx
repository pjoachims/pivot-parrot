import React, { useMemo, useState, useEffect } from 'react';
import { usePivotStore } from '../../../application/state/store';
import CustomExpressionDialog from './CustomExpressionDialog';
import DerivedFieldsDialog from './DerivedFieldsDialog';
import { FilterDialog } from './FilterDialog';
import { HavingFilterDialog } from './HavingFilterDialog';
import Popover from '../shared/Popover';
import SnapshotNameDialog from '../snapshots/SnapshotNameDialog';
import { filterCustomMetrics } from '../../../application/utils/fieldUtils';
import { buildWhereClauses } from '../../../domain/query/sql/sql-builder';
import { FieldKind } from '../../../domain/models/types';
import { fieldDisplayName } from '../../../domain/field/fieldDisplayName';
import { buildReferenceLookup, resolveDerivedFieldsInExpressionV2 } from '../../../domain/field/derived-field-resolver-v2';

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
                if (!dataEngine) return [];
                try {
                  // Build WHERE clause from filters
                  let whereClause = '';
                  const dialect = dataEngine.getDialect();
                  if (filtersToApply.length > 0) {
                    const { whereClause: where } = buildWhereClauses(
                      filtersToApply,
                      config.customFilters || [],
                      dialect,
                      config.values || [],
                      config.customMetrics || [],
                      config.hiddenValues || []
                    );
                    whereClause = where.replace(/^WHERE\s+/i, '');
                  }

                  // Use field.id if available (FieldItem), otherwise field.name
                  const fieldId = filterDialog.field.id || filterDialog.field.name;

                  // For custom groupings, resolve the expression
                  let expression = null;
                  if (filterDialog.field.kind === FieldKind.CUSTOM_GROUPING && filterDialog.field.formula) {
                    const referenceLookup = buildReferenceLookup({
                      availableFields,
                      customGroupings: config.customGroupings || [],
                      customMetrics: config.customMetrics || [],
                      values: config.values || [],
                      hiddenValues: config.hiddenValues || [],
                      dialect
                    });
                    expression = resolveDerivedFieldsInExpressionV2(filterDialog.field.formula, referenceLookup);
                  }

                  return await dataEngine.getUniqueValues(
                    fieldId,
                    undefined, // tableName
                    whereClause,
                    null, // limit
                    null, // timeout
                    expression, // resolved expression for custom groupings
                    filterDialog.field.dtype // dtype for display conversion
                  );
                } catch (err) {
                  console.error('Failed to load unique values:', err);
                  return [];
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
            anchorEl={filterDialog.anchorEl}
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
          anchorEl={havingFilterDialog.anchorEl}
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
          <div style={{ padding: '12px' }}>
            <div style={{
              background: 'var(--surface-subtle)',
              border: '1px solid var(--border-color-light)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px',
              fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
              fontSize: 'var(--text-sm)',
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
            </div>
            <div style={{ marginTop: '12px', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              Note: This is the exact SQL that will be executed. Internal grouping columns have been hidden for clarity.
            </div>
            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSqlDialog(false)}
                style={{
                  padding: '6px 12px',
                  fontSize: 'var(--text-base)',
                  fontWeight: 500,
                  color: 'var(--text-inverse)',
                  background: 'var(--color-accent)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
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
