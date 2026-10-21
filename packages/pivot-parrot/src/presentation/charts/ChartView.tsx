import React, { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../shared/Icon';
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
const displayModeIcons: Record<SecondaryDisplayMode, IconName> = {
  hidden: 'x',
  full: 'chart-bar',
  'split-below': 'panels',
  'split-right': 'columns'
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
    // Transparent, muted icons: a quiet strip in the top margin, not a toolbar
    modebar: { bgcolor: 'rgba(0,0,0,0)', color: colors.textMuted, activecolor: colors.textPrimary },
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

export default function ChartView({ chartConfig, cubeResults, config, dialect, dtypes, locale = 'en-US' }) {
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
      } catch {
        // Fallback to newPlot if react fails
        try {
          plotlyRef.current.newPlot(chartRef.current, chartData, layout, plotConfig);
        } catch {
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
  }, [chartConfig, cubeResults, config, plotlyLoaded, themeVersion, locale, dialect, dtypes]);

  // Cleanup on unmount
  useEffect(() => {
    const chart = chartRef.current;
    return () => {
      if (chart && plotlyRef.current) {
        plotlyRef.current.purge(chart);
      }
    };
  }, []);

  return (
    <div ref={containerRef} style={isFullscreen ? styles.fullscreenContainer : styles.container}>
      <div className="pp-panel-header">
        <span className="pp-panel-title">Chart</span>
        <div className="chart-mode-menu-container" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <button
            onClick={toggleFullscreen}
            className="pp-icon-btn"
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            <Icon name={isFullscreen ? 'minimize' : 'maximize'} />
          </button>
          <button
            onClick={() => setShowModeMenu(!showModeMenu)}
            className="pp-icon-btn"
            aria-expanded={showModeMenu}
            title="Chart display mode"
            aria-label="Chart display mode"
          >
            <Icon name="panels" />
          </button>

          {showModeMenu && (
            <div className="pp-menu" role="menu" style={styles.modeMenu}>
              <div className="pp-menu-title">Display Mode</div>
              {displayModes.map(mode => (
                <button
                  key={mode.value}
                  role="menuitemradio"
                  aria-checked={chartDisplayMode === mode.value}
                  onClick={() => {
                    setSecondaryDisplayMode(mode.value);
                    setShowModeMenu(false);
                  }}
                  className="pp-menu-item"
                  style={{ height: 'auto', padding: '6px var(--space-3)' }}
                >
                  <Icon name={displayModeIcons[mode.value]} />
                  <span>
                    <span style={{ display: 'block' }}>{mode.label}</span>
                    <span className="pp-hint" style={{ display: 'block' }}>{mode.desc}</span>
                  </span>
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
  modeMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 'var(--space-1)',
    minWidth: '200px',
    zIndex: 'var(--z-dropdown)' as any
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
