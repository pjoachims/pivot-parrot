import React from 'react';
import {
  normalizeField,
  sanitizeFieldName,
  getMetricLabel,
  getMetricFormat,
  formatValueForDisplay
} from './chartUtils';
import { createCellHash, lookupCubeValue, safeStringify } from '../../application/utils/cubeIndex';
import { TreemapTrace } from './types';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize values for Plotly compatibility
 *
 * DuckDB/Arrow returns DecimalBigNum objects for DECIMAL/NUMERIC aggregations.
 * DecimalBigNum has custom toString()/valueOf() that return the numeric value,
 * so String(DecimalBigNum) and Number(DecimalBigNum) work correctly.
 *
 * However, when passing raw DecimalBigNum objects to Plotly, they appear as
 * [object Object]. This function explicitly converts them to Numbers.
 *
 * @param {*} value - Value that might be BigInt or DecimalBigNum
 * @returns {*} Number if BigInt/DecimalBigNum, otherwise original value
 */
function normalizeValue(value) {
  // Handle BigInt
  if (typeof value === 'bigint') {
    return Number(value);
  }

  // Handle DecimalBigNum and other TypedArray-like objects from Arrow/DuckDB
  // DecimalBigNum stores 128-bit decimals as [value, 0, 0, 0], extract first element
  if (value && typeof value === 'object' &&
      typeof value.length === 'number' &&
      value.length > 0 &&
      (value.constructor.name.includes('Array') || ArrayBuffer.isView(value))) {
    return Number(value[0]); // Extract first element which contains the actual value
  }

  return value;
}

// ============================================================================
// Configuration UI Component
// ============================================================================

export default function TreemapChartConfig({
  dimensions,
  valueFields,
  metric,
  setMetric,
  colorMetric,
  setColorMetric,
  level1,
  setLevel1,
  level2,
  setLevel2,
  level3,
  setLevel3,
  colorScheme,
  setColorScheme
}) {
  const selectedGradient = colorSchemes.find(s => s.value === colorScheme)?.gradient || '';

  return (
    <>
      {/* Metric and Color side by side */}
      <div style={styles.row}>
        <div style={styles.field}>
          <label style={styles.label}>Size Metric</label>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            style={styles.select}
          >
            {valueFields.map(vf => (
              <option key={vf.field} value={vf.field}>{vf.label}</option>
            ))}
          </select>
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Color Metric</label>
          <select
            value={colorMetric}
            onChange={(e) => setColorMetric(e.target.value)}
            style={styles.select}
          >
            <option value="">Same as size</option>
            {valueFields.map(vf => (
              <option key={vf.field} value={vf.field}>{vf.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Hierarchy Levels */}
      <div style={styles.row}>
        <div style={styles.field}>
          <label style={styles.label}>Level 1</label>
          <select
            value={level1}
            onChange={(e) => setLevel1(e.target.value)}
            style={styles.select}
          >
            {dimensions.map(dim => (
              <option key={dim} value={dim}>{dim}</option>
            ))}
          </select>
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Level 2</label>
          <select
            value={level2}
            onChange={(e) => setLevel2(e.target.value)}
            style={styles.select}
          >
            <option value="">None</option>
            {dimensions.filter(dim => dim !== level1 && dim !== level3).map(dim => (
              <option key={dim} value={dim}>{dim}</option>
            ))}
          </select>
        </div>
        <div style={styles.field}>
          <label style={styles.label}>Level 3</label>
          <select
            value={level3}
            onChange={(e) => setLevel3(e.target.value)}
            style={styles.select}
          >
            <option value="">None</option>
            {dimensions.filter(dim => dim !== level1 && dim !== level2 && level2).map(dim => (
              <option key={dim} value={dim}>{dim}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Color Scheme */}
      <div style={styles.section}>
        <label style={styles.label}>Color Scheme</label>
        <div style={styles.schemeSelector}>
          <select
            value={colorScheme}
            onChange={(e) => setColorScheme(e.target.value)}
            style={styles.schemeSelect}
          >
            {colorSchemes.map(scheme => (
              <option key={scheme.value} value={scheme.value}>{scheme.value}</option>
            ))}
          </select>
          <div
            style={{
              ...styles.schemePreview,
              background: selectedGradient
            }}
          />
        </div>
      </div>
    </>
  );
}

const colorSchemes = [
  { value: 'Blues', gradient: 'linear-gradient(90deg, rgb(5,10,172), rgb(70,100,245), rgb(220,220,220))' },
  { value: 'Greens', gradient: 'linear-gradient(90deg, rgb(0,68,27), rgb(116,196,118), rgb(247,252,245))' },
  { value: 'Reds', gradient: 'linear-gradient(90deg, rgb(220,220,220), rgb(245,160,105), rgb(178,10,28))' },
  { value: 'Greys', gradient: 'linear-gradient(90deg, rgb(0,0,0), rgb(255,255,255))' },
  { value: 'Viridis', gradient: 'linear-gradient(90deg, #440154, #21918c, #fde725)' },
  { value: 'Cividis', gradient: 'linear-gradient(90deg, rgb(0,32,76), rgb(128,128,76), rgb(255,233,69))' },
  { value: 'Hot', gradient: 'linear-gradient(90deg, rgb(0,0,0), rgb(230,0,0), rgb(255,210,0), rgb(255,255,255))' },
  { value: 'Jet', gradient: 'linear-gradient(90deg, rgb(0,0,131), rgb(5,255,255), rgb(255,255,0), rgb(128,0,0))' },
  { value: 'YlOrRd', gradient: 'linear-gradient(90deg, rgb(128,0,38), rgb(253,141,60), rgb(255,255,204))' },
  { value: 'YlGnBu', gradient: 'linear-gradient(90deg, rgb(8,29,88), rgb(65,182,196), rgb(255,255,217))' },
  { value: 'RdBu', gradient: 'linear-gradient(90deg, rgb(5,10,172), rgb(190,190,190), rgb(178,10,28))' },
  { value: 'Portland', gradient: 'linear-gradient(90deg, rgb(12,51,131), rgb(10,136,186), rgb(242,211,56), rgb(242,143,56), rgb(217,30,30))' },
  { value: 'Electric', gradient: 'linear-gradient(90deg, rgb(0,0,0), rgb(120,0,100), rgb(230,200,0), rgb(255,250,220))' },
  { value: 'Blackbody', gradient: 'linear-gradient(90deg, rgb(0,0,0), rgb(230,0,0), rgb(230,210,0), rgb(255,255,255))' },
];

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: 'flex',
    gap: '12px',
    marginBottom: '12px'
  },
  field: {
    flex: 1,
    minWidth: 0
  },
  section: {
    marginBottom: '8px'
  },
  label: {
    display: 'block',
    marginBottom: '4px',
    fontSize: '10px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px'
  },
  select: {
    width: '100%',
    padding: '6px 8px',
    fontSize: '11px',
    border: '1px solid var(--border-color-medium)',
    borderRadius: '4px',
    backgroundColor: 'var(--surface-bg)',
    color: 'var(--text-primary)',
    cursor: 'pointer'
  },
  schemeSelector: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center'
  },
  schemeSelect: {
    flex: 1,
    padding: '6px 8px',
    fontSize: '11px',
    border: '1px solid var(--border-color-medium)',
    borderRadius: '4px',
    backgroundColor: 'var(--surface-bg)',
    color: 'var(--text-primary)',
    cursor: 'pointer'
  },
  schemePreview: {
    width: '80px',
    height: '28px',
    borderRadius: '4px',
    border: '1px solid var(--border-color-medium)',
    flexShrink: 0
  }
};

// ============================================================================
// Data Transformation & Rendering
// ============================================================================

/**
 * Build treemap nodes from cube data
 * Extracted for testability
 * @returns {Array} Array of node objects with id, label, parent, value, colorValue
 */
export function buildTreemapNodes(rows, rawRows, cubeIndex, levels, allDimensions, dtypes, metricColumn, colorMetricColumn, useColorMetric) {
  const nodes = [];
  const rawRowsData = rawRows || rows;

  // Step 1: Add root node (all dimensions aggregated)
  const rootHash = createCellHash([], allDimensions, [], []);
  const rootValue = normalizeValue(lookupCubeValue(cubeIndex, rootHash, metricColumn));
  const rootColorValue = useColorMetric ? normalizeValue(lookupCubeValue(cubeIndex, rootHash, colorMetricColumn)) : 0;

  // Add root node - original structure that was working
  nodes.push({
    id: '',
    label: 'All',
    parent: '',
    value: rootValue,
    colorValue: rootColorValue
  });

  // Step 2: Collect all unique paths from detail rows
  // Use converted rows for display labels, raw rows for hash lookups
  const pathsMap = new Map(); // pathStr → {displayPath, rawPath}

  rows.forEach((row, idx) => {
    const rawRow = rawRowsData[idx];

    const displayPath = levels.map(level => {
      const value = row[level] ?? 'Unknown';
      // Format Date objects consistently for display
      if (value instanceof Date) {
        const levelDtype = dtypes ? dtypes[level] : null;
        return formatValueForDisplay(value, levelDtype);
      }
      return String(value);
    });

    const rawPath = levels.map(level => rawRow[level]);

    // Add all partial paths (including intermediates)
    for (let i = 1; i <= displayPath.length; i++) {
      const pathKey = displayPath.slice(0, i).join('/');
      if (!pathsMap.has(pathKey)) {
        pathsMap.set(pathKey, {
          displayPath: displayPath.slice(0, i),
          rawPath: rawPath.slice(0, i)
        });
      }
    }
  });

  // Step 3: Build nodes for each path using cubeIndex lookups
  pathsMap.forEach((pathData, pathKey) => {
    const { displayPath, rawPath } = pathData;
    const id = pathKey;
    const label = displayPath[displayPath.length - 1];
    // Restore original parent logic - empty string for top-level items
    const parent = displayPath.length > 1 ? displayPath.slice(0, -1).join('/') : '';

    // Build hash for this path using RAW values (not converted)
    // CUBE index is built with ALL dimensions from pivot config
    // createCellHash needs the path in the order of allDimensions
    // but we only provide values for the levels in our treemap path

    // Map our treemap path to the full dimension order
    // Example: levels=[category], allDimensions=[date, region, category]
    //   rawPath=[Furniture] → fullPath = [undefined, undefined, 'Furniture']
    //
    // createCellHash expects fullPath[i] to align with allDimensions[i]

    const fullPath = allDimensions.map(dim => {
      const levelIndex = levels.indexOf(dim);
      if (levelIndex !== -1 && levelIndex < rawPath.length) {
        return rawPath[levelIndex];
      }
      return undefined; // Will be wildcarded
    });

    const hash = createCellHash(fullPath, allDimensions, [], []);
    const value = normalizeValue(lookupCubeValue(cubeIndex, hash, metricColumn));
    const colorValue = useColorMetric ? normalizeValue(lookupCubeValue(cubeIndex, hash, colorMetricColumn)) : 0;

    nodes.push({
      id,
      label,
      parent,
      value,
      colorValue
    });
  });

  return nodes;
}

export function transformTreemapChart(chartData, chartConfig) {
  const { rows, rawRows, cubeIndex, dimensions: levels, allDimensions, dtypes, config } = chartData;
  const { metric, colorMetric, colorScheme = 'Viridis' } = chartConfig;

  // Get metric column names, labels, and formats
  const metricColumn = sanitizeFieldName(metric, config);
  const metricLabel = getMetricLabel(metric, config);
  const metricFormat = getMetricFormat(metric, config);

  // Get color metric (if specified)
  const useColorMetric = !!colorMetric;
  let colorMetricColumn, colorMetricLabel, colorMetricFormat;

  if (useColorMetric) {
    colorMetricColumn = sanitizeFieldName(colorMetric, config);
    colorMetricLabel = getMetricLabel(colorMetric, config);
    colorMetricFormat = getMetricFormat(colorMetric, config);
  }

  // Build nodes using extracted function (testable!)
  const nodes = buildTreemapNodes(
    rows,
    rawRows,
    cubeIndex,
    levels,
    allDimensions,
    dtypes,
    metricColumn,
    colorMetricColumn,
    useColorMetric
  );

  // Convert nodes array to Plotly format WITH ids
  const ids = nodes.map(n => n.id);
  const labels = nodes.map(n => n.label);
  const parents = nodes.map(n => n.parent);
  const values = nodes.map(n => n.value);
  const colors = useColorMetric ? nodes.map(n => n.colorValue) : null;

  // Check for hierarchy issues
  const rootCount = parents.filter(p => p === '').length;
  const orphans = ids.filter((id, i) => {
    const parent = parents[i];
    return parent !== '' && !ids.includes(parent);
  });
  const invalidValues = values.filter(v => v === null || v === undefined || isNaN(v));

  if (rootCount > 1) {
    console.warn('[TreemapChart] ⚠️ Multiple roots detected:', rootCount);
  }
  if (orphans.length > 0) {
    console.warn('[TreemapChart] ⚠️ Orphan nodes (parent not in tree):', orphans);
  }
  if (invalidValues.length > 0) {
    console.warn('[TreemapChart] ⚠️ Invalid values:', invalidValues.length, 'out of', values.length);
  }


  // Build trace configuration
  const trace: TreemapTrace = {
    type: 'treemap',
    ids,
    labels,
    parents,
    values,
    maxdepth: -1, // Show all levels (no limit)
    branchvalues: 'total',
    textposition: 'middle center',
    textfont: {
      size: 12,
      color: '#ffffff',
      family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    },
    pathbar: {
      visible: true,
      thickness: 20,
      textfont: {
        size: 11,
        family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }
    },
    hovertemplate: '<b>%{currentPath}</b><br>' +
      metricLabel + ': %{value:' + metricFormat + '}' +
      (useColorMetric && colorMetric !== metric ? '<br>' + colorMetricLabel + ': %{color:' + colorMetricFormat + '}' : '') +
      '<extra></extra>'
  };

  // Add marker ONLY if using color metric (conditional property addition)
  if (useColorMetric) {
    trace.marker = {
      colors: colors,
      colorscale: colorScheme,
      colorbar: {
        thickness: 15,
        len: 0.7,
        x: 1.02,
        title: {
          text: colorMetricLabel,
          side: 'right'
        }
      }
    };
  }

  // Build title: "Metric by Level1, Level2, Level3"
  const hierarchyPath = levels.join(', ');
  const title = `${metricLabel} by ${hierarchyPath}`;

  const layout = {
    title: {
      text: title,
      font: {
        size: 14,
        color: '#374151',
        family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      },
      x: 0.05,
      xanchor: 'left'
    },
    margin: { l: 10, r: 10, t: 50, b: 30 },
    autosize: true,
    font: {
      family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      size: 12,
      color: '#374151'
    }
  };

  return { traces: [trace], layout };
}
