'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card, CardContent, Button } from '@omnitech/ui';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Send to observability layer (Sentry-ready)
    try {
      const { captureError } = require('@/lib/observability');
      captureError(error, {
        component: errorInfo.componentStack?.split('\n')[1]?.trim() || 'unknown',
        severity: 'error',
        metadata: { componentStack: errorInfo.componentStack },
      });
    } catch {
      // Observability not available — log to console as fallback
      console.error('ErrorBoundary caught:', error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex items-center justify-center min-h-[300px] p-6">
          <Card className="max-w-md w-full">
            <CardContent className="py-8 text-center">
              <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-navy dark:text-white mb-2">
                Une erreur est survenue
              </h2>
              <p className="text-sm text-seal-gray-500 dark:text-slate-400 mb-1">
                Cette section a rencontré un problème inattendu.
              </p>
              {this.state.error && (
                <p className="text-xs text-red-500 font-mono mt-2 mb-4 px-4 py-2 bg-red-50 dark:bg-red-900/20 rounded">
                  {this.state.error.message}
                </p>
              )}
              <Button onClick={this.handleRetry} variant="secondary" className="mt-4">
                <RefreshCw className="h-4 w-4" /> Réessayer
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
