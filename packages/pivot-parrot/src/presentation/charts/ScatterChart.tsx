import React from 'react';
import { fieldDisplayName } from '../../domain/field/fieldDisplayName';
import {
  normalizeField,
  groupData,
  sanitizeFieldName,
  getMetricLabel,
  getColor,
  detectAxisType,
  getPlotlyFormat,
  getMetricFormat,
  metricAxisFormat,
  plotlySeparators
} from './chartUtils';

// ============================================================================
// Configuration UI Component
// ============================================================================

export default function ScatterChartConfig({
  dimensions,
  dimensionLabel,
  valueFields,
  pointLevel,
  setPointLevel,
  xMetric,
  setXMetric,
  yMetric,
  setYMetric,
  colorBy,
  setColorBy,
  sizeBy,
  setSizeBy
}) {
  return (
    <>
      {/* Point Level - full width */}
      <div className="pp-field">
        <label className="pp-label">Point Level</label>
        <select
          value={pointLevel}
          onChange={(e) => setPointLevel(e.target.value)}
          className="pp-select"
        >
          {dimensions.map(dim => (
            <option key={dim} value={dim}>{dimensionLabel(dim)}</option>
          ))}
        </select>
      </div>

      {/* X and Y Metrics side by side */}
      <div className="pp-row">
        <div className="pp-field">
          <label className="pp-label">X-Axis</label>
          <select
            value={xMetric}
            onChange={(e) => setXMetric(e.target.value)}
            className="pp-select"
          >
            {valueFields.map(vf => (
              <option key={vf.field} value={vf.field}>{vf.label}</option>
            ))}
          </select>
        </div>
        <div className="pp-field">
          <label className="pp-label">Y-Axis</label>
          <select
            value={yMetric}
            onChange={(e) => setYMetric(e.target.value)}
            className="pp-select"
          >
            {valueFields.map(vf => (
              <option key={vf.field} value={vf.field}>{vf.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Size and Color side by side */}
      <div className="pp-row">
        <div className="pp-field">
          <label className="pp-label">Size by</label>
          <select
            value={sizeBy || ''}
            onChange={(e) => setSizeBy(e.target.value)}
            className="pp-select"
          >
            <option value="">None (fixed size)</option>
            {valueFields.map(vf => (
              <option key={vf.field} value={vf.field}>{vf.label}</option>
            ))}
          </select>
        </div>
        <div className="pp-field">
          <label className="pp-label">Color by</label>
          <select
            value={colorBy}
            onChange={(e) => setColorBy(e.target.value)}
            className="pp-select"
          >
            <option value="">None</option>
            {dimensions.filter(dim => dim !== pointLevel).map(dim => (
              <option key={dim} value={dim}>{dimensionLabel(dim)}</option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}


// ============================================================================
// Data Transformation & Rendering
// ============================================================================

export function transformScatterChart(chartData, chartConfig, locale = 'en-US') {
  const { rows, dtypes, config } = chartData;
  const { pointLevel, xMetric, yMetric, colorBy, sizeBy } = chartConfig;

  const pointLevelField = normalizeField(pointLevel);

  // Get metric column names and labels
  const xColumn = sanitizeFieldName(xMetric, config);
  const yColumn = sanitizeFieldName(yMetric, config);
  const xLabel = getMetricLabel(xMetric, config);
  const yLabel = getMetricLabel(yMetric, config);

  // Get size column if specified
  const sizeColumn = sizeBy ? sanitizeFieldName(sizeBy, config) : null;

  // Group by color if specified
  const colorByField = colorBy ? normalizeField(colorBy) : null;
  const colorByDtype = colorByField && dtypes ? dtypes[colorByField] : null;
  const groups = colorByField ? groupData(rows, colorByField, colorByDtype) : { 'All': rows };

  const traces = Object.entries(groups).map(([groupName, rows], index) => {
    // Calculate bubble sizes if sizeBy is specified
    let sizes = null;
    if (sizeColumn) {
      const sizeValues = rows.map(row => row[sizeColumn]);
      const min = Math.min(...sizeValues);
      const max = Math.max(...sizeValues);
      const range = max - min || 1; // Avoid division by zero
      // Scale to 8-40px range
      sizes = sizeValues.map(val => 8 + ((val - min) / range) * 32);
    }

    return {
      name: colorBy ? groupName : fieldDisplayName(pointLevelField, config),
      x: rows.map(row => row[xColumn]),
      y: rows.map(row => row[yColumn]),
      text: rows.map(row => row[pointLevelField]),
      type: 'scatter',
      mode: 'markers',
      marker: {
        color: getColor(index),
        size: sizes || 8,
        opacity: sizeBy ? 0.6 : 1  // Default alpha for bubbles
      }
    };
  });

  // Detect axis types based on actual metric columns
  const xAxisType = detectAxisType(rows, xColumn);
  const yAxisType = detectAxisType(rows, yColumn);
  const xAxisDtype = dtypes ? dtypes[xColumn] : null;
  const yAxisDtype = dtypes ? dtypes[yColumn] : null;
  const xPlotlyFormat = getPlotlyFormat(xAxisDtype);
  const yPlotlyFormat = getPlotlyFormat(yAxisDtype);
  const xMetricAxis = metricAxisFormat(getMetricFormat(xMetric, config, locale));
  const yMetricAxis = metricAxisFormat(getMetricFormat(yMetric, config, locale));

  const layout = {
    title: '',
    xaxis: {
      title: xLabel,
      type: xAxisType,
      ...xMetricAxis,
      tickformat: xPlotlyFormat.tick ?? xMetricAxis.tickformat,
      hoverformat: xPlotlyFormat.hover ?? xMetricAxis.tickformat,
      automargin: true
    },
    yaxis: {
      title: yLabel,
      type: yAxisType,
      ...yMetricAxis,
      tickformat: yPlotlyFormat.tick ?? yMetricAxis.tickformat,
      hoverformat: yPlotlyFormat.hover ?? yMetricAxis.tickformat
    },
    showlegend: colorBy ? true : false,
    legend: { x: 1.1, y: 1 },
    margin: { l: 60, r: 60, t: 40, b: 60 },
    hovermode: 'closest',
    autosize: true,
    separators: plotlySeparators(locale)
  };

  return { traces, layout };
}
