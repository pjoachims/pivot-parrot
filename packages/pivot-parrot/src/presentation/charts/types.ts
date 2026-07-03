/**
 * Chart type definitions for Plotly-based visualizations
 * Defines only the properties we actually use in our charts
 */

export interface PlotlyFont {
  size?: number;
  color?: string;
  family?: string;
}

export interface PlotlyMarker {
  color?: string | string[];
  colors?: number[];
  opacity?: number;
  colorscale?: string | Array<[number, string]>;
  colorbar?: {
    thickness?: number;
    len?: number;
    x?: number;
    title?: {
      text?: string;
      side?: string;
    };
  };
}

export interface PlotlyLine {
  color?: string;
  width?: number;
  dash?: 'solid' | 'dot' | 'dash' | 'longdash' | 'dashdot' | 'longdashdot';
}

export interface TreemapTrace {
  type: 'treemap';
  ids: string[];
  labels: string[];
  parents: string[];
  values: number[];
  maxdepth?: number;
  branchvalues?: 'total' | 'remainder';
  textposition?: string;
  textfont?: PlotlyFont;
  pathbar?: {
    visible?: boolean;
    thickness?: number;
    textfont?: PlotlyFont;
  };
  hovertemplate?: string;
  marker?: PlotlyMarker;
}

export interface BarLineTrace {
  name: string;
  x: (string | number)[];
  y: number[];
  type: 'bar' | 'scatter';
  yaxis?: 'y' | 'y2';
  customdata?: unknown[];
  hovertemplate?: string;
  mode?: 'lines' | 'markers' | 'lines+markers';
  line?: PlotlyLine;
  marker?: PlotlyMarker;
}

export interface PlotlyAxis {
  title?: string | { text?: string; hovertext?: string };
  type?: 'linear' | 'log' | 'date' | 'category';
  tickformat?: string;
  hoverformat?: string;
  side?: 'left' | 'right';
  overlaying?: string;
  showgrid?: boolean;
  autorange?: boolean | 'reversed';
  rangemode?: 'normal' | 'tozero' | 'nonnegative';
  automargin?: boolean;
}

export interface PlotlyLayout {
  title?: string | { text?: string; hovertext?: string };
  xaxis?: PlotlyAxis;
  yaxis?: PlotlyAxis;
  yaxis2?: PlotlyAxis;
  barmode?: 'stack' | 'group' | 'overlay' | 'relative';
  showlegend?: boolean;
  legend?: {
    x?: number;
    y?: number;
    xanchor?: string;
    yanchor?: string;
  };
  hovermode?: 'closest' | 'x' | 'y' | 'x unified' | 'y unified' | false;
  barnorm?: 'fraction' | 'percent';
  hoverlabel?: {
    bgcolor?: string;
    bordercolor?: string;
    font?: PlotlyFont;
    align?: 'left' | 'right' | 'auto';
    namelength?: number;
  };
  margin?: {
    l?: number;
    r?: number;
    t?: number;
    b?: number;
  };
  autosize?: boolean;
  height?: number;
  width?: number;
}

export type PlotlyTrace = TreemapTrace | BarLineTrace;
