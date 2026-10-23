import React, { useState, useEffect } from 'react';
import { SortMenu } from './PivotMenus';
import { exportDataCSV, exportPivotCSV, type RowLayout } from '../../application/utils/export';
import { usePivotStore, usePivotSheetModeEnabled } from '../../application/state/store';
import ErrorBanner from '../shared/ErrorBanner';
import { useClickOutside } from '../shared/useClickOutside';
import { Icon, type IconName } from '../shared/Icon';

type SecondaryDisplayMode = 'hidden' | 'full' | 'split-below' | 'split-right';

const layoutForms: Array<{ form: RowLayout['form']; label: string; desc: string }> = [
  { form: 'compact', label: 'Compact', desc: 'Row labels in one column' },
  { form: 'outline', label: 'Outline', desc: 'One column per row field, parents above' },
  { form: 'tabular', label: 'Tabular', desc: 'One column per row field, totals below' }
];

/** The layout with form `form`, keeping "Repeat item labels" when moving between Outline and Tabular. */
const withForm = (layout: RowLayout, form: RowLayout['form']): RowLayout =>
  form === 'compact' ? { form } : { form, repeatLabels: layout.form !== 'compact' && layout.repeatLabels };

const displayModeIcons: Record<SecondaryDisplayMode, IconName> = {
  hidden: 'x',
  full: 'chart-bar',
  'split-below': 'panels',
  'split-right': 'columns'
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
  dtypes = {},
  dialect = null,
  onOpenSQL
}) {
  // Read from store
  const sortConfig = usePivotStore((s) => s.sortConfig);
  const setSortConfig = usePivotStore((s) => s.setSort);
  const activeView = usePivotStore((s) => s.activeView);
  const secondaryDisplayMode = usePivotStore((s) => s.secondaryDisplayMode);
  const chartConfig = usePivotStore((s) => s.chartConfig);
  const openChartDialog = usePivotStore((s) => s.openChartDialog);
  const setSecondaryDisplayMode = usePivotStore((s) => s.setSecondaryDisplayMode);
  const sheetModeEnabled = usePivotSheetModeEnabled();
  const mainView = usePivotStore((s) => s.mainView);
  const setMainView = usePivotStore((s) => s.setMainView);
  const sheetLayout = usePivotStore((s) => s.sheetLayout);
  const setSheetLayout = usePivotStore((s) => s.setSheetLayout);

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
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
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
  useClickOutside('.layout-menu-container', () => setShowLayoutMenu(false));

  const handleExportData = () => {
    if (cubeResults && cubeResults.length > 0) {
      exportDataCSV({ cubeResults }, config, locale, dtypes, dialect);
      setShowExportMenu(false);
      setExportError('');
    } else {
      setExportError('No data to export');
    }
  };

  const handleExportLayout = () => {
    if (data && config) {
      exportPivotCSV(data, config, locale, dtypes, dialect, sheetLayout);
      setShowExportMenu(false);
    }
  };

  const separator = <div style={{ width: '1px', height: '16px', background: 'var(--border-color-light)', margin: '0 var(--space-1)' }} />;
  const menuAnchor: React.CSSProperties = { position: 'absolute', top: '100%', left: 0, marginTop: 'var(--space-1)', zIndex: 'var(--z-dropdown)' as any };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: '40px',
      padding: '0 var(--space-2)',
      background: 'var(--surface-bg)',
      borderBottom: 'var(--border-width, 1px) solid var(--border-color-medium)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div className="sort-menu-container" style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setShowSortMenu(!showSortMenu);
              setShowExportMenu(false);
            }}
            className="pp-btn pp-btn--quiet pp-btn--sm"
            aria-expanded={showSortMenu}
            title="Sort rows"
            aria-label="Sort rows"
          >
            Sort
            <Icon name="sort" />
          </button>
          {showSortMenu && (
            <div style={menuAnchor}>
              <SortMenu data={data} config={config} sortConfig={sortConfig} onSortChange={setSortConfig} />
            </div>
          )}
        </div>

        {separator}

        <div className="export-menu-container" style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setShowExportMenu(!showExportMenu);
              setShowSortMenu(false);
            }}
            className="pp-btn pp-btn--quiet pp-btn--sm"
            aria-expanded={showExportMenu}
            title="Export CSV"
            aria-label="Export CSV"
          >
            Export
            <Icon name="download" />
          </button>
          {showExportMenu && (
            <div className="pp-menu" role="menu" style={{ ...menuAnchor, minWidth: '200px' }}>
              <div className="pp-menu-title">Export CSV</div>
              {exportError && (
                <div style={{ padding: 'var(--space-1) var(--space-3)' }}>
                  <ErrorBanner message={exportError} onDismiss={() => setExportError('')} style={{ padding: '4px 6px', fontSize: 'var(--text-xs)' }} />
                </div>
              )}
              <button role="menuitem" onClick={handleExportData} className="pp-menu-item">
                <Icon name="list" />
                Raw Results
              </button>
              <button role="menuitem" onClick={handleExportLayout} className="pp-menu-item">
                <Icon name="table" />
                Visual Layout
              </button>
            </div>
          )}
        </div>

        {separator}

        <div className="chart-mode-menu-container" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <button
            onClick={openChartDialog}
            className="pp-btn pp-btn--quiet pp-btn--sm"
            title="Create chart"
            aria-label="Create chart"
          >
            Chart
            <Icon name="chart-bar" />
          </button>
          {hasChart && (
            <>
              <button
                onClick={() => {
                  setShowChartModeMenu(!showChartModeMenu);
                  setShowSortMenu(false);
                  setShowExportMenu(false);
                }}
                className="pp-icon-btn"
                aria-expanded={showChartModeMenu}
                title="Chart display mode"
                aria-label="Chart display mode"
              >
                <Icon name="panels" />
              </button>
              {showChartModeMenu && (
                <div className="pp-menu" role="menu" style={{ ...menuAnchor, left: 'auto', right: 0, minWidth: '200px' }}>
                  <div className="pp-menu-title">Display Mode</div>
                  {displayModes.map(mode => (
                    <button
                      key={mode.value}
                      role="menuitemradio"
                      aria-checked={chartDisplayMode === mode.value}
                      onClick={() => {
                        setSecondaryDisplayMode(mode.value);
                        setShowChartModeMenu(false);
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
            </>
          )}
        </div>

        {onOpenSQL && (
          <>
            {separator}
            <button
              onClick={onOpenSQL}
              className="pp-btn pp-btn--quiet pp-btn--sm"
              title="SQL Playground"
              aria-label="SQL Playground"
            >
              SQL
              <Icon name="terminal" />
            </button>
          </>
        )}

        {sheetModeEnabled && (
          <>
            {separator}
            <div role="group" aria-label="Show as" style={{ display: 'flex' }}>
              {(['table', 'sheet'] as const).map(view => (
                <button
                  key={view}
                  onClick={() => setMainView(view)}
                  className="pp-btn pp-btn--quiet pp-btn--sm"
                  aria-pressed={mainView === view}
                  title={view === 'table' ? 'Show as pivot table' : 'Show as spreadsheet: the result read-only, your own cells and formulas next to it'}
                  style={mainView === view ? { color: 'var(--color-accent)', fontWeight: 600 } : undefined}
                >
                  {view === 'table' ? 'Table' : 'Sheet'}
                  <Icon name={view === 'table' ? 'table' : 'hash'} />
                </button>
              ))}
            </div>
            {mainView === 'sheet' && (
              <div className="layout-menu-container" style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowLayoutMenu(!showLayoutMenu)}
                  className="pp-btn pp-btn--quiet pp-btn--sm"
                  aria-expanded={showLayoutMenu}
                  title="Report layout of the row labels"
                  aria-label="Report layout"
                >
                  Layout
                  <Icon name="columns" />
                </button>
                {showLayoutMenu && (
                  <div className="pp-menu" role="menu" style={{ ...menuAnchor, minWidth: '220px' }}>
                    <div className="pp-menu-title">Report Layout</div>
                    {layoutForms.map(option => (
                      <button
                        key={option.form}
                        role="menuitemradio"
                        aria-checked={sheetLayout.form === option.form}
                        onClick={() => setSheetLayout(withForm(sheetLayout, option.form))}
                        className="pp-menu-item"
                        style={{ height: 'auto', padding: '6px var(--space-3)' }}
                      >
                        <span style={{ visibility: sheetLayout.form === option.form ? 'visible' : 'hidden' }}><Icon name="check" /></span>
                        <span>
                          <span style={{ display: 'block' }}>{option.label}</span>
                          <span className="pp-hint" style={{ display: 'block' }}>{option.desc}</span>
                        </span>
                      </button>
                    ))}
                    <button
                      role="menuitemcheckbox"
                      aria-checked={sheetLayout.form !== 'compact' && sheetLayout.repeatLabels}
                      disabled={sheetLayout.form === 'compact'}
                      onClick={() => {
                        if (sheetLayout.form !== 'compact') setSheetLayout({ ...sheetLayout, repeatLabels: !sheetLayout.repeatLabels });
                      }}
                      className="pp-menu-item"
                      title={sheetLayout.form === 'compact' ? 'Only in Outline and Tabular' : 'Write every parent\'s label on each row'}
                      style={{ borderTop: '1px solid var(--border-color-light)' }}
                    >
                      <span style={{ visibility: sheetLayout.form !== 'compact' && sheetLayout.repeatLabels ? 'visible' : 'hidden' }}><Icon name="check" /></span>
                      Repeat item labels
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <a
          href="https://github.com/pjoachims/pivot-parrot"
          target="_blank"
          rel="noopener noreferrer"
          title="Pivot Parrot on GitHub"
          className="pp-brand-link"
          style={{
            fontSize: 'var(--text-sm)',
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
        <button
          onClick={toggleTheme}
          className="pp-icon-btn"
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
      </div>
    </div>
  );
}
