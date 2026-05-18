import React from 'react';
import logger from '../utils/logger';

const boundaryLogger = logger.module('ErrorBoundary');

/**
 * Safe City Connect - Global React Error Boundary
 * ========================================
 * Catches render-time errors in any child component tree.
 * Shows a friendly fallback UI instead of a blank white screen.
 * All caught errors are logged via the logger utility.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    boundaryLogger.critical(
      `Uncaught render error: ${error?.message || error}`,
      { stack: errorInfo?.componentStack }
    );
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error, errorInfo } = this.state;
    const isDev = process.env.NODE_ENV === 'development';

    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="max-w-lg w-full">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-red-900/40 border border-red-700/50 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h1 className="text-white font-bold text-lg">Something went wrong</h1>
              <p className="text-gray-400 text-sm">Safe City Connect encountered an unexpected error</p>
            </div>
          </div>

          {/* Error card */}
          <div className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-5 mb-4">
            <p className="text-red-400 font-mono text-sm break-all">
              {error?.message || String(error) || 'An unknown error occurred'}
            </p>

            {/* Dev-only stack trace */}
            {isDev && errorInfo?.componentStack && (
              <details className="mt-4">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-400 transition">
                  Component stack (dev only)
                </summary>
                <pre className="mt-2 text-xs text-gray-600 overflow-auto max-h-40 whitespace-pre-wrap">
                  {errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={this.handleReload}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-xl text-sm transition flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reload Page
            </button>
            <button
              onClick={this.handleGoHome}
              className="flex-1 border border-gray-700 text-gray-300 hover:bg-gray-700 font-semibold py-2.5 rounded-xl text-sm transition"
            >
              Go to Home
            </button>
          </div>

          <p className="text-center text-gray-600 text-xs mt-5">
            This error has been automatically logged. If it persists, contact support.
          </p>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
