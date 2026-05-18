"use client";

/**
 * global-error.tsx — Top-level error boundary for the entire app.
 * Next.js App Router requires this file to catch errors in the root layout.
 * It must include its own <html> and <body> tags since it replaces the root layout.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body className="font-body antialiased bg-white dark:bg-gray-950 flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-6">
            <svg
              className="w-8 h-8 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Une erreur inattendue est survenue
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            L&apos;application a rencontré un problème. Veuillez réessayer.
          </p>
          {error.digest && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4 font-mono">
              Réf : {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F68D2E] text-white hover:bg-[#d97420] transition-colors font-medium"
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
