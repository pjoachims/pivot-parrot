import React from 'react';
import { styles } from './styles';

/**
 * Help content sections for custom metric formula editor
 */
export function HelpContent({ showHelp, availableMetrics, formula, setFormula, setShowHelp }) {
  if (!showHelp) return null;

  if (showHelp === 'explanation') {
    return (
      <div style={styles.helpContent}>
        <div style={styles.helpText}>
          Use SQL aggregations: <code style={styles.helpCode}>SUM</code>, <code style={styles.helpCode}>AVG</code>, <code style={styles.helpCode}>COUNT</code>, <code style={styles.helpCode}>MIN</code>, <code style={styles.helpCode}>MAX</code>
        </div>
        <div style={styles.helpText}>
          Reference other metrics: <code style={styles.helpCode}>{'{{ Metric Name }}'}</code>
        </div>
      </div>
    );
  }

  if (showHelp === 'examples') {
    return (
      <div style={styles.helpContent}>
        <div style={styles.helpExample}>
          <code style={styles.helpCode}>SUM(sales) / SUM(quantity)</code>
          <span style={styles.helpExampleDesc}>Average price</span>
        </div>
        <div style={styles.helpExample}>
          <code style={styles.helpCode}>SUM(profit) / SUM(sales) * 100</code>
          <span style={styles.helpExampleDesc}>Profit margin %</span>
        </div>
        <div style={styles.helpExample}>
          <code style={styles.helpCode}>COUNT(DISTINCT customer)</code>
          <span style={styles.helpExampleDesc}>Unique customers</span>
        </div>
        <div style={{...styles.helpExample, marginTop: '4px', paddingTop: '4px', borderTop: '1px solid var(--border-color-light)'}}>
          <code style={styles.helpCode}>{'{{ Total Sales }} / {{ Total Qty }}'}</code>
          <span style={styles.helpExampleDesc}>Use existing metrics</span>
        </div>
      </div>
    );
  }

  if (showHelp === 'metrics' && availableMetrics.length > 0) {
    return (
      <div style={styles.helpContent}>
        <div style={styles.helpText}>Click to insert:</div>
        <div style={styles.metricsGrid}>
          {availableMetrics.map(m => (
            <button
              key={m.name}
              type="button"
              onClick={() => {
                setFormula(formula + `{{ ${m.name} }}`);
                setShowHelp(null);
              }}
              style={styles.metricButton}
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

/**
 * Help buttons for toggling help sections
 */
export function HelpButtons({ showHelp, setShowHelp, availableMetrics }) {
  return (
    <div style={styles.helpButtons}>
      <button
        type="button"
        onClick={() => setShowHelp(showHelp === 'explanation' ? null : 'explanation')}
        style={{...styles.helpButton, ...(showHelp === 'explanation' ? styles.helpButtonActive : {})}}
        title="Formula syntax"
      >
        <svg style={styles.helpIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Syntax
      </button>
      <button
        type="button"
        onClick={() => setShowHelp(showHelp === 'examples' ? null : 'examples')}
        style={{...styles.helpButton, ...(showHelp === 'examples' ? styles.helpButtonActive : {})}}
        title="Formula examples"
      >
        <svg style={styles.helpIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        Examples
      </button>
      {availableMetrics.length > 0 && (
        <button
          type="button"
          onClick={() => setShowHelp(showHelp === 'metrics' ? null : 'metrics')}
          style={{...styles.helpButton, ...(showHelp === 'metrics' ? styles.helpButtonActive : {})}}
          title="Available metrics"
        >
          <svg style={styles.helpIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
          Metrics
        </button>
      )}
    </div>
  );
}
