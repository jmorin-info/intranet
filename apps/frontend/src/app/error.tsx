'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Send to observability layer (Sentry-ready)
    try {
      const { captureError } = require('@/lib/observability');
      captureError(error, { severity: 'error', metadata: { digest: error?.digest } });
    } catch {
      // Fallback to console
      if (process.env.NODE_ENV === 'development') {
        console.error('Application error:', error);
      } else {
        console.error('Application error:', error?.digest || 'no-digest');
      }
    }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-red-50/50 via-white to-[#004469]/5 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 px-6">
      <div className="text-center max-w-md">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 mb-6 ring-4 ring-red-50 dark:ring-red-900/20">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-navy dark:text-white">Une erreur est survenue</h1>
        <p className="mt-3 text-sm text-taupe dark:text-slate-400 leading-relaxed">
          Cette section a rencontré un problème inattendu.
          Essayez de rafraîchir la page ou de revenir au tableau de bord.
        </p>
        {error.message && (
          <p className="mt-2 text-xs text-red-400 dark:text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 font-mono">
            {error.message.substring(0, 120)}
          </p>
        )}
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={reset}
            aria-label="Réessayer le chargement de la page"
            className="inline-flex items-center gap-2 rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white hover:bg-navy/90 transition-all hover:shadow-lg hover:-translate-y-0.5"
          >
            Réessayer
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-3 text-sm font-semibold text-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-700 transition-all"
          >
            Tableau de bord
          </Link>
        </div>
      </div>
    </div>
  );
}
