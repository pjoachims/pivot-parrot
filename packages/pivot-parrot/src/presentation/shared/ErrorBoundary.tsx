import React from 'react';
import { Icon } from './Icon';

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
        <div style={styles.container} role="alert">
          <Icon name="alert-triangle" style={styles.icon} />
          <div style={styles.title}>Something went wrong</div>
          <div style={styles.message}>{this.state.error && this.state.error.toString()}</div>
          <button
            className="pp-btn pp-btn--primary"
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
          >
            Try again
          </button>
          {this.state.errorInfo && (
            <details style={styles.details}>
              <summary className="pp-hint" style={{ cursor: 'pointer' }}>Stack trace</summary>
              <pre style={styles.stack}>{this.state.errorInfo.componentStack}</pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--space-2)',
    margin: 'var(--space-4)',
    padding: 'var(--space-4)',
    textAlign: 'center',
    background: 'var(--surface-bg)',
    border: '1px solid var(--color-error-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)',
    fontSize: 'var(--text-md)'
  },
  icon: {
    width: 24,
    height: 24,
    color: 'var(--color-error)'
  },
  title: {
    fontSize: 'var(--text-base)',
    fontWeight: 600
  },
  message: {
    color: 'var(--text-muted)',
    marginBottom: 'var(--space-2)'
  },
  details: {
    alignSelf: 'stretch',
    marginTop: 'var(--space-2)',
    textAlign: 'left'
  },
  stack: {
    margin: 'var(--space-2) 0 0',
    padding: 'var(--space-3)',
    background: 'var(--surface-subtle)',
    border: '1px solid var(--border-color-light)',
    borderRadius: 'var(--radius-sm)',
    overflow: 'auto',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-sm)',
    lineHeight: 1.5,
    color: 'var(--text-secondary)'
  }
};

export default ErrorBoundary;
