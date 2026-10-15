import React from 'react';
import { Icon, type IconName } from '../../../shared/Icon';

const panel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  padding: 'var(--space-2)',
  background: 'var(--surface-subtle)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--text-sm)',
  lineHeight: 1.5,
  color: 'var(--text-secondary)'
};

const code: React.CSSProperties = {
  padding: '0 4px',
  background: 'var(--surface-hover)',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
  color: 'var(--text-primary)'
};

const exampleRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 'var(--space-3)'
};

/**
 * Help content sections for custom metric formula editor
 */
export function HelpContent({ showHelp, availableMetrics, formula, setFormula, setShowHelp }) {
  if (!showHelp) return null;

  if (showHelp === 'explanation') {
    return (
      <div style={panel}>
        <div>
          Use SQL aggregations: <code style={code}>SUM</code> <code style={code}>AVG</code> <code style={code}>COUNT</code> <code style={code}>MIN</code> <code style={code}>MAX</code>
        </div>
        <div>
          Reference other metrics: <code style={code}>{'{{ Metric Name }}'}</code>
        </div>
      </div>
    );
  }

  if (showHelp === 'examples') {
    const examples = [
      ['SUM(sales) / SUM(quantity)', 'Average price'],
      ['SUM(profit) / SUM(sales) * 100', 'Profit margin %'],
      ['COUNT(DISTINCT customer)', 'Unique customers'],
      ['{{ Total Sales }} / {{ Total Qty }}', 'Use existing metrics']
    ];
    return (
      <div style={panel}>
        {examples.map(([expr, desc]) => (
          <div key={expr} style={exampleRow}>
            <code style={code}>{expr}</code>
            <span className="pp-hint" style={{ whiteSpace: 'nowrap' }}>{desc}</span>
          </div>
        ))}
      </div>
    );
  }

  if (showHelp === 'metrics' && availableMetrics.length > 0) {
    return (
      <div style={panel}>
        <div className="pp-hint">Click to insert:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
          {availableMetrics.map(m => (
            <button
              key={m.name}
              type="button"
              onClick={() => {
                setFormula(formula + `{{ ${m.name} }}`);
                setShowHelp(null);
              }}
              className="pp-btn pp-btn--sm"
              title="Click to insert"
            >
              {m.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

const HELP_TOGGLES: Array<{ key: string; label: string; title: string; icon: IconName }> = [
  { key: 'explanation', label: 'Syntax', title: 'Formula syntax', icon: 'info' },
  { key: 'examples', label: 'Examples', title: 'Formula examples', icon: 'list' },
  { key: 'metrics', label: 'Metrics', title: 'Available metrics', icon: 'braces' }
];

/**
 * Help buttons for toggling help sections
 */
export function HelpButtons({ showHelp, setShowHelp, availableMetrics }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
      {HELP_TOGGLES
        .filter(t => t.key !== 'metrics' || availableMetrics.length > 0)
        .map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setShowHelp(showHelp === t.key ? null : t.key)}
            aria-pressed={showHelp === t.key}
            className="pp-btn pp-btn--sm"
            title={t.title}
          >
            <Icon name={t.icon} />
            {t.label}
          </button>
        ))}
    </div>
  );
}
