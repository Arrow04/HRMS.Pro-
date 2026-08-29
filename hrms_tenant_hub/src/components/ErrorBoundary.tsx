import React, { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: React.ComponentType<{ error: Error; resetError: () => void }>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      return <FallbackComponent error={this.state.error!} resetError={this.resetError} />;
    }

    return this.props.children;
  }
}

const DefaultErrorFallback: React.ComponentType<{ error: Error; resetError: () => void }> = ({
  error,
  resetError,
}) => (
  <div className="fixed inset-0 flex items-center justify-center bg-gray-50 z-50">
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
      <div className="flex items-center mb-4">
        <svg className="w-8 h-8 text-red-500 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Something went wrong!</h2>
          <p className="text-gray-600 mt-1">
            We've been notified about this issue and will fix it shortly.
          </p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <p className="text-sm text-gray-500"><strong>Error:</strong> {error.message}</p>
        {import.meta.env.DEV && (
          <div className="mt-2 text-xs text-gray-400 whitespace-pre-wrap">
            {error.stack}
          </div>
        )}
      </div>
      <div className="mt-6">
        <button
          onClick={resetError}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
        >
          Try Again
        </button>
        <button
          onClick={() => window.location.reload()}
          className="w-full mt-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded transition-colors"
        >
          Reload Page
        </button>
      </div>
    </div>
  </div>
);

export default ErrorBoundary;
