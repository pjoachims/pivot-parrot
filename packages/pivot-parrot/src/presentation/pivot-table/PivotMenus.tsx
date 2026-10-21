import React from 'react';
import { toMetricKey, toMetricLabel } from '../../domain/pivot/utils';

/**
 * Sort Menu - Sort rows by value field
 */
export function SortMenu({
  data,
  config,
  sortConfig,
  onSortChange
}) {
  const handleValueChange = (e) => {
    const valueKey = e.target.value;
    onSortChange(valueKey
      ? { ...sortConfig, valueKey }
      : { valueKey: null, direction: sortConfig.direction });
  };

  const handleDirectionChange = (e) => {
    onSortChange({ ...sortConfig, direction: e.target.value });
  };

  const columnPath = sortConfig.valueKey && sortConfig.columnPath?.length ? sortConfig.columnPath : null;
  const columnLabel = `In column: ${columnPath ? columnPath.map(m => (m === null || m === '' ? '(Blank)' : String(m))).join(' / ') : 'Grand Total'}`;

  const valueFields = data?.columnConfig?.valueFields || [];

  // Create mapping from metric keys to labels using config.values
  const metricLabels = {};
  if (config?.values) {
    config.values.forEach(v => {
      const key = toMetricKey(v);
      const label = toMetricLabel(v);
      metricLabels[key] = label;
    });
  }

  return (
    <div className="pp-menu" style={{ minWidth: '240px', maxWidth: '320px', paddingBottom: 'var(--space-3)' }} onClick={(e) => e.stopPropagation()}>
      <div className="pp-menu-title">Sort Rows</div>
      <div className="pp-row" style={{ padding: 'var(--space-1) var(--space-3) 0' }}>
        <div className="pp-field">
          <label className="pp-label">Value</label>
          <select className="pp-select" value={sortConfig.valueKey || ''} onChange={handleValueChange}>
            <option value="">None</option>
            {valueFields.map((valueKey, idx) => (
              <option key={idx} value={valueKey}>
                {metricLabels[valueKey] || valueKey}
              </option>
            ))}
          </select>
        </div>
        <div className="pp-field">
          <label className="pp-label">Direction</label>
          <select
            className="pp-select"
            value={sortConfig.direction}
            onChange={handleDirectionChange}
            disabled={!sortConfig.valueKey}
          >
            <option value="desc">↓ Desc</option>
            <option value="asc">↑ Asc</option>
          </select>
        </div>
      </div>
      <div className="pp-row" style={{ padding: 'var(--space-2) var(--space-3) 0', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="pp-label" title={columnLabel} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {columnLabel}
        </span>
        {columnPath && (
          <button
            type="button"
            className="pp-btn pp-btn--quiet pp-btn--sm"
            style={{ flexShrink: 0 }}
            onClick={() => onSortChange({ valueKey: sortConfig.valueKey, direction: sortConfig.direction })}
          >
            Use Grand Total
          </button>
        )}
      </div>
    </div>
  );
}
