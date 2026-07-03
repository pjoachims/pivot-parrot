import React, { useMemo } from 'react';
import type { PivotTableConfig } from '../../../../domain/models/types';

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
          name: `${aggUpper}(${v.field})`,
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
  }, [config.values, searchQuery]);

  if (activeAggregations.length === 0) {
    return null;
  }

  return (
    <>
      <div style={{ padding: '4px 8px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', marginTop: '8px' }}>
        ACTIVE AGGREGATIONS
      </div>
      {activeAggregations.map((agg) => (
        <div
          key={agg.id}
          className="flex items-center gap-2 py-0.5 hover:bg-gray-100 cursor-move field-item"
          draggable={true}
          onDragStart={(e) => onDragStart(e, agg.id, 'list')}
          onDragEnd={onDragEnd}
          style={{ paddingLeft: '8px' }}
          title="Drag to Filters to filter on aggregated values"
        >
          {/* Invisible checkbox for alignment */}
          <input
            type="checkbox"
            className="w-3.5 h-3.5"
            style={{ visibility: 'hidden' }}
            tabIndex={-1}
            readOnly
          />

          {/* Icon matching TypeIcon structure */}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ width: 14, height: 14, display: 'inline-block', flexShrink: 0 }}>
            <text x="8" y="12" textAnchor="middle" fontSize="10" fontWeight="700" style={{ fill: 'var(--text-secondary)' }}>Σ</text>
          </svg>

          <label className="text-xs cursor-move select-none flex-1 pp-truncate" style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
            {agg.name}
          </label>

          {/* Save button to persist as custom metric */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSaveAsMetric(agg);
            }}
            className="text-gray-400 pp-icon-btn-primary-hover text-xs p-0.5"
            title="Save as custom metric"
            aria-label={`Save ${agg.name} as custom metric`}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
        </div>
      ))}
    </>
  );
}
