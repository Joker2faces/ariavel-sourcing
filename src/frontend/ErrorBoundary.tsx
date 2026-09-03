import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
  errorId: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '', errorId: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error.message ?? 'An unexpected error occurred.',
      errorId: Math.random().toString(36).slice(2, 10),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(JSON.stringify({
      level: 'error',
      msg: 'React error boundary caught',
      error: error.message,
      stack: error.stack?.slice(0, 500),
      componentStack: info.componentStack?.slice(0, 500),
    }));
  }

  handleReset = (): void => {
    this.setState({ hasError: false, errorMessage: '', errorId: '' });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="error-boundary-page" role="alert">
          <div className="error-boundary-card">
            <h2>Something went wrong</h2>
            <p className="error-boundary-msg">{this.state.errorMessage}</p>
            <p className="error-boundary-id">Error ID: <code>{this.state.errorId}</code></p>
            <div className="error-boundary-actions">
              <button className="primary-button" onClick={this.handleReset}>Try again</button>
              <button className="secondary-button" onClick={() => window.location.reload()}>Reload page</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
