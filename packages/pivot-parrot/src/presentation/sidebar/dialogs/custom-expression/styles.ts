/**
 * Content styles for CustomExpressionDialog's body (rendered inside BaseDialog).
 * The dialog chrome itself (overlay/header/footer/buttons) now comes from BaseDialog.
 */

export const styles: Record<string, React.CSSProperties> = {
  field: {
    marginBottom: '8px'
  },
  label: {
    display: 'block',
    fontSize: 'var(--text-xs)',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    marginBottom: '3px'
  },
  input: {
    width: '100%',
    padding: '4px 6px',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    fontFamily: 'inherit'
  },
  textarea: {
    width: '100%',
    padding: '4px 6px',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
    resize: 'vertical'
  },
  helpButtons: {
    display: 'flex',
    gap: '4px',
    marginTop: '4px'
  },
  helpButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '3px 6px',
    border: '1px solid var(--border-color-light)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--surface-bg)',
    color: 'var(--text-muted)',
    fontSize: '9px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  },
  helpButtonActive: {
    background: 'var(--color-accent-subtle)',
    borderColor: 'var(--color-accent)',
    color: 'var(--color-accent)'
  },
  helpIcon: {
    width: '12px',
    height: '12px'
  },
  helpContent: {
    marginTop: '4px',
    padding: '6px',
    background: 'var(--surface-subtle)',
    border: '1px solid var(--border-color-light)',
    borderRadius: 'var(--radius-sm)',
    fontSize: '9px'
  },
  helpText: {
    color: 'var(--text-muted)',
    marginBottom: '3px',
    lineHeight: 1.4
  },
  helpCode: {
    background: 'var(--border-color-light)',
    padding: '1px 3px',
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
    fontSize: '9px'
  },
  helpExample: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '3px',
    gap: '6px'
  },
  helpExampleDesc: {
    color: 'var(--text-muted)',
    fontSize: 'var(--text-xs)',
    whiteSpace: 'nowrap'
  },
  metricsGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '3px',
    marginTop: '3px'
  },
  metricButton: {
    padding: '2px 5px',
    background: 'var(--color-accent-chip-bg)',
    border: '1px solid var(--color-accent-chip-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--color-accent-chip-text)',
    fontSize: '9px',
    cursor: 'pointer',
    fontWeight: 500,
    transition: 'all 0.15s ease'
  },
  select: {
    width: '100%',
    padding: '4px 6px',
    border: '1px solid var(--border-color-medium)',
    borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)',
    fontFamily: 'inherit',
    backgroundColor: 'var(--surface-bg)',
    cursor: 'pointer'
  },
  formatSection: {
    marginBottom: '8px',
    padding: '8px',
    background: 'var(--surface-subtle)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-color-light)'
  },
  formatLabel: {
    fontSize: 'var(--text-xs)',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '4px'
  },
  formatRow: {
    display: 'flex',
    gap: '4px',
    marginBottom: '4px'
  },
  formatPreview: {
    fontSize: '9px',
    color: 'var(--text-muted)',
    padding: '3px 5px',
    background: 'var(--surface-bg)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-color-light)',
    fontFamily: 'ui-monospace, Menlo, Consolas, monospace'
  },
  error: {
    background: 'var(--color-error-bg)',
    border: '1px solid var(--color-error-border)',
    borderRadius: 'var(--radius-sm)',
    padding: '5px 8px',
    fontSize: 'var(--text-xs)',
    color: 'var(--color-error)',
    marginBottom: '8px'
  }
};
