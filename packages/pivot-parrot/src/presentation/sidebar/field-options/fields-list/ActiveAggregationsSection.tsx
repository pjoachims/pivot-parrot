import React, { useMemo } from 'react';
import type { PivotTableConfig } from '../../../../domain/models/types';
import { fieldDisplayName } from '../../../../domain/field/fieldDisplayName';
import { Icon } from '../../../shared/Icon';

interface ActiveAggregationsSectionProps {
  config: PivotTableConfig;
  searchQuery: string;
  onDragStart: (e: React.DragEvent, aggId: string, sourceZone: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onSaveAsMetric: (agg: any) => void;
}

/**
 * ActiveAggregationsSection - Renders active aggregations from values zone
 */
export function ActiveAggregationsSection({
  config,
  searchQuery,
  onDragStart,
  onDragEnd,
  onSaveAsMetric
}: ActiveAggregationsSectionProps) {
  // Build active aggregations list from config.values
  const activeAggregations = useMemo(() => {
    const aggs: any[] = [];
    config.values.forEach((v: any) => {
      if (v.isCustom || v.aggregation === 'custom') return;
      if (v.aggregation && v.field) {
        const aggUpper = v.aggregation.toUpperCase();
        const aggId = `${aggUpper}_${v.field}`;
        aggs.push({
          id: aggId,
          name: fieldDisplayName(aggId, config),
          field: v.field,
          aggregation: v.aggregation,
          isAggregation: true,
          filterType: 'having'
        });
      }
    });
    return aggs.filter((agg: any) =>
      !searchQuery || agg.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [config, searchQuery]);

  if (activeAggregations.length === 0) {
    return null;
  }

  return (
    <>
      <div className="pp-list-caption">Active aggregations</div>
      {activeAggregations.map((agg) => (
        <div
          key={agg.id}
          className="pp-field-row field-item"
          draggable={true}
          onDragStart={(e) => onDragStart(e, agg.id, 'list')}
          onDragEnd={onDragEnd}
          title="Drag to Filters to filter on aggregated values"
        >
          {/* Keeps the label column aligned with the rows above, which have a checkbox here */}
          <span style={{ width: '13px', flexShrink: 0 }} aria-hidden="true" />
          <span className="pp-field-row__icon"><Icon name="sigma" /></span>
          <label className="pp-field-row__label">{agg.name}</label>
          <span className="pp-row-actions">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSaveAsMetric(agg);
              }}
              className="pp-icon-btn pp-icon-btn--sm"
              title="Save as custom metric"
              aria-label={`Save ${agg.name} as custom metric`}
            >
              <Icon name="bookmark" />
            </button>
          </span>
        </div>
      ))}
    </>
  );
}
