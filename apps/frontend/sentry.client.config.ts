/**
 * Sentry — Browser config (Next.js client bundle).
 *
 * Opt-in via NEXT_PUBLIC_SENTRY_DSN. If unset, Sentry is not initialised
 * (no network calls, no telemetry, no bundle bloat at runtime).
 *
 * Privacy:
 *   - sendDefaultPii: false (do not auto-attach IP / cookies)
 *   - replaysSessionSampleRate: 0 (no session replay by default —
 *     can be increased via NEXT_PUBLIC_SENTRY_REPLAY_RATE)
 *   - replaysOnErrorSampleRate: 1.0 (capture replay only on error
 *     when Sentry is enabled, useful for debugging)
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn && dsn.trim() !== '') {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    tracesSampleRate: parseFloat(
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || '0.1',
    ),
    replaysSessionSampleRate: parseFloat(
      process.env.NEXT_PUBLIC_SENTRY_REPLAY_RATE || '0',
    ),
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: false,
    // Drop common noise.
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      // Chunk loading errors are handled by ChunkErrorRecovery (auto-reload).
      'ChunkLoadError',
      /Loading chunk \d+ failed/,
    ],
  });
}
