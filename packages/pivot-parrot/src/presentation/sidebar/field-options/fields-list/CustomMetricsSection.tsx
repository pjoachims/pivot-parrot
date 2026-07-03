import React, { useMemo } from 'react';
import { CustomMetric } from '../../../../domain/models/types';
import { CustomExpressionItem } from './CustomExpressionItem';

interface CustomMetricsSectionProps {
  customMetrics: CustomMetric[];
  searchQuery: string;
  checkedMetrics: Set<string>;
  onToggleMetric: (metricId: string, checked: boolean) => void;
  onMoveToZone: (metricId: string, targetZone: string) => void;
  onDragStart: (e: React.DragEvent, metricId: string, sourceZone: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onEdit: (metric: CustomMetric) => void;
  onDelete: (metric: CustomMetric) => void;
}

/**
 * CustomMetricsSection - Renders the custom metrics list
 */
export function CustomMetricsSection({
  customMetrics,
  searchQuery,
  checkedMetrics,
  onToggleMetric,
  onMoveToZone,
  onDragStart,
  onDragEnd,
  onEdit,
  onDelete
}: CustomMetricsSectionProps) {
  // Filter metrics based on search query
  const filteredMetrics = useMemo(() => {
    if (!searchQuery) return customMetrics;
    const lowerQuery = searchQuery.toLowerCase();
    return customMetrics.filter(m => m.name.toLowerCase().includes(lowerQuery));
  }, [customMetrics, searchQuery]);

  return (
    <>
      {filteredMetrics.map((metric) => (
        <CustomExpressionItem
          key={metric.id}
          id={metric.id}
          name={metric.name}
          type="metric"
          isChecked={checkedMetrics.has(metric.id)}
          onToggle={onToggleMetric}
          onMoveToZone={(targetZone) => onMoveToZone(metric.id, targetZone)}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onEdit={() => onEdit(metric)}
          onDelete={() => onDelete(metric)}
        />
      ))}
    </>
  );
}
