/**
 * FieldItem - Represents a field in the pivot table
 *
 * Plain object structure (no class, no getters) for easy serialization.
 *
 * Can be:
 * - Base field (from schema)
 * - Derived field (date parts, bins)
 * - Simple measure (field + aggregation)
 * - Custom measure (formula)
 */

import { FieldKind } from '../models/types';
import { normalizePath } from './fieldTree';

/**
 * FieldItem plain object interface
 */
export interface FieldItem {
  id: string;                   // Unique identifier for SQL queries
  name: string;                 // Display name
  dtype: string;                // Arrow type: 'int64', 'string', 'date32', etc.
  originalType: string | null;  // Native DB type: 'BIGINT', 'VARCHAR', etc.
  kind: FieldKind;
  sourceField: string | null;   // Parent field for derived/aggregations
  aggregation: string | null;   // 'sum', 'avg', etc.
  formula: string | null;       // SQL expression
  format: any | null;           // Display formatting config
  path?: string[];              // Folders in the field list, from the top
}

/**
 * Factory Functions
 */

/**
 * Create a base field from schema
 */
export function fromSchema(columnInfo: { name: string; type: string; originalType?: string; path?: unknown }): FieldItem {
  const path = normalizePath(columnInfo.path);
  return {
    id: columnInfo.name,
    name: columnInfo.name,
    dtype: columnInfo.type,
    originalType: columnInfo.originalType || null,
    kind: FieldKind.BASE_FIELD,
    sourceField: null,
    aggregation: null,
    formula: null,
    format: null,
    ...(path ? { path } : {})
  };
}

/**
 * Create a derived field (e.g., date part)
 */
export function createDerived({
  id,
  name,
  dtype,
  sourceField,
  formula
}: {
  id: string;
  name: string;
  dtype: string;
  sourceField: string;
  formula: string;
}): FieldItem {
  return {
    id,
    name,
    dtype,
    originalType: null,
    kind: FieldKind.DERIVED_FIELD,
    sourceField,
    aggregation: null,
    formula,
    format: null
  };
}

/**
 * Create a simple measure (field + aggregation)
 */
export function createMeasure({
  sourceField,
  aggregation,
  dtype = 'double',
  name = null
}: {
  sourceField: string;
  aggregation: string;
  dtype?: string;
  name?: string | null;
}): FieldItem {
  // Normalize aggregation to lowercase for SQL column name
  const normalizedAgg = aggregation.toLowerCase();
  const id = `${normalizedAgg}_${sourceField}`;
  const displayName = name || `${aggregation.toUpperCase()} of ${sourceField}`;

  return {
    id,
    name: displayName,
    dtype,
    originalType: null,
    kind: FieldKind.AGGREGATION,
    sourceField,
    aggregation: normalizedAgg,
    formula: null,
    format: null
  };
}

/**
 * Create a custom measure (formula)
 */
export function createCustom({
  id,
  name,
  formula,
  dtype = 'double'
}: {
  id: string;
  name: string;
  formula: string;
  dtype?: string;
}): FieldItem {
  return {
    id,
    name,
    dtype,
    originalType: null,
    kind: FieldKind.CUSTOM_METRIC,
    sourceField: null,
    aggregation: null,
    formula,
    format: null
  };
}

/**
 * Helper Functions
 */

/**
 * Get SQL column name for this field
 * This is the name used in CUBE query results
 */
export function getSQLColumnName(field: FieldItem): string {
  return field.id;
}

/**
 * Infer semantic type from dtype
 * Returns: 'measure' | 'dimension' | 'date' | 'category'
 */
export function inferSemanticType(dtype: string): string {
  const typeUpper = dtype.toUpperCase();

  if (typeUpper.includes('DATE') || typeUpper.includes('TIME')) {
    return 'date';
  }

  if (typeUpper.includes('INT') || typeUpper.includes('DOUBLE') ||
      typeUpper.includes('FLOAT') || typeUpper.includes('DECIMAL')) {
    return 'measure';
  }

  if (typeUpper.includes('VARCHAR') || typeUpper.includes('TEXT')) {
    return 'category';
  }

  return 'dimension';
}

/**
 * Check if this is a measure (can be aggregated)
 */
export function isMeasure(field: FieldItem): boolean {
  return inferSemanticType(field.dtype) === 'measure';
}

/**
 * Check if this is a dimension (can be used in rows/columns)
 */
export function isDimension(field: FieldItem): boolean {
  const semanticType = inferSemanticType(field.dtype);
  return ['dimension', 'date', 'category'].includes(semanticType);
}
