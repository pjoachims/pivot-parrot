import React, { useEffect, useRef, useState } from 'react';
import { transformBarLineChart } from './BarLineChart';
import { transformScatterChart } from './ScatterChart';
import { transformTreemapChart } from './TreemapChart';
import { buildChartData } from './chartUtils';
import { usePivotStore } from '../../application/state/store';
import { useClickOutside } from '../shared/useClickOutside';

declare global {
  interface Window {
    __pivotParrotLoadPlotly?: () => Promise<any>;
  }
}

type SecondaryDisplayMode = 'hidden' | 'full' | 'split-below' | 'split-right';

// Display-mode icons (matches the equivalent menu in PivotDisplayHeader.tsx for visual consistency)
const displayModeIcons: Record<SecondaryDisplayMode, React.ReactNode> = {
  hidden: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  full: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  'split-below': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="7" rx="1" /><rect x="3" y="14" width="18" height="7" rx="1" />
    </svg>
  ),
  'split-right': (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="18" rx="1" /><rect x="14" y="3" width="7" height="18" rx="1" />
    </svg>
  )
};

// Plotly's `layout` doesn't understand CSS custom properties, so read the
// active theme's resolved token values off the chart's own container and
// translate them into the handful of Plotly layout fields that otherwise
// stay hardcoded to Plotly's light-mode defaults (white paper, dark text).
function getChartThemeColors(el: HTMLElement | null) {
  const computed = el ? getComputedStyle(el) : null;
  const token = (name: string, fallback: string) => {
    const value = computed?.getPropertyValue(name).trim();
    return value || fallback;
  };
  return {
    surfaceBg: token('--surface-bg', '#ffffff'),
    textPrimary: token('--text-primary', '#111827'),
    textMuted: token('--text-muted', '#6b7280'),
    borderLight: token('--border-color-light', '#e5e7eb'),
    borderMedium: token('--border-color-medium', '#d1d5db')
  };
}

function applyChartTheme(layout, colors: ReturnType<typeof getChartThemeColors>) {
  const axisTheme = {
    gridcolor: colors.borderLight,
    linecolor: colors.borderMedium,
    zerolinecolor: colors.borderMedium,
    tickfont: { color: colors.textMuted }
  };
  return {
    ...layout,
    paper_bgcolor: colors.surfaceBg,
    plot_bgcolor: colors.surfaceBg,
    font: { ...layout.font, color: colors.textPrimary },
    ...(layout.xaxis && { xaxis: { ...layout.xaxis, ...axisTheme } }),
    ...(layout.yaxis && { yaxis: { ...layout.yaxis, ...axisTheme } }),
    ...(layout.yaxis2 && { yaxis2: { ...layout.yaxis2, ...axisTheme } }),
    ...(layout.legend && { legend: { ...layout.legend, font: { color: colors.textPrimary } } }),
    hoverlabel: {
      ...layout.hoverlabel,
      bgcolor: colors.surfaceBg,
      bordercolor: colors.borderMedium,
      font: { ...layout.hoverlabel?.font, color: colors.textPrimary }
    },
    // Treemap sets an explicit title.font color; everyone else's title is
    // just a string (or unset), so there's nothing to re-color there.
    ...(layout.title && typeof layout.title === 'object' && layout.title.font && {
      title: { ...layout.title, font: { ...layout.title.font, color: colors.textPrimary } }
    })
  };
}

const WarningIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

export default function ChartView({ chartConfig, cubeResults, config, fields, dialect, dtypes, locale = 'en-US' }) {
  // Read from store
  const activeView = usePivotStore((s) => s.activeView);
  const secondaryDisplayMode = usePivotStore((s) => s.secondaryDisplayMode);
  const setSecondaryDisplayMode = usePivotStore((s) => s.setSecondaryDisplayMode);

  const chartDisplayMode = activeView === 'chart' ? secondaryDisplayMode : 'full';
  const [chartError, setChartError] = useState(null);
  const chartRef = useRef(null);
  const containerRef = useRef(null);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [plotlyLoaded, setPlotlyLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [themeVersion, setThemeVersion] = useState(0);
  const plotlyRef = useRef(null);
  const displayModes: Array<{ value: SecondaryDisplayMode; label: string; desc: string }> = [
    { value: 'hidden', label: 'Hide Chart', desc: 'Table only' },
    { value: 'full', label: 'Full Screen', desc: 'Chart only' },
    { value: 'split-below', label: 'Split Below', desc: 'Table + Chart' },
    { value: 'split-right', label: 'Split Right', desc: 'Side by side' }
  ];

  // Close menu when clicking outside its own container
  useClickOutside('.chart-mode-menu-container', () => setShowModeMenu(false));

  // Load Plotly dynamically
  useEffect(() => {
    let mounted = true;
    // Hosts that can't ship Plotly in their bundle can set this global loader.
    const loadPlotly = (typeof window !== 'undefined' && window.__pivotParrotLoadPlotly) || (() => import('plotly.js-dist-min'));

    loadPlotly().then((module) => {
      if (mounted) {
        plotlyRef.current = module.default ?? module;
        setPlotlyLoaded(true);
      }
    }).catch((err) => {
      console.error('Failed to load Plotly:', err);
    });

    return () => { mounted = false; };
  }, []);

  // Re-render the chart when the host toggles data-theme, so the colors
  // baked into the Plotly layout (see getChartThemeColors/applyChartTheme
  // below) stay in sync rather than freezing at whatever theme was active
  // when the chart was first drawn.
  useEffect(() => {
    const observer = new MutationObserver(() => setThemeVersion((v) => v + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      setIsFullscreen(isCurrentlyFullscreen);

      // Resize Plotly chart when fullscreen changes
      if (chartRef.current && plotlyRef.current) {
        setTimeout(() => {
          plotlyRef.current.Plots.resize(chartRef.current);
        }, 100);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, [plotlyLoaded]);

  // Fullscreen handlers
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      if (!isFullscreen) {
        // Enter fullscreen
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else if (containerRef.current.webkitRequestFullscreen) {
          await containerRef.current.webkitRequestFullscreen();
        } else if (containerRef.current.mozRequestFullScreen) {
          await containerRef.current.mozRequestFullScreen();
        } else if (containerRef.current.msRequestFullscreen) {
          await containerRef.current.msRequestFullscreen();
        }
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          await document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          await document.msExitFullscreen();
        }
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  };

  useEffect(() => {
    if (!chartRef.current || !cubeResults || !plotlyLoaded || !plotlyRef.current) return;

    // Clear error state
    setChartError(null);

    if (!cubeResults || cubeResults.length === 0) {
      // Clear chart if no data
      if (chartRef.current && plotlyRef.current) {
        plotlyRef.current.purge(chartRef.current);
      }
      setChartError('No data available');
      return;
    }

    try {
      // Build chart data once (centralized filtering and value conversion)
      const preparedData = buildChartData(cubeResults, chartConfig, config, dtypes, dialect);

      // Transform prepared data based on chart type
      let chartData, layout;

      if (chartConfig.chartType === 'scatter') {
        const result = transformScatterChart(preparedData, chartConfig, locale);
        chartData = result.traces;
        layout = result.layout;
      } else if (chartConfig.chartType === 'treemap') {
        const result = transformTreemapChart(preparedData, chartConfig, locale);
        chartData = result.traces;
        layout = result.layout;
      } else {
        // Default: bar-line
        const result = transformBarLineChart(preparedData, chartConfig, locale);
        chartData = result.traces;
        layout = result.layout;
      }


      if (!chartData || chartData.length === 0) {
        setChartError('No valid data for chart');
        if (chartRef.current && plotlyRef.current) {
          plotlyRef.current.purge(chartRef.current);
        }
        return;
      }

      // Theme the layout using the resolved CSS token values, so the chart
      // matches the active theme instead of Plotly's white-paper default.
      const themeColors = getChartThemeColors(containerRef.current);
      layout = applyChartTheme(layout, themeColors);

      // Create/update Plotly chart
      const plotConfig = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false,
        modeBarButtonsToRemove: ['select2d', 'lasso2d']
      };

      try {
        // Use react() for updates (more efficient than newPlot)
        plotlyRef.current.react(chartRef.current, chartData, layout, plotConfig);
      } catch (plotlyError) {
        // Fallback to newPlot if react fails
        try {
          plotlyRef.current.newPlot(chartRef.current, chartData, layout, plotConfig);
        } catch (fallbackError) {
          throw new Error('Failed to render chart');
        }
      }
    } catch (error) {
      // Handle all chart errors
      setChartError(error.message || 'Chart error');
      if (chartRef.current && plotlyRef.current) {
        plotlyRef.current.purge(chartRef.current);
      }
    }
  }, [chartConfig, cubeResults, config, plotlyLoaded, themeVersion, locale]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current && plotlyRef.current) {
        plotlyRef.current.purge(chartRef.current);
      }
    };
  }, []);

  return (
    <div ref={containerRef} style={isFullscreen ? styles.fullscreenContainer : styles.container}>
      <div style={styles.toolbar}>
        <button
          onClick={toggleFullscreen}
          style={styles.modeButton}
          className="pp-icon-btn-hover"
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? (
            <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          )}
        </button>
        <div className="chart-mode-menu-container" style={{ position: 'relative', marginLeft: 'auto' }}>
          <button
            onClick={() => setShowModeMenu(!showModeMenu)}
            style={styles.modeButton}
            className="pp-icon-btn-hover"
            title="Chart display mode"
            aria-label="Chart display mode"
          >
            <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {showModeMenu && (
            <div style={styles.modeMenu}>
              <div style={styles.menuHeader}>Display Mode</div>
              {displayModes.map(mode => (
                <button
                  key={mode.value}
                  onClick={() => {
                    setSecondaryDisplayMode(mode.value);
                    setShowModeMenu(false);
                  }}
                  className={chartDisplayMode !== mode.value ? 'pp-row-hover' : undefined}
                  style={{
                    ...styles.modeOption,
                    background: chartDisplayMode === mode.value ? 'var(--surface-hover)' : 'transparent',
                    fontWeight: chartDisplayMode === mode.value ? 600 : 400
                  }}
                >
                  {displayModeIcons[mode.value]}
                  <div>
                    <div>{mode.label}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{mode.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {!plotlyLoaded && (
        <div style={styles.loading}>
          <span className="pp-spinner" aria-hidden="true" style={{ marginRight: '8px' }} />
          Loading chart library...
        </div>
      )}
      {chartError && (
        <div style={styles.error}>
          <div style={styles.errorIcon}><WarningIcon /></div>
          <div style={styles.errorText}>{chartError}</div>
          <div style={styles.errorHint}>Chart configuration may no longer be valid</div>
        </div>
      )}
      <div ref={chartRef} style={styles.chart} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    width: '100%'
  },
  fullscreenContainer: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    width: '100vw',
    backgroundColor: 'var(--surface-bg)',
    position: 'fixed',
    top: 0,
    left: 0,
    zIndex: 'var(--z-overlay)' as any
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: '4px 8px',
    borderBottom: '1px solid var(--border-color-light)',
    backgroundColor: 'var(--surface-bg)'
  },
  modeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    fontSize: '13px',
    color: 'var(--text-muted)',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    transition: 'background-color 0.15s'
  },
  modeMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: '4px',
    minWidth: '180px',
    background: 'var(--surface-bg)',
    border: '1px solid var(--border-color-medium)',
    borderRadius: '6px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    zIndex: 'var(--z-dropdown)' as any,
    overflow: 'hidden'
  },
  menuHeader: {
    padding: '6px 10px',
    borderBottom: '1px solid var(--border-color-light)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-secondary)'
  },
  modeOption: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    textAlign: 'left',
    padding: '8px 10px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '11px',
    color: 'var(--text-secondary)'
  },
  chart: {
    flex: 1,
    minHeight: 0
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    color: 'var(--text-muted)',
    fontSize: '14px'
  },
  error: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    color: 'var(--color-error)',
    fontSize: '14px'
  },
  errorIcon: {
    display: 'flex',
    marginBottom: '8px',
    color: 'var(--color-error)'
  },
  errorText: {
    fontWeight: 600,
    marginBottom: '4px'
  },
  errorHint: {
    fontSize: '12px',
    color: 'var(--text-muted)'
  }
};
