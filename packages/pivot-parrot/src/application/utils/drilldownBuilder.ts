/**
 * Drilldown filter builder
 * Extracts 140-line drilldown logic from PivotDisplay into testable utility
 */

import { buildFieldItemFilters } from '../../domain/query/sql/sql-builder';
import { lookupField } from '../utils/lookupField';

export interface DimensionFilter {
  field: string;
  sqlExpr?: string | null;
  value: any;
  typeName?: string | null;
}

interface DrilldownContext {
  node: any;
  leaf: any;
  rowFields: string[];
  colFields: string[];
  config: any;
  availableFields?: any[];
  derivedFieldsMap?: Record<string, any>;
  dialect?: any;
  dtypes?: Record<string, string>;
}

/**
 * Extract field name from string or object
 */
function extractFieldName(field: any): string {
  if (typeof field === 'string') return field;
  if (field && typeof field === 'object') return field.id || field.name;
  return field;
}

/**
 * Get SQL expression for derived fields
 */
function getDerivedFieldSQL(
  fieldName: string,
  availableFields: any[] = [],
  derivedFieldsMap: Record<string, any> = {},
  config: any = {}
): string | null {
  const field = lookupField(fieldName, { availableFields, derivedFieldsMap, config });
  return field ? (field.sql || field.expr || field.formula) : null;
}

/**
 * Get source field for type detection (maps derived fields to their base field)
 */
function getSourceField(fieldName: string, derivedFieldsMap: Record<string, any> = {}): string {
  for (const [sourceField, derivedFields] of Object.entries(derivedFieldsMap)) {
    if (Array.isArray(derivedFields)) {
      const isDerived = derivedFields.some(df =>
        (typeof df === 'string' ? df : df.id) === fieldName
      );
      if (isDerived) {
        return sourceField;
      }
    }
  }
  return fieldName;
}

/**
 * Resolve the engine type name for a dimension field from the dtypes map.
 * rowFields/colFields may hold a custom grouping's friendly `name` rather than
 * its `id` (the key dtypes is actually keyed by), so reverse-map through
 * config.customGroupings before the lookup.
 */
function resolveTypeName(
  fieldName: string,
  dtypes: Record<string, string> = {},
  config: any = {}
): string | null {
  const grouping = (config.customGroupings || []).find(
    (g: any) => g.id === fieldName || g.name === fieldName
  );
  const dtypeKey = grouping ? grouping.id : fieldName;
  return dtypes[dtypeKey] ?? null;
}

/**
 * Build dimension filters from row path
 */
function buildRowFilters(
  node: any,
  rowFields: string[],
  availableFields: any[],
  derivedFieldsMap: Record<string, any>,
  config: any,
  dtypes: Record<string, string> = {}
): DimensionFilter[] {
  const filters: DimensionFilter[] = [];

  if (!node.path || !rowFields) return filters;

  rowFields.forEach((field, index) => {
    const fieldName = extractFieldName(field);
    if (fieldName === 'Σ Values' || node.path[index] === undefined) return;

    const sqlExpr = getDerivedFieldSQL(fieldName, availableFields, derivedFieldsMap, config);
    const sourceField = getSourceField(fieldName, derivedFieldsMap);
    const value = node.path[index];
    const typeName = resolveTypeName(fieldName, dtypes, config);

    filters.push({
      field: sourceField,
      sqlExpr,
      value,
      typeName
    });
  });

  return filters;
}

/**
 * Build dimension filters from column path
 */
function buildColumnFilters(
  leaf: any,
  colFields: string[],
  availableFields: any[],
  derivedFieldsMap: Record<string, any>,
  config: any,
  dtypes: Record<string, string> = {}
): DimensionFilter[] {
  const filters: DimensionFilter[] = [];

  if (!leaf.path || !colFields) return filters;

  colFields.forEach((field, index) => {
    const fieldName = extractFieldName(field);
    if (fieldName === 'Σ Values' || leaf.path[index] === undefined) return;

    const sqlExpr = getDerivedFieldSQL(fieldName, availableFields, derivedFieldsMap, config);
    const sourceField = getSourceField(fieldName, derivedFieldsMap);
    const value = leaf.path[index];
    const typeName = resolveTypeName(fieldName, dtypes, config);

    filters.push({
      field: sourceField,
      sqlExpr,
      value,
      typeName
    });
  });

  return filters;
}

/**
 * Build filters from active config filters
 */
function buildConfigFilters(config: any, dialect: any, availableFields: any[] = []): DimensionFilter[] {
  if (!config.filters || config.filters.length === 0 || !dialect) {
    return [];
  }

  return buildFieldItemFilters(
    config.filters,
    dialect,
    availableFields,
    config
  );
}

/**
 * Build complete drilldown filter set from cell context
 * Consolidates row dimensions, column dimensions, and active filters
 */
export function buildDrilldownFilters(context: DrilldownContext): DimensionFilter[] {
  const {
    node,
    leaf,
    rowFields,
    colFields,
    config,
    availableFields = [],
    derivedFieldsMap = {},
    dialect,
    dtypes = {}
  } = context;

  const dimensionFilters: DimensionFilter[] = [];

  // Add row dimension filters
  const rowFilters = buildRowFilters(node, rowFields, availableFields, derivedFieldsMap, config, dtypes);
  dimensionFilters.push(...rowFilters);

  // Add column dimension filters
  const colFilters = buildColumnFilters(leaf, colFields, availableFields, derivedFieldsMap, config, dtypes);
  dimensionFilters.push(...colFilters);

  // Add config filters
  const configFilters = buildConfigFilters(config, dialect, availableFields);
  dimensionFilters.push(...configFilters);

  return dimensionFilters;
}
