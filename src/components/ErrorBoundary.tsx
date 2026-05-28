import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Alert, Button } from '@patternfly/react-core';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="calendrier-error-state">
        <Alert variant="danger" isInline title="Calendrier could not render">
          <p>{this.state.error.message}</p>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </Alert>
      </div>
    );
  }
}

export default ErrorBoundary;
