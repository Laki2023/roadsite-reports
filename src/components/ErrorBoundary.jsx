import React from 'react';

/**
 * ErrorBoundary — catches rendering errors in child components
 * and shows a friendly fallback UI instead of a white screen.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log to console for debugging
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '2rem',
          maxWidth: 600,
          margin: '4rem auto',
          textAlign: 'center',
          background: 'var(--card-bg, #1e293b)',
          borderRadius: 12,
          border: '1px solid var(--border, #334155)',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ color: 'var(--text, #e2e8f0)', marginBottom: '0.5rem' }}>
            Something went wrong
          </h2>
          <p style={{ color: 'var(--text-muted, #94a3b8)', marginBottom: '1.5rem' }}>
            An unexpected error occurred. You can try again or return to the dashboard.
          </p>
          {this.state.error && (
            <details style={{
              textAlign: 'left',
              background: 'rgba(0,0,0,0.2)',
              borderRadius: 8,
              padding: '0.75rem 1rem',
              marginBottom: '1.5rem',
              color: 'var(--text-muted, #94a3b8)',
              fontSize: '0.85rem',
            }}>
              <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>
                Error details
              </summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '0.6rem 1.5rem',
                borderRadius: 8,
                border: '1px solid var(--border, #334155)',
                background: 'transparent',
                color: 'var(--text, #e2e8f0)',
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => {
                window.location.hash = 'dashboard';
                this.handleReset();
              }}
              style={{
                padding: '0.6rem 1.5rem',
                borderRadius: 8,
                border: 'none',
                background: 'var(--accent, #3b82f6)',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
