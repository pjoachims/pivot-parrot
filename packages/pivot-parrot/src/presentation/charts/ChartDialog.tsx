import React, { useState } from 'react';
import BaseDialog from '../shared/BaseDialog';
import BarLineChartConfig from './BarLineChart';
import ScatterChartConfig from './ScatterChart';
import TreemapChartConfig from './TreemapChart';
import { usePivotStore } from '../../application/state/store';

interface ChartDialogProps {
  config: any;
  fields: any;
  chartDisplayMode?: string;
  initialChartConfig?: any;
  onGenerate: (config: any, displayMode: string) => void;
  onCancel: () => void;
}

interface BarLineConfig {
  chartType: 'bar-line';
  xAxis: string;
  groupBy: string;
  barMode: string;
  metrics: any[];
}

interface ScatterConfig {
  chartType: 'scatter';
  pointLevel: string;
  xMetric: string;
  yMetric: string;
  colorBy: string;
  sizeBy?: string;
}

interface TreemapConfig {
  chartType: 'treemap';
  metric: string;
  colorMetric: string;
  level1: string;
  level2: string;
  level3: string;
  colorScheme?: string;
}

type ChartConfigOutput = BarLineConfig | ScatterConfig | TreemapConfig;

// Chart type icons as simple SVG components
const BarChartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="12" width="4" height="9" rx="1" />
    <rect x="10" y="6" width="4" height="15" rx="1" />
    <rect x="17" y="9" width="4" height="12" rx="1" />
  </svg>
);

const ScatterIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="7" cy="15" r="2" />
    <circle cx="12" cy="9" r="2" />
    <circle cx="17" cy="13" r="2" />
    <circle cx="9" cy="18" r="1.5" />
    <circle cx="15" cy="7" r="1.5" />
  </svg>
);

const TreemapIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="12" y1="3" x2="12" y2="12" />
    <line x1="8" y1="12" x2="8" y2="21" />
  </svg>
);

export default function ChartDialog({ config, fields, chartDisplayMode = 'full', initialChartConfig = null, onGenerate, onCancel }: ChartDialogProps) {
  const getFieldById = usePivotStore((s) => s.getFieldById);

  // Get available dimensions (rows + columns)
  // Handle both string field names and FieldItem objects
  // Filter out "Σ Values" dimension
  const dimensions = [...config.rows, ...config.columns]
    .map(dim => typeof dim === 'string' ? dim : dim.id)
    .filter(dim => dim !== 'Σ Values');

  // Get available value fields with aggregation in label
  const valueFields = config.values.map(v => {
    const fieldItem = getFieldById(v.field, config);
    const fieldName = fieldItem?.name || v.field;
    const label = v.isCustom ? fieldName : `${v.aggregation} of ${fieldName}`;
    return {
      field: v.field,
      label
    };
  });

  // Validate initialChartConfig - return null if any dimension/metric is invalid
  const validateConfig = (cfg) => {
    if (!cfg) return null;

    // Validate bar-line chart
    if (cfg.chartType === 'bar-line') {
      if (cfg.xAxis && !dimensions.includes(cfg.xAxis)) return null;
      if (cfg.groupBy && !dimensions.includes(cfg.groupBy)) return null;
      if (cfg.metrics?.some(m => !valueFields.find(vf => vf.field === m.field))) return null;
    }

    // Validate scatter chart
    if (cfg.chartType === 'scatter') {
      if (cfg.pointLevel && !dimensions.includes(cfg.pointLevel)) return null;
      if (cfg.xMetric && !valueFields.find(vf => vf.field === cfg.xMetric)) return null;
      if (cfg.yMetric && !valueFields.find(vf => vf.field === cfg.yMetric)) return null;
      if (cfg.colorBy && !dimensions.includes(cfg.colorBy)) return null;
    }

    // Validate treemap chart
    if (cfg.chartType === 'treemap') {
      if (cfg.level1 && !dimensions.includes(cfg.level1)) return null;
      if (cfg.level2 && !dimensions.includes(cfg.level2)) return null;
      if (cfg.level3 && !dimensions.includes(cfg.level3)) return null;
      if (cfg.metric && !valueFields.find(vf => vf.field === cfg.metric)) return null;
      if (cfg.colorMetric && !valueFields.find(vf => vf.field === cfg.colorMetric)) return null;
    }

    return cfg;
  };

  const validatedConfig = validateConfig(initialChartConfig);

  // Auto-select X-axis (first date/timestamp field, or first dimension)
  const autoSelectXAxis = () => {
    // Use filtered dimensions to avoid selecting "Σ Values"
    const dateField = dimensions.find(dim =>
      fields[dim]?.type === 'date' || fields[dim]?.type === 'timestamp'
    );
    return dateField || dimensions[0] || '';
  };

  // Auto-select Group by (first non-X-axis dimension)
  const autoSelectGroupBy = (xAxis) => {
    // Use filtered dimensions to avoid selecting "Σ Values"
    return dimensions.find(dim => dim !== xAxis) || '';
  };

  // Use validated config if available, otherwise auto-select
  const initialXAxis = validatedConfig?.xAxis || autoSelectXAxis();
  const [chartType, setChartType] = useState(validatedConfig?.chartType || 'bar-line');
  const [xAxis, setXAxis] = useState(initialXAxis);
  const [groupBy, setGroupBy] = useState(validatedConfig?.groupBy !== undefined ? validatedConfig.groupBy : autoSelectGroupBy(initialXAxis));
  const [barMode, setBarMode] = useState(validatedConfig?.barMode || 'group');
  const [displayMode, setDisplayMode] = useState(chartDisplayMode === 'hidden' ? 'split-below' : chartDisplayMode);
  const [metrics, setMetrics] = useState(
    validatedConfig?.metrics || [
      {
        field: config.values[0]?.field || '',
        chartType: 'bar',
        axis: 'Ax1',
        lineStyle: 'solid',
        opacity: 0.8
      }
    ]
  );

  // Scatter chart state
  const [scatterPointLevel, setScatterPointLevel] = useState(validatedConfig?.pointLevel || dimensions[0] || '');
  const [scatterXMetric, setScatterXMetric] = useState(validatedConfig?.xMetric || valueFields[0]?.field || '');
  const [scatterYMetric, setScatterYMetric] = useState(validatedConfig?.yMetric || valueFields[1]?.field || valueFields[0]?.field || '');
  const [scatterColorBy, setScatterColorBy] = useState(validatedConfig?.colorBy || '');
  const [scatterSizeBy, setScatterSizeBy] = useState(validatedConfig?.sizeBy || '');

  // Treemap chart state
  const [treemapMetric, setTreemapMetric] = useState(validatedConfig?.metric || valueFields[0]?.field || '');
  const [treemapColorMetric, setTreemapColorMetric] = useState(validatedConfig?.colorMetric || '');
  const [treemapLevel1, setTreemapLevel1] = useState(validatedConfig?.level1 || dimensions[0] || '');
  const [treemapLevel2, setTreemapLevel2] = useState(validatedConfig?.level2 || '');
  const [treemapLevel3, setTreemapLevel3] = useState(validatedConfig?.level3 || '');
  const [treemapColorScheme, setTreemapColorScheme] = useState(validatedConfig?.colorScheme || 'Viridis');

  const handleGenerate = () => {
    // Validate that we have valid dimensions for charting
    if (dimensions.length === 0) {
      return; // Can't create chart without dimensions
    }

    let chartConfig: ChartConfigOutput;

    if (chartType === 'bar-line') {
      chartConfig = {
        chartType: 'bar-line',
        xAxis,
        groupBy,
        barMode,
        metrics
      };
    } else if (chartType === 'scatter') {
      chartConfig = {
        chartType: 'scatter',
        pointLevel: scatterPointLevel,
        xMetric: scatterXMetric,
        yMetric: scatterYMetric,
        colorBy: scatterColorBy,
        sizeBy: scatterSizeBy
      };
    } else {
      // treemap
      chartConfig = {
        chartType: 'treemap',
        metric: treemapMetric,
        colorMetric: treemapColorMetric,
        level1: treemapLevel1,
        level2: treemapLevel2,
        level3: treemapLevel3,
        colorScheme: treemapColorScheme
      };
    }

    onGenerate(chartConfig, displayMode);
  };

  const chartTypes = [
    { value: 'bar-line', label: 'Bar / Line', icon: BarChartIcon },
    { value: 'scatter', label: 'Scatter', icon: ScatterIcon },
    { value: 'treemap', label: 'Treemap', icon: TreemapIcon }
  ];

  return (
    <BaseDialog
      title="Chart Configuration"
      onClose={onCancel}
      onSubmit={handleGenerate}
      submitLabel="Generate Chart"
      submitDisabled={dimensions.length === 0}
      maxWidth="480px"
    >
      {/* No Dimensions Warning */}
      {dimensions.length === 0 && (
        <div style={styles.warning}>
          <div style={styles.warningText}>
            No dimensions available. Add at least one dimension to rows or columns.
          </div>
        </div>
      )}

      {/* Chart Type Selector - Card Style */}
      <div style={styles.chartTypeSelector}>
        {chartTypes.map(type => {
          const isSelected = chartType === type.value;
          const Icon = type.icon;
          return (
            <button
              key={type.value}
              onClick={() => setChartType(type.value)}
              style={{
                ...styles.chartTypeCard,
                borderColor: isSelected ? 'var(--color-accent)' : 'var(--border-color-light)',
                backgroundColor: isSelected ? 'var(--color-accent-subtle)' : 'var(--surface-bg)'
              }}
            >
              <div style={{ color: isSelected ? 'var(--color-accent)' : 'var(--text-muted)' }}>
                <Icon />
              </div>
              <span style={{
                fontSize: '10px',
                fontWeight: isSelected ? 600 : 500,
                color: isSelected ? 'var(--color-accent)' : 'var(--text-secondary)'
              }}>
                {type.label}
              </span>
            </button>
          );
        })}
      </div>

      <div style={styles.divider} />

      {/* Bar/Line Configuration */}
      {chartType === 'bar-line' && (
        <BarLineChartConfig
          dimensions={dimensions}
          valueFields={valueFields}
          xAxis={xAxis}
          setXAxis={setXAxis}
          groupBy={groupBy}
          setGroupBy={setGroupBy}
          barMode={barMode}
          setBarMode={setBarMode}
          metrics={metrics}
          setMetrics={setMetrics}
        />
      )}

      {/* Scatter Configuration */}
      {chartType === 'scatter' && (
        <ScatterChartConfig
          dimensions={dimensions}
          valueFields={valueFields}
          pointLevel={scatterPointLevel}
          setPointLevel={setScatterPointLevel}
          xMetric={scatterXMetric}
          setXMetric={setScatterXMetric}
          yMetric={scatterYMetric}
          setYMetric={setScatterYMetric}
          colorBy={scatterColorBy}
          setColorBy={setScatterColorBy}
          sizeBy={scatterSizeBy}
          setSizeBy={setScatterSizeBy}
        />
      )}

      {/* Treemap Configuration */}
      {chartType === 'treemap' && (
        <TreemapChartConfig
          dimensions={dimensions}
          valueFields={valueFields}
          metric={treemapMetric}
          setMetric={setTreemapMetric}
          colorMetric={treemapColorMetric}
          setColorMetric={setTreemapColorMetric}
          level1={treemapLevel1}
          setLevel1={setTreemapLevel1}
          level2={treemapLevel2}
          setLevel2={setTreemapLevel2}
          level3={treemapLevel3}
          setLevel3={setTreemapLevel3}
          colorScheme={treemapColorScheme}
          setColorScheme={setTreemapColorScheme}
        />
      )}

      <div style={styles.divider} />

      {/* Display Mode */}
      <div style={styles.displaySection}>
        <label style={styles.displayLabel}>Display</label>
        <div style={styles.displayModeSelector}>
          {[
            { value: 'hidden', label: 'Hide' },
            { value: 'full', label: 'Full' },
            { value: 'split-right', label: 'Right' },
            { value: 'split-below', label: 'Below' }
          ].map(mode => (
            <button
              key={mode.value}
              onClick={() => setDisplayMode(mode.value)}
              style={{
                ...styles.displayModeButton,
                backgroundColor: displayMode === mode.value ? 'var(--text-secondary)' : 'var(--surface-bg)',
                color: displayMode === mode.value ? 'var(--text-inverse)' : 'var(--text-muted)',
                borderColor: displayMode === mode.value ? 'var(--text-secondary)' : 'var(--border-color-medium)'
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>
    </BaseDialog>
  );
}

const styles: Record<string, React.CSSProperties> = {
  divider: {
    height: '1px',
    backgroundColor: 'var(--border-color-light)',
    margin: '12px 0'
  },
  chartTypeSelector: {
    display: 'flex',
    gap: '8px',
    marginBottom: '4px'
  },
  chartTypeCard: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '4px',
    padding: '10px 8px',
    border: '1.5px solid var(--border-color-light)',
    borderRadius: '6px',
    backgroundColor: 'var(--surface-bg)',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  displaySection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  displayLabel: {
    fontSize: '11px',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    minWidth: '48px'
  },
  displayModeSelector: {
    display: 'flex',
    gap: '4px',
    flex: 1
  },
  displayModeButton: {
    flex: 1,
    padding: '5px 8px',
    fontSize: '10px',
    fontWeight: 500,
    border: '1px solid var(--border-color-medium)',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  warning: {
    padding: '8px 10px',
    marginBottom: '12px',
    backgroundColor: 'var(--color-warning-bg)',
    border: '1px solid var(--color-warning-border)',
    borderRadius: '4px'
  },
  warningText: {
    fontSize: '10px',
    lineHeight: 1.4,
    color: 'var(--color-warning)'
  }
};
