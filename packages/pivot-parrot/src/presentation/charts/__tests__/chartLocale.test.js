import { describe, it, expect } from 'vitest';
import { getMetricFormat } from '../chartUtils';
import { transformBarLineChart } from '../BarLineChart';
import { transformScatterChart } from '../ScatterChart';
import { transformTreemapChart } from '../TreemapChart';
import { Arrow } from '../../../domain/types/ArrowTypes';

const NBSP = ' ';

const config = {
  values: [
    { field: 'revenue', aggregation: 'Sum', isCustom: false, format: { type: 'currency', currency: 'EUR', decimals: 0 } },
    { field: 'm2', aggregation: 'custom', isCustom: true }
  ],
  customMetrics: [{ id: 'm2', format: { type: 'percentage', decimals: 1 } }]
};

const rows = [
  { category: 'Köln', sum_revenue: 1234.5, m2: 0.1234 },
  { category: 'Bonn', sum_revenue: 2000, m2: 0.2 }
];
const dtypes = { category: Arrow.utf8, sum_revenue: Arrow.double, m2: Arrow.double };

describe('getMetricFormat', () => {
  it('puts the currency symbol where the locale puts it, never a hard-coded $', () => {
    expect(getMetricFormat('revenue', config, 'de-DE')).toEqual({ d3: ',.0f', prefix: '', suffix: `${NBSP}€` });
    expect(getMetricFormat('revenue', config, 'en-US')).toEqual({ d3: ',.0f', prefix: '€', suffix: '' });
  });

  it('formats percentages as d3 percent', () => {
    expect(getMetricFormat('m2', config, 'de-DE')).toEqual({ d3: '.1%', prefix: '', suffix: '' });
  });

  it('treats the number type like the table does (no grouping by default)', () => {
    const cfg = { values: [{ field: 'x', aggregation: 'sum', format: { type: 'number', decimals: 1 } }] };
    expect(getMetricFormat('x', cfg, 'en-US')).toEqual({ d3: '.1f', prefix: '', suffix: '' });
  });
});

describe('chart locale', () => {
  it('bar/line hover and axis use the locale separators and the currency symbol', () => {
    const { traces, layout } = transformBarLineChart(
      { rows, dtypes, config },
      { xAxis: 'category', groupBy: '', metrics: [{ field: 'revenue', chartType: 'bar', axis: 'Ax1' }] },
      'de-DE'
    );
    expect(layout.separators).toBe(',.');
    expect(traces[0].hovertemplate).toContain(`%{y:,.0f}${NBSP}€`);
    expect(layout.yaxis).toMatchObject({ tickformat: ',.0f', tickprefix: '', ticksuffix: `${NBSP}€` });
  });

  it('defaults to en-US separators', () => {
    const { layout } = transformBarLineChart(
      { rows, dtypes, config },
      { xAxis: 'category', groupBy: '', metrics: [{ field: 'm2', chartType: 'line', axis: 'Ax1' }] }
    );
    expect(layout.separators).toBe('.,');
    expect(layout.yaxis.tickformat).toBe('.1%');
  });

  it('scatter axes use the metric formats and the locale separators', () => {
    const { layout } = transformScatterChart(
      { rows, dtypes, config },
      { pointLevel: 'category', xMetric: 'revenue', yMetric: 'm2', colorBy: '' },
      'de-DE'
    );
    expect(layout.separators).toBe(',.');
    expect(layout.xaxis).toMatchObject({ tickformat: ',.0f', hoverformat: ',.0f', ticksuffix: `${NBSP}€` });
    expect(layout.yaxis).toMatchObject({ tickformat: '.1%', hoverformat: '.1%' });
  });

  it('treemap hover uses the locale separators and the currency symbol', () => {
    const cubeIndex = new Map();
    cubeIndex.set('category:*', [{ sum_revenue: 3234.5 }]);
    cubeIndex.set('category:Köln', [{ category: 'Köln', sum_revenue: 1234.5 }]);
    cubeIndex.set('category:Bonn', [{ category: 'Bonn', sum_revenue: 2000 }]);
    const { traces, layout } = transformTreemapChart(
      { rows, cubeIndex, dimensions: ['category'], allDimensions: ['category'], dtypes, config },
      { levels: ['category'], metric: 'revenue', colorMetric: '' },
      'de-DE'
    );
    expect(layout.separators).toBe(',.');
    expect(traces[0].hovertemplate).toContain(`%{value:,.0f}${NBSP}€`);
  });
});

describe('chart locale rendered by Plotly', () => {
  it('draws de-DE currency ticks', async () => {
    HTMLCanvasElement.prototype.getContext = () => null;
    window.URL.createObjectURL = () => '';
    const Plotly = (await import('plotly.js-dist-min')).default;
    const { traces, layout } = transformBarLineChart(
      { rows: [{ category: 'A', sum_revenue: 1234567.5 }, { category: 'B', sum_revenue: 2500000 }], dtypes: {}, config },
      { xAxis: 'category', groupBy: '', metrics: [{ field: 'revenue', chartType: 'bar', axis: 'Ax1' }] },
      'de-DE'
    );
    const div = document.createElement('div');
    document.body.appendChild(div);
    await Plotly.newPlot(div, traces, { ...layout, width: 600, height: 400 });
    const ticks = [...div.querySelectorAll('.ytick text')].map(t => t.textContent);
    expect(ticks).toContain(`1.000.000${NBSP}€`);
    Plotly.purge(div);
    div.remove();
  }, 30000);
});
