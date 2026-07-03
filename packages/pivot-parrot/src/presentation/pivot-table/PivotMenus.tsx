import React from 'react';
import { toMetricKey, toMetricLabel } from '../../domain/pivot/utils';

/**
 * Settings Menu - Subtotals and Grand Total options
 */
export function SubtotalsMenu({
  styles,
  subtotalsMode,
  handleSubtotalsChange,
  showGrandTotal,
  setShowGrandTotal
}) {
  return (
    <div className="pivot-popover-menu" style={styles.popoverMenu} onClick={(e) => e.stopPropagation()}>
      <div style={styles.menuHeader}>Settings</div>

      <div style={styles.settingSection}>
        <label style={styles.settingLabel}>Subtotals</label>
        <select
          className="pivot-select"
          style={styles.subtotalsDropdown}
          value={subtotalsMode}
          onChange={(e) => handleSubtotalsChange(e.target.value)}
        >
          <option value="none">None</option>
          <option value="rows">Rows Only</option>
          <option value="cols">Columns Only</option>
          <option value="both">Rows & Columns</option>
        </select>
      </div>

      <div style={{ ...styles.settingSection, borderBottom: 'none', paddingBottom: '0' }}>
        <label style={styles.settingCheckbox}>
          <input
            type="checkbox"
            className="pivot-checkbox"
            checked={showGrandTotal}
            onChange={(e) => setShowGrandTotal(e.target.checked)}
          />
          <span style={{ marginLeft: '10px', fontSize: '12px', color: 'var(--text-primary)', fontWeight: '400' }}>
            Show Grand Total
          </span>
        </label>
      </div>
    </div>
  );
}

/**
 * Values Format Menu - Format settings for value fields/metrics
 */
export function ValuesFormatMenu({
  styles,
  data,
  config,
  valueFormats,
  handleValueFormatChange
}) {
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
      <div style={styles.menuHeader}>Value Formats</div>
      <table style={styles.formatTable}>
        <thead>
          <tr>
            <th style={styles.formatTableHeader}>KPI</th>
            <th style={styles.formatTableHeader}>Format</th>
          </tr>
        </thead>
        <tbody>
          {data.columnConfig.valueFields.map((valueKey, idx) => (
            <tr key={idx}>
              <td style={styles.formatTableCell}>{metricLabels[valueKey] || valueKey}</td>
              <td style={styles.formatTableCell}>
                <select
                  className="pivot-select"
                  style={styles.formatSelect}
                  value={valueFormats[valueKey] || 'number'}
                  onChange={(e) => handleValueFormatChange(valueKey, e.target.value)}
                >
                  <option value="number">Number</option>
                  <option value="integer">Integer</option>
                  <option value="percentage">Percentage</option>
                  <option value="currency">Currency</option>
                  <option value="decimal">Decimal (2)</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Rows Options Menu - Expand/collapse and date formatting for row fields
 */
export function RowsOptionsMenu({
  styles,
  rowFields,
  fieldExpanded,
  toggleFieldExpanded,
  rowFormats,
  handleRowFormatChange
}) {
  return (
    <div className="pivot-popover-menu" style={styles.popoverMenu} onClick={(e) => e.stopPropagation()}>
      <div style={styles.menuHeader}>Row Options</div>
      <table style={styles.formatTable}>
        <thead>
          <tr>
            <th style={styles.formatTableHeader}>Field</th>
            <th style={styles.formatTableHeader}>Expand/Collapse</th>
            <th style={styles.formatTableHeader}>Date Format</th>
          </tr>
        </thead>
        <tbody>
          {(rowFields || []).map((rowField, idx) => {
            const isExpanded = fieldExpanded[rowField] !== false;
            return (
              <tr key={idx}>
                <td style={styles.formatTableCell}>{rowField}</td>
                <td style={styles.formatTableCell}>
                  <button
                    className="pivot-fold-btn"
                    style={styles.foldButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFieldExpanded(rowField);
                    }}
                    title={isExpanded ? 'Collapse all' : 'Expand all'}
                    aria-label={isExpanded ? `Collapse all ${rowField}` : `Expand all ${rowField}`}
                  >
                    {isExpanded ? '−' : '+'}
                  </button>
                </td>
                <td style={styles.formatTableCell}>
                  <input
                    type="text"
                    className="pivot-input"
                    style={styles.formatInput}
                    value={rowFormats[rowField] || ''}
                    onChange={(e) => handleRowFormatChange(rowField, e.target.value)}
                    placeholder="YYYY-MM-DD"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Export CSV Menu - Options for exporting data or pivot layout
 */
export function ExportMenu({
  styles,
  exportDataCSV,
  exportPivotCSV,
  leafColumns
}) {
  return (
    <div className="pivot-popover-menu" style={styles.popoverMenu} onClick={(e) => e.stopPropagation()}>
      <div style={styles.menuHeader}>Export CSV</div>
      <div style={{ padding: '8px 0' }}>
        <button
          onClick={() => exportDataCSV()}
          className="pp-icon-btn-hover"
          style={{
            ...styles.menuButton,
            width: '100%',
            marginBottom: '8px',
            justifyContent: 'flex-start',
            gap: '6px',
            padding: '8px 12px'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          Export Data (SQL Results)
        </button>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '12px', paddingLeft: '12px' }}>
          Raw query results - clean, normalized data
        </div>
        <button
          onClick={() => exportPivotCSV(leafColumns)}
          className="pp-icon-btn-hover"
          style={{
            ...styles.menuButton,
            width: '100%',
            justifyContent: 'flex-start',
            gap: '6px',
            padding: '8px 12px'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="9" x2="9" y2="21" />
          </svg>
          Export Pivot (Visual Layout)
        </button>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', paddingLeft: '12px' }}>
          Exact visual table with hierarchy
        </div>
      </div>
    </div>
  );
}

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
