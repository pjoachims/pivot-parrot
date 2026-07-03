import React, { useMemo } from 'react';
import { FieldItem, inferSemanticType } from '../../../../domain/field/FieldItem';
import { FieldKind } from '../../../../domain/models/types';
import { AvailableFieldItem } from './AvailableFieldItem';

interface AvailableFieldsSectionProps {
  fields: FieldItem[];
  searchQuery: string;
  checkedFields: Set<string>;
  derivedFieldsMap: Record<string, any[]>;
  detectedTypes: Record<string, string | number>;
  fieldNameOverrides: Record<string, string>;
  onToggleField: (fieldId: string, checked: boolean) => void;
  onMoveToZone?: (fieldId: string, targetZone: string) => void;
  onDragStart: (e: React.DragEvent, fieldId: string, sourceZone: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onRename?: (field: FieldItem, anchorEl: HTMLElement) => void;
  onShowDerived?: (fieldId: string, event: React.MouseEvent) => void;
}

/**
 * AvailableFieldsSection - Renders the available fields list with search filtering
 * Handles both base fields and nested derived fields
 */
export function AvailableFieldsSection({
  fields,
  searchQuery,
  checkedFields,
  derivedFieldsMap,
  detectedTypes,
  fieldNameOverrides,
  onToggleField,
  onMoveToZone,
  onDragStart,
  onDragEnd,
  onRename,
  onShowDerived
}: AvailableFieldsSectionProps) {
  // Filter fields based on search query
  const filteredFields = useMemo(() => {
    if (!searchQuery) return fields;
    const lowerQuery = searchQuery.toLowerCase();
    return fields.filter(f => {
      const displayName = fieldNameOverrides[f.id] || f.name;
      return displayName.toLowerCase().includes(lowerQuery);
    });
  }, [fields, searchQuery, fieldNameOverrides]);

  // Get display name for a field (override or original)
  const getFieldDisplayName = (fieldId: string, fieldName: string) => {
    return fieldNameOverrides[fieldId] || fieldName;
  };

  return (
    <>
      {filteredFields.map((field) => {
        // Check if this field is a derived field using FieldKind
        const isDerivedField = field.kind === FieldKind.DERIVED_FIELD;

        // Skip derived fields in the main list - they'll be shown nested under their parent
        if (isDerivedField) {
          return null;
        }

        // Check if field supports derived children using semantic type from dtype
        const semanticType = inferSemanticType(field.dtype);
        const canHaveDerivedFields = semanticType === 'date';

        // Get derived children - handle both old format (IDs) and new format (objects)
        const derivedChildren = (derivedFieldsMap[field.id] || [])
          .map(df => (typeof df === 'string' ? df : df.id))
          .filter(dfId => {
            // Check if this derived field exists in availableFields
            return fields.some(f => f.id === dfId);
          });

        return (
          <React.Fragment key={field.id}>
            {/* Render parent field */}
            <AvailableFieldItem
              field={field}
              isChecked={checkedFields.has(field.id)}
              isDerivedField={false}
              canHaveDerivedFields={canHaveDerivedFields}
              displayName={getFieldDisplayName(field.id, field.name)}
              detectedType={detectedTypes[field.id]}
              onToggle={onToggleField}
              onMoveToZone={onMoveToZone}
              onDragStart={(e, fieldId) => onDragStart(e, fieldId, 'list')}
              onDragEnd={onDragEnd}
              onRename={onRename}
              onShowDerived={onShowDerived}
            />

            {/* Render derived children indented below parent */}
            {derivedChildren.map(derivedFieldId => {
              const derivedFieldItem = fields.find(f => f.id === derivedFieldId);
              if (!derivedFieldItem) return null;

              return (
                <div key={`derived-${field.id}-${derivedFieldId}`}>
                  <AvailableFieldItem
                    field={derivedFieldItem}
                    isChecked={checkedFields.has(derivedFieldId)}
                    isDerivedField={true}
                    canHaveDerivedFields={false}
                    displayName={derivedFieldItem.name}
                    detectedType={detectedTypes[derivedFieldId]}
                    onToggle={onToggleField}
                    onMoveToZone={onMoveToZone}
                    onDragStart={(e, fieldId) => onDragStart(e, fieldId, 'list')}
                    onDragEnd={onDragEnd}
                  />
                </div>
              );
            })}
          </React.Fragment>
        );
      })}
    </>
  );
}
