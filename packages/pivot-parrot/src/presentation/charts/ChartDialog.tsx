import React, { useState } from 'react';
import BaseDialog from '../shared/BaseDialog';
import { Icon } from '../shared/Icon';
import BarLineChartConfig from './BarLineChart';
import ScatterChartConfig from './ScatterChart';
import TreemapChartConfig from './TreemapChart';
import { usePivotStore } from '../../application/state/store';
import { fieldDisplayName, valueDisplayName } from '../../domain/field/fieldDisplayName';
import { SIGMA_VALUES_ID } from '../../domain/models/types';

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

export default function ChartDialog({ config, fields, chartDisplayMode = 'full', initialChartConfig = null, onGenerate, onCancel }: ChartDialogProps) {
  const availableFields = usePivotStore((s) => s.availableFields);
  const dimensionLabel = (dim: string) => fieldDisplayName(dim, config, availableFields);

  // Get available dimensions (rows + columns)
  // Handle both string field names and FieldItem objects
  // Filter out "Σ Values" dimension
  const dimensions = [...config.rows, ...config.columns]
    .map(dim => typeof dim === 'string' ? dim : dim.id)
    .filter(dim => dim !== SIGMA_VALUES_ID);

  // Get available value fields with aggregation in label
  const valueFields = config.values.map(v => ({
    field: v.field,
    label: valueDisplayName(v, config, availableFields)
  }));

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
    { value: 'bar-line', label: 'Bar / Line', icon: 'chart-bar' },
    { value: 'scatter', label: 'Scatter', icon: 'chart-scatter' },
    { value: 'treemap', label: 'Treemap', icon: 'chart-treemap' }
  ] as const;

  return (
    <BaseDialog
      title="Chart Configuration"
      onClose={onCancel}
      onSubmit={handleGenerate}
      submitLabel="Generate Chart"
      submitDisabled={dimensions.length === 0}
      maxWidth="480px"
    >
      {dimensions.length === 0 && (
        <div className="pp-alert" style={{ color: 'var(--color-warning)', background: 'var(--color-warning-bg)', borderColor: 'var(--color-warning-border)' }}>
          No dimensions available. Add at least one dimension to rows or columns.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }} role="group" aria-label="Chart type">
        {chartTypes.map(type => (
          <button
            key={type.value}
            onClick={() => setChartType(type.value)}
            aria-pressed={chartType === type.value}
            className="pp-btn"
          >
            <Icon name={type.icon} />
            {type.label}
          </button>
        ))}
      </div>

      {/* Bar/Line Configuration */}
      {chartType === 'bar-line' && (
        <BarLineChartConfig
          dimensions={dimensions}
          dimensionLabel={dimensionLabel}
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
          dimensionLabel={dimensionLabel}
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
          dimensionLabel={dimensionLabel}
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

      <div className="pp-section">
        <div className="pp-label-row">
          <span className="pp-label">Display</span>
          <div className="pp-seg" role="group" aria-label="Display">
            {[
              { value: 'hidden', label: 'Hide' },
              { value: 'full', label: 'Full' },
              { value: 'split-right', label: 'Right' },
              { value: 'split-below', label: 'Below' }
            ].map(mode => (
              <button
                key={mode.value}
                onClick={() => setDisplayMode(mode.value)}
                aria-pressed={displayMode === mode.value}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </BaseDialog>
  );
}

