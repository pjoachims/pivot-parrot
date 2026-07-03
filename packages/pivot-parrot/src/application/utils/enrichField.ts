import type { PivotTableConfig } from '../../domain/models/types';

/**
 * Enriches a field ID with display metadata from custom metrics/groupings/filters
 * Pure function - no side effects, easily testable
 */
export function enrichField(
  fieldId: string | { id: string; name: string },
  config: PivotTableConfig
): { id: string; name: string; isCustom?: boolean } | string {
  if (typeof fieldId !== 'string') return fieldId as { id: string; name: string };

  // Check custom metrics
  const metric = (config.customMetrics || []).find(m => m.id === fieldId);
  if (metric) return { id: metric.id, name: metric.name, isCustom: true };

  // Check custom groupings
  const grouping = (config.customGroupings || []).find(g => g.id === fieldId);
  if (grouping) return { id: grouping.id, name: grouping.name, isCustom: true };

  // Check custom filters
  const filter = (config.customFilters || []).find(f => f.id === fieldId);
  if (filter) return { id: filter.id, name: filter.name, isCustom: true };

  // Check active aggregations
  const aggMatch = fieldId.match(/^(SUM|AVG|COUNT|MIN|MAX)_(.+)$/i);
  if (aggMatch) {
    const [, agg, field] = aggMatch;
    return { id: fieldId, name: `${agg.toUpperCase()}(${field})` };
  }

  return fieldId;
}
