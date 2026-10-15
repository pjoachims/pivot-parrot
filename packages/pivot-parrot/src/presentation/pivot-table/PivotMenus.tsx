import React from 'react';
import { toMetricKey, toMetricLabel } from '../../domain/pivot/utils';

/**
 * Sort Menu - Sort rows by value field
 */
export function SortMenu({
  styles,
  data,
  config,
  sortConfig,
  onSortChange
}) {
  const handleValueChange = (e) => {
    const valueKey = e.target.value;
    onSortChange({
      valueKey: valueKey || null,
      direction: sortConfig.direction
    });
  };

  const handleDirectionChange = (e) => {
    onSortChange({
      valueKey: sortConfig.valueKey,
      direction: e.target.value
    });
  };

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
    <div className="pivot-popover-menu" style={styles.popoverMenu} onClick={(e) => e.stopPropagation()}>
      <div style={styles.menuHeader}>Sort Rows</div>

      <div style={{ ...styles.settingSection, borderBottom: 'none', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <label style={styles.settingLabel}>Value</label>
          <select
            className="pivot-select"
            style={styles.subtotalsDropdown}
            value={sortConfig.valueKey || ''}
            onChange={handleValueChange}
          >
            <option value="">None</option>
            {valueFields.map((valueKey, idx) => (
              <option key={idx} value={valueKey}>
                {metricLabels[valueKey] || valueKey}
              </option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1 }}>
          <label style={styles.settingLabel}>Direction</label>
          <select
            className="pivot-select"
            style={styles.subtotalsDropdown}
            value={sortConfig.direction}
            onChange={handleDirectionChange}
            disabled={!sortConfig.valueKey}
          >
            <option value="desc">↓ Desc</option>
            <option value="asc">↑ Asc</option>
          </select>
        </div>
      </div>
    </div>
  );
}
