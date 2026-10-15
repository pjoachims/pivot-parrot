import React from 'react';
import { Icon } from '../shared/Icon';
import { fieldDisplayName } from '../../domain/field/fieldDisplayName';
import {
  normalizeField,
  selectChartData,
  groupData,
  sanitizeFieldName,
  getMetricLabel,
  getMetricFormat,
  detectAxisType,
  getColor,
  getPlotlyFormat,
  hoverValue,
  metricAxisFormat,
  plotlySeparators
} from './chartUtils';
import { BarLineTrace, PlotlyLayout } from './types';

// ============================================================================
// Configuration UI Component
// ============================================================================

export default function BarLineChartConfig({
  dimensions,
  dimensionLabel,
  valueFields,
  xAxis,
  setXAxis,
  groupBy,
  setGroupBy,
  metrics,
  setMetrics,
  barMode,
  setBarMode
}) {
  const addMetric = () => {
    setMetrics([...metrics, {
      field: valueFields[0]?.field || '',
      chartType: 'bar',
      axis: 'Ax1',
      lineStyle: 'solid',
      opacity: 0.8
    }]);
  };

  const removeMetric = (index) => {
    setMetrics(metrics.filter((_, i) => i !== index));
  };

  const updateMetric = (index, key, value) => {
    const updated = [...metrics];
    updated[index][key] = value;
    setMetrics(updated);
  };

  return (
    <>
      {/* X-Axis and Group By side by side */}
      <div className="pp-row">
        <div className="pp-field">
          <label className="pp-label">X-Axis</label>
          <select
            value={xAxis}
            onChange={(e) => setXAxis(e.target.value)}
            className="pp-select"
          >
            {dimensions.map(dim => (
              <option key={dim} value={dim}>{dimensionLabel(dim)}</option>
            ))}
          </select>
        </div>
        <div className="pp-field">
          <label className="pp-label">Group by</label>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            className="pp-select"
          >
            <option value="">None</option>
            {dimensions.filter(dim => dim !== xAxis).map(dim => (
              <option key={dim} value={dim}>{dimensionLabel(dim)}</option>
            ))}
          </select>
        </div>
        <div className="pp-field">
          <label className="pp-label">Bar Mode</label>
          <select
            value={barMode}
            onChange={(e) => setBarMode(e.target.value)}
            className="pp-select"
          >
            <option value="group">Clustered</option>
            <option value="stack">Stacked</option>
            <option value="stack100">Stacked (100%)</option>
          </select>
        </div>
      </div>

      <div className="pp-field">
        <div className="pp-label-row">
          <span className="pp-label">Metrics</span>
          <button onClick={addMetric} className="pp-btn pp-btn--sm">
            <Icon name="plus" />
            Add
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {metrics.map((metric, index) => (
            <div key={index} style={metricRow}>
              <select
                value={metric.field}
                onChange={(e) => updateMetric(index, 'field', e.target.value)}
                aria-label={`Metric ${index + 1}`}
                className="pp-select pp-select--sm"
              >
                {valueFields.map(vf => (
                  <option key={vf.field} value={vf.field}>{vf.label}</option>
                ))}
              </select>
              <select
                value={metric.chartType}
                onChange={(e) => updateMetric(index, 'chartType', e.target.value)}
                aria-label="Mark"
                className="pp-select pp-select--sm"
              >
                <option value="bar">Bar</option>
                <option value="line">Line</option>
              </select>
              <select
                value={metric.axis}
                onChange={(e) => updateMetric(index, 'axis', e.target.value)}
                aria-label="Axis"
                className="pp-select pp-select--sm"
              >
                <option value="Ax1">Left Axis</option>
                <option value="Ax2">Right Axis</option>
              </select>
              {metric.chartType === 'line' ? (
                <select
                  value={metric.lineStyle}
                  onChange={(e) => updateMetric(index, 'lineStyle', e.target.value)}
                  aria-label="Line style"
                  className="pp-select pp-select--sm"
                >
                  <option value="solid">Solid</option>
                  <option value="dash">Dash</option>
                  <option value="dot">Dot</option>
                  <option value="dashdot">DashDot</option>
                </select>
              ) : (
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', minWidth: 0 }} title="Opacity">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={metric.opacity}
                    onChange={(e) => updateMetric(index, 'opacity', parseFloat(e.target.value))}
                    aria-label="Opacity"
                    style={{ flex: 1, minWidth: 0, margin: 0 }}
                  />
                  <span className="pp-hint" style={{ width: '30px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{(metric.opacity * 100).toFixed(0)}%</span>
                </label>
              )}
              <button
                onClick={() => removeMetric(index)}
                className="pp-icon-btn pp-icon-btn--danger"
                disabled={metrics.length === 1}
                title="Remove metric"
                aria-label="Remove metric"
              >
                <Icon name="x" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// metric / mark / axis / opacity-or-line-style / remove, aligned across rows
const metricRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 64px 104px 88px var(--control-h-sm)',
  alignItems: 'center',
  gap: 'var(--space-2)'
};

// ============================================================================
// Data Transformation & Rendering
// ============================================================================

export function transformBarLineChart(chartData, chartConfig, locale = 'en-US') {
  const { rows, dtypes, config } = chartData;
  const { xAxis, groupBy, metrics, barMode = 'group' } = chartConfig;


  // Group data by groupBy field (if specified)
  const groupByField = groupBy ? normalizeField(groupBy) : null;
  const groupByDtype = groupByField && dtypes ? dtypes[groupByField] : null;
  const groups = groupByField ? groupData(rows, groupByField, groupByDtype) : { 'All': rows };


  // Assign consistent colors to groups
  const groupNames = Object.keys(groups);
  const groupColorMap = {};
  groupNames.forEach((groupName, index) => {
    groupColorMap[groupName] = index;
  });

  // TRANSFORM: Create Plotly traces for each metric
  const traces = [];

  // Track if we have multiple metrics to adjust hover
  const hasMultipleMetrics = metrics.length > 1;

  metrics.forEach((metric) => {
    const cubeColumnName = sanitizeFieldName(metric.field, config);
    const metricLabel = getMetricLabel(metric.field, config);
    const metricFormat = getMetricFormat(metric.field, config, locale);


    Object.entries(groups).forEach(([groupName, rows]) => {
      const xAxisField = normalizeField(xAxis);

      // Extract values (already unwrapped and converted by prepareChartData)
      const xValues = rows.map(row => row[xAxisField]);
      const yValues = rows.map(row => row[cubeColumnName]);

      const trace: BarLineTrace = {
        name: groupBy ? `${groupName}` : metricLabel,
        x: xValues,
        y: yValues,
        customdata: barMode === 'stack100' ? yValues : undefined,
        type: metric.chartType === 'line' ? 'scatter' : 'bar',
        yaxis: metric.axis === 'Ax2' ? 'y2' : 'y',
        hovertemplate: barMode === 'stack100'
          ? (groupBy
            ? `%{fullData.name}: ${hoverValue('customdata', metricFormat)} (%{y:.1f}%)<extra></extra>`
            : `${metricLabel}<br>%{x}<br>${hoverValue('customdata', metricFormat)} (%{y:.1f}%)<extra></extra>`)
          : (groupBy
            ? `%{fullData.name}: ${hoverValue('y', metricFormat)}<extra></extra>`
            : `${metricLabel}<br>%{x}<br>${hoverValue('y', metricFormat)}<extra></extra>`)
      };

      // Add chart-type specific properties
      const colorIndex = groupColorMap[groupName];

      if (metric.chartType === 'line') {
        trace.mode = 'lines+markers';
        trace.line = {
          color: getColor(colorIndex),
          width: 2,
          dash: metric.lineStyle || 'solid'
        };
      } else {
        trace.marker = {
          color: getColor(colorIndex),
          opacity: metric.opacity !== undefined ? metric.opacity : 0.8
        };
      }

      traces.push(trace);
    });
  });

  // Build layout
  const xAxisField = normalizeField(xAxis);
  const xAxisType = detectAxisType(rows, xAxisField);
  const xAxisDtype = dtypes ? dtypes[xAxisField] : null;
  const plotlyFormat = getPlotlyFormat(xAxisDtype);

  const layout: PlotlyLayout = {
    title: '',
    xaxis: {
      title: fieldDisplayName(xAxisField, config),
      type: xAxisType,
      tickformat: plotlyFormat.tick,
      hoverformat: plotlyFormat.hover,
      automargin: true
    },
    yaxis: {
      title: getAxisTitle(metrics, 'Ax1', config),
      ...(barMode !== 'stack100' && axisFormat(metrics, 'Ax1', config, locale)),
      side: 'left',
      autorange: true,
      rangemode: 'normal'
    },
    barmode: barMode === 'stack100' ? 'stack' : barMode,
    barnorm: barMode === 'stack100' ? 'percent' : undefined,
    showlegend: true,
    legend: {
      x: 1.1,
      y: 1
    },
    margin: {
      l: 60,
      r: 60,
      t: 40,
      b: 60
    },
    hovermode: groupBy ? 'x unified' : 'closest',
    hoverlabel: {
      bgcolor: 'white',
      bordercolor: '#ddd',
      font: { size: 12, family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
      align: 'left',
      namelength: -1
    },
    // Add metric name to unified hover title
    ...(groupBy && metrics.length > 0 && {
      title: {
        text: '',
        hovertext: getMetricLabel(metrics[0].field, config)
      }
    }),
    autosize: true,
    separators: plotlySeparators(locale)
  };

  // Only add yaxis2 if needed
  if (hasAxis2(metrics)) {
    layout.yaxis2 = {
      title: getAxisTitle(metrics, 'Ax2', config),
      ...(barMode !== 'stack100' && axisFormat(metrics, 'Ax2', config, locale)),
      overlaying: 'y',
      side: 'right',
      autorange: true,
      rangemode: 'normal'
    };
  }


  return { traces, layout };
}

// Helper: Check if any metric uses Ax2
function hasAxis2(metrics) {
  return metrics.some(m => m.axis === 'Ax2');
}

// Helper: tick format of an axis, taken from its first metric
function axisFormat(metrics, axisName, config, locale) {
  const first = metrics.find(m => m.axis === axisName);
  return first ? metricAxisFormat(getMetricFormat(first.field, config, locale)) : {};
}

// Helper: Get axis title from metrics
function getAxisTitle(metrics, axisName, config) {
  const axisMetrics = metrics.filter(m => m.axis === axisName);
  if (axisMetrics.length === 0) return '';
  if (axisMetrics.length === 1) {
    // Use getMetricLabel to get proper display name (handles custom metrics)
    return getMetricLabel(axisMetrics[0].field, config);
  }
  return `Multiple Metrics`;
}
