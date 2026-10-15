/**
 * Where the config's plain aggregations (SUM_sales, AVG_qty) live: a Values
 * entry, or a HAVING filter that carries the aggregation after the value was
 * moved out of Values. Every resolver that turns an aggregation id back into
 * its column and function reads this list, so the two places agree.
 */

export interface AggregationEntry {
  field: string;
  aggregation: string;
}

interface AggregationSources {
  values?: { field: string; aggregation: string; isCustom?: boolean }[];
  filters?: { field: string; sourceField?: string; aggregation?: string }[];
}

export function aggregationId({ field, aggregation }: AggregationEntry): string {
  return `${aggregation.toUpperCase()}_${field}`;
}

export function aggregationEntries(config: AggregationSources): AggregationEntry[] {
  const fromValues = (config.values || [])
    .filter(v => !v.isCustom && v.aggregation)
    .map(v => ({ field: v.field, aggregation: v.aggregation }));
  const fromFilters = (config.filters || [])
    .filter(f => f.sourceField && f.aggregation && aggregationId({ field: f.sourceField, aggregation: f.aggregation }) === f.field)
    .map(f => ({ field: f.sourceField as string, aggregation: f.aggregation as string }));
  return [...fromValues, ...fromFilters];
}

export function findAggregation(fieldId: string, config: AggregationSources): AggregationEntry | undefined {
  return aggregationEntries(config).find(entry => aggregationId(entry) === fieldId);
}
