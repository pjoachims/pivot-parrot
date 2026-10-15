import React, { useState, useEffect } from 'react';
import { SortMenu } from './PivotMenus';
import { exportDataCSV, exportPivotCSV } from '../../application/utils/export';
import { usePivotStore } from '../../application/state/store';
import ErrorBanner from '../shared/ErrorBanner';
import { useClickOutside } from '../shared/useClickOutside';

type SecondaryDisplayMode = 'hidden' | 'full' | 'split-below' | 'split-right';

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

/**
 * Header component for PivotDisplay
 * Shows Sort, Export, and Chart sections with vertical separators
 */
export default function PivotDisplayHeader({
  data,
  cubeResults,
  config,
  locale = 'en-US',
  onOpenSQL,
  onDrilldown
}) {
  // Read from store
  const sortConfig = usePivotStore((s) => s.sortConfig);
  const setSortConfig = usePivotStore((s) => s.setSort);
  const activeView = usePivotStore((s) => s.activeView);
  const secondaryDisplayMode = usePivotStore((s) => s.secondaryDisplayMode);
  const chartConfig = usePivotStore((s) => s.chartConfig);
  const openChartDialog = usePivotStore((s) => s.openChartDialog);
  const setSecondaryDisplayMode = usePivotStore((s) => s.setSecondaryDisplayMode);

  const chartDisplayMode = activeView === 'chart' ? secondaryDisplayMode : 'hidden';
  const hasChart = !!chartConfig;
  const displayModes: Array<{ value: SecondaryDisplayMode; label: string; desc: string }> = [
    { value: 'hidden', label: 'Hide Chart', desc: 'Table only' },
    { value: 'full', label: 'Full Screen', desc: 'Chart only' },
    { value: 'split-below', label: 'Split Below', desc: 'Table + Chart' },
    { value: 'split-right', label: 'Split Right', desc: 'Side by side' }
  ];
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showChartModeMenu, setShowChartModeMenu] = useState(false);
  const [exportError, setExportError] = useState('');

  // Theme toggle: flips data-theme on <html> directly (no prop/config
  // plumbing). Initial value is whatever theme was last persisted to
  // localStorage, falling back to whatever the host has already stamped on
  // <html>, or 'light'. Mirrored in state only so the icon re-renders on
  // click.
  const [storedTheme] = useState(() => {
    try {
      const stored = localStorage.getItem('pp-theme');
      return stored === 'dark' || stored === 'light' ? stored : null;
    } catch { return null; /* best-effort */ }
  });
  const [theme, setTheme] = useState(() =>
    storedTheme ?? (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  );

  // The CSS variables only apply once data-theme is actually stamped on
  // <html> - restore a persisted choice on mount so a page reload doesn't
  // silently fall back to unthemed defaults while the toggle still shows
  // "dark". Only a persisted choice: stamping the 'light' fallback would
  // switch hosts that never touched the toggle from the :root default look
  // to the light theme.
  useEffect(() => {
    if (storedTheme && document.documentElement.dataset.theme !== storedTheme) {
      document.documentElement.dataset.theme = storedTheme;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('pp-theme', next); } catch { /* best-effort */ }
    setTheme(next);
  };

  // Close menus when clicking outside their own container
  useClickOutside('.sort-menu-container', () => setShowSortMenu(false));
  useClickOutside('.export-menu-container', () => setShowExportMenu(false));
  useClickOutside('.chart-mode-menu-container', () => setShowChartModeMenu(false));

  // Helper to compute leaf columns for CSV export
  function computeLeafColumns(displayData) {
    if (!displayData || !displayData.columnConfig) return [];

    const hierarchy = displayData.columnConfig.hierarchy || [];

    function collectLeaves(nodes, leaves = []) {
      nodes.forEach(node => {
        if (node.children?.length > 0) {
          collectLeaves(node.children, leaves);
        } else {
          leaves.push(node);
        }
      });
      return leaves;
    }

    return collectLeaves(hierarchy);
  }

  const handleExportData = () => {
    if (cubeResults && cubeResults.length > 0) {
      exportDataCSV({ cubeResults }, config, locale);
      setShowExportMenu(false);
      setExportError('');
    } else {
      setExportError('No data to export');
    }
  };

  const handleExportLayout = () => {
    if (data && config) {
      const rowFieldNames = config.rows.map(f => typeof f === 'string' ? f : f.id);
      const leafCols = computeLeafColumns(data);
      exportPivotCSV(data, leafCols, rowFieldNames, true, config.showGrandTotal !== false, config, locale);
      setShowExportMenu(false);
    }
  };

  const verticalSeparator = {
    width: '1px',
    height: '20px',
    background: 'var(--border-color-medium)',
    margin: '0 8px'
  };

  const iconButtonStyle = {
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    background: 'transparent',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    color: 'var(--text-muted)'
  };

  const sectionLabelStyle = {
    fontSize: '11px',
    fontWeight: 500,
    color: 'var(--text-muted)',
    marginRight: '4px'
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      background: 'var(--surface-bg)',
      borderBottom: 'var(--border-width, 1px) solid var(--border-color-medium)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0' }}>
        {/* Sort Section */}
        <div className="sort-menu-container" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span style={sectionLabelStyle}>Sort</span>
          <button
            onClick={() => {
              setShowSortMenu(!showSortMenu);
              setShowExportMenu(false);
            }}
            className="pp-icon-btn-hover"
            style={iconButtonStyle}
            title="Sort rows"
            aria-label="Sort rows"
          >
            <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
            </svg>
          </button>

          {/* Sort dropdown menu */}
          {showSortMenu && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              zIndex: 'var(--z-dropdown)' as any
            }}>
              <SortMenu
                styles={{
                  popoverMenu: {
                    background: 'var(--surface-bg)',
                    border: '1px solid var(--border-color-medium)',
                    borderRadius: '6px',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                    minWidth: '200px'
                  },
                  menuHeader: {
                    padding: '6px 10px',
                    borderBottom: '1px solid var(--border-color-light)',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)'
                  },
                  settingSection: {
                    padding: '8px 10px',
                    borderBottom: '1px solid var(--border-color-light)'
                  },
                  settingLabel: {
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    marginBottom: '4px',
                    display: 'block'
                  },
                  subtotalsDropdown: {
                    width: '100%',
                    padding: '4px 6px',
                    fontSize: '11px',
                    border: '1px solid var(--border-color-medium)',
                    borderRadius: '4px',
                    background: 'var(--surface-bg)',
                    color: 'var(--text-secondary)'
                  },
                  menuButton: {
                    background: 'var(--surface-bg)',
                    border: '1px solid var(--border-color-light)',
                    padding: '5px 10px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    color: 'var(--text-secondary)',
                    fontWeight: 500,
                    borderRadius: '4px'
                  }
                }}
                data={data}
                config={config}
                sortConfig={sortConfig}
                onSortChange={setSortConfig}
              />
            </div>
          )}
        </div>

        <div style={verticalSeparator}></div>

        {/* Export Section */}
        <div className="export-menu-container" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span style={sectionLabelStyle}>Export</span>
          <button
            onClick={() => {
              setShowExportMenu(!showExportMenu);
              setShowSortMenu(false);
            }}
            className="pp-icon-btn-hover"
            style={iconButtonStyle}
            title="Export CSV"
            aria-label="Export CSV"
          >
            <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>

          {/* Export dropdown menu */}
          {showExportMenu && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '4px',
              minWidth: '200px',
              background: 'var(--surface-bg)',
              border: '1px solid var(--border-color-medium)',
              borderRadius: '6px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              zIndex: 'var(--z-dropdown)' as any,
              overflow: 'hidden'
            }}>
              <div style={{
                padding: '6px 10px',
                borderBottom: '1px solid var(--border-color-light)',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--text-secondary)'
              }}>
                Export CSV
              </div>
              {exportError && (
                <div style={{ padding: '6px 10px' }}>
                  <ErrorBanner message={exportError} onDismiss={() => setExportError('')} style={{ padding: '4px 6px', fontSize: 'var(--text-xs)' }} />
                </div>
              )}
              <button
                onClick={handleExportData}
                className="pp-icon-btn-hover"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  textAlign: 'left',
                  padding: '8px 10px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: '11px',
                  color: 'var(--text-secondary)'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                Raw Results
              </button>
              <button
                onClick={handleExportLayout}
                className="pp-icon-btn-hover"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  textAlign: 'left',
                  padding: '8px 10px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: '11px',
                  color: 'var(--text-secondary)'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="9" x2="9" y2="21" />
                </svg>
                Visual Layout
              </button>
            </div>
          )}
        </div>

        <div style={verticalSeparator}></div>

        {/* Chart Section */}
        <div className="chart-mode-menu-container" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span style={sectionLabelStyle}>Chart</span>
          <button
            onClick={openChartDialog}
            className="pp-icon-btn-hover"
            style={iconButtonStyle}
            title="Create chart"
            aria-label="Create chart"
          >
            <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>

          {/* Chart mode selector - only show if chart exists */}
          {hasChart && (
            <>
              <button
                onClick={() => {
                  setShowChartModeMenu(!showChartModeMenu);
                  setShowSortMenu(false);
                  setShowExportMenu(false);
                }}
                className="pp-icon-btn-hover"
                style={iconButtonStyle}
                title="Chart display mode"
                aria-label="Chart display mode"
              >
                <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* Chart mode dropdown menu */}
              {showChartModeMenu && (
                <div style={{
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
                }}>
                  <div style={{
                    padding: '6px 10px',
                    borderBottom: '1px solid var(--border-color-light)',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)'
                  }}>
                    Display Mode
                  </div>
                  {displayModes.map(mode => (
                    <button
                      key={mode.value}
                      onClick={() => {
                        setSecondaryDisplayMode(mode.value);
                        setShowChartModeMenu(false);
                      }}
                      className={chartDisplayMode !== mode.value ? 'pp-row-hover' : undefined}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        textAlign: 'left',
                        padding: '8px 10px',
                        border: 'none',
                        background: chartDisplayMode === mode.value ? 'var(--surface-hover)' : 'transparent',
                        cursor: 'pointer',
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
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
            </>
          )}
        </div>

        {/* SQL Section */}
        {onOpenSQL && (
          <>
            <div style={verticalSeparator}></div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={sectionLabelStyle}>SQL</span>
              <button
                onClick={onOpenSQL}
                className="pp-icon-btn-hover"
                style={iconButtonStyle}
                title="SQL Playground"
                aria-label="SQL Playground"
              >
                <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Right: brand wordmark + theme toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <a
          href="https://github.com/pjoachims/pivot-parrot"
          target="_blank"
          rel="noopener noreferrer"
          title="Pivot Parrot on GitHub"
          className="pp-brand-link"
          style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.02em',
            color: 'var(--text-muted)',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            textDecoration: 'none'
          }}
        >
          <span aria-hidden="true">🦜 </span>Pivot Parrot
        </a>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <button
          onClick={toggleTheme}
          className="pp-icon-btn-hover"
          style={iconButtonStyle}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? (
            <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41" />
            </svg>
          ) : (
            <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          )}
        </button>
      </div>
      </div>
    </div>
  );
}
