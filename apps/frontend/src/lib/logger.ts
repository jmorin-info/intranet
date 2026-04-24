/**
 * Centralized frontend logger.
 *
 * In development: forwards to the browser console for DX.
 * In production: console output is suppressed and warnings/errors are
 * forwarded to Sentry (when @sentry/nextjs is configured).
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.error(err, { component: 'Foo' });
 *   logger.warn('something odd', { context });
 *
 * Replace all `console.error/warn/log` in app code with this logger.
 * See docs/observability.md for rationale.
 */
import * as Sentry from '@sentry/nextjs';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.debug(...args);
    }
  },
  info: (...args: unknown[]) => {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.info(...args);
    }
  },
  warn: (msg: string, ctx?: Record<string, unknown>) => {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.warn(msg, ctx);
    }
    try {
      Sentry.captureMessage(msg, { level: 'warning', extra: ctx });
    } catch {
      // Sentry not available — fail silent (telemetry must never break the app).
    }
  },
  error: (err: unknown, ctx?: Record<string, unknown>) => {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.error(err, ctx);
    }
    try {
      Sentry.captureException(err, { extra: ctx });
    } catch {
      // Sentry not available — fail silent.
    }
  },
};
