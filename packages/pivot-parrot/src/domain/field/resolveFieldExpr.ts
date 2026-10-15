import type { SQLDialect } from '../query/dialects/SQLDialect';
import type { FieldItem } from './FieldItem';
import { FieldKind } from '../models/types';
import type { PivotTableConfig } from '../models/types';
import { getFieldById } from './getFieldById';
import { buildReferenceLookup, resolveDerivedFieldsInExpressionV2 } from './derived-field-resolver-v2';

/**
 * The SQL expression a field stands for in a filter or an aggregate: a derived
 * field or custom grouping is its formula with {{}} references resolved, in
 * parentheses; anything else is its quoted column.
 */
export function resolveFieldExpr(
  fieldId: string,
  availableFields: FieldItem[],
  config: PivotTableConfig,
  dialect: SQLDialect
): string {
  const field = getFieldById(fieldId, availableFields, config);
  if ((field?.kind === FieldKind.DERIVED_FIELD || field?.kind === FieldKind.CUSTOM_GROUPING) && field.formula) {
    const dimensionLookup = buildReferenceLookup({
      availableFields,
      customGroupings: config.customGroupings || [],
      customFilters: config.customFilters || [],
      customMetrics: config.customMetrics || [],
      includeMetrics: false
    });
    return `(${resolveDerivedFieldsInExpressionV2(field.formula, dimensionLookup)})`;
  }
  return dialect.quoteIdentifier(fieldId);
}
