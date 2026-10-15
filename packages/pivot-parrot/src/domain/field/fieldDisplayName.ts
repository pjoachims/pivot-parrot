import { findAggregation } from './aggregations';

interface Named {
  id: string;
  name: string;
}

export interface NamingConfig {
  fieldNameOverrides?: Record<string, string>;
  customMetrics?: Named[];
  customGroupings?: Named[];
  customFilters?: Named[];
  values?: { field: string; aggregation: string; isCustom?: boolean }[];
  filters?: { field: string; sourceField?: string; aggregation?: string }[];
}

function aggregationName(fieldId: string, config: NamingConfig, availableFields: Named[]): string | undefined {
  const entry = findAggregation(fieldId, config);
  return entry && `${entry.aggregation.toUpperCase()}(${fieldDisplayName(entry.field, config, availableFields)})`;
}

function knownName(fieldId: string, config: NamingConfig, availableFields: Named[]): string | undefined {
  const custom = [...(config.customMetrics || []), ...(config.customGroupings || []), ...(config.customFilters || [])];
  return config.fieldNameOverrides?.[fieldId]
    || custom.find(c => c.id === fieldId)?.name
    || availableFields.find(f => f.id === fieldId)?.name
    || aggregationName(fieldId, config, availableFields);
}

/**
 * The label a field shows wherever a person reads it. Display only: field ids,
 * SQL and result-column keys never go through here.
 */
export function fieldDisplayName(fieldId: string, config: NamingConfig, availableFields: Named[] = []): string {
  return knownName(fieldId, config, availableFields) || fieldId;
}

/** The label of a Values entry: "sum of <field>", or the custom metric's name. */
export function valueDisplayName(
  value: { field: string; aggregation: string; isCustom?: boolean; name?: string },
  config: NamingConfig,
  availableFields: Named[] = []
): string {
  if (value.isCustom) return knownName(value.field, config, availableFields) || value.name || value.field;
  return `${value.aggregation} of ${fieldDisplayName(value.field, config, availableFields)}`;
}
