import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Error boundary to catch React errors and prevent full app crash
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(_error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({
      error,
      errorInfo
    });
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div style={styles.errorContainer}>
          <div style={styles.errorIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>
          <h2 style={styles.errorTitle}>Something went wrong</h2>
          <p style={styles.errorMessage}>
            {this.state.error && this.state.error.toString()}
          </p>
          <button
            style={styles.resetButton}
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
          >
            Try Again
          </button>
          {this.state.errorInfo && (
            <details style={styles.errorDetails}>
              <summary style={styles.errorSummary}>Stack trace</summary>
              <pre style={styles.errorStack}>
                {this.state.errorInfo.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  errorContainer: {
    padding: '2rem',
    textAlign: 'center' as const,
    background: 'var(--surface-bg)',
    border: '1px solid var(--color-error-border)',
    borderRadius: '8px',
    margin: '1rem'
  },
  errorIcon: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '1rem',
    color: 'var(--color-error)'
  },
  errorTitle: {
    color: 'var(--color-error)',
    marginBottom: '0.5rem'
  },
  errorMessage: {
    color: 'var(--text-muted)',
    marginBottom: '1rem'
  },
  resetButton: {
    padding: '0.5rem 1rem',
    background: 'var(--color-accent)',
    color: 'var(--text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '1rem'
  },
  errorDetails: {
    marginTop: '1rem',
    textAlign: 'left' as const
  },
  errorSummary: {
    cursor: 'pointer',
    color: 'var(--text-muted)',
    marginBottom: '0.5rem'
  },
  errorStack: {
    background: 'var(--surface-subtle)',
    padding: '1rem',
    borderRadius: '4px',
    overflow: 'auto',
    fontSize: '0.875rem',
    color: 'var(--text-secondary)'
  }
};

export default ErrorBoundary;
