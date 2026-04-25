'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import Link from 'next/link';
import { Card, CardContent, Button } from '@omnitech/ui';
import { AlertTriangle, RefreshCw, LifeBuoy } from 'lucide-react';
import { logger } from '@/lib/logger';

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
      // Observability not available — forward to logger fallback.
      logger.error(error, { componentStack: errorInfo.componentStack });
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
              <h2 className="text-lg font-semibold text-seal-navy dark:text-white mb-2">
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
              <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                <Button onClick={this.handleRetry} variant="secondary">
                  <RefreshCw className="h-4 w-4" aria-hidden="true" /> Réessayer
                </Button>
                <Link
                  href="/helpdesk"
                  className="inline-flex items-center gap-1.5 text-xs text-seal-blue dark:text-seal-orange hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded px-2 py-1"
                >
                  <LifeBuoy className="h-3.5 w-3.5" aria-hidden="true" />
                  Contacter le support
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
