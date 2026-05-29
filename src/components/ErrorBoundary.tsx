import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Alert, Button } from '@patternfly/react-core';
import i18n from '../i18n/config';

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
        <Alert variant="danger" isInline title={i18n.t('errorBoundary.title')}>
          <p>{this.state.error.message}</p>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            {i18n.t('errorBoundary.reload')}
          </Button>
        </Alert>
      </div>
    );
  }
}

export default ErrorBoundary;
