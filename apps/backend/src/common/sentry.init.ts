/**
 * Sentry initialization (opt-in via SENTRY_DSN).
 *
 * Centralised so it can be invoked from main.ts BEFORE NestFactory.create
 * and reused by any standalone CLI / worker scripts.
 *
 * If SENTRY_DSN is not set, this is a no-op (cost-free in dev / on-prem).
 */
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

let initialized = false;

export function initSentry(): boolean {
  if (initialized) return true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || dsn.trim() === '') {
    return false;
  }

  try {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE,
      integrations: [nodeProfilingIntegration()],
      // Conservative sampling: 10% of transactions / profiles by default.
      // Override via SENTRY_TRACES_SAMPLE_RATE / SENTRY_PROFILES_SAMPLE_RATE.
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
      profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'),
      // Strip common PII before sending events.
      beforeSend(event) {
        if (event.request) {
          // Drop cookies / authorization headers (ISO 27001 A.5.34)
          if (event.request.headers) {
            delete (event.request.headers as Record<string, unknown>).cookie;
            delete (event.request.headers as Record<string, unknown>).authorization;
            delete (event.request.headers as Record<string, unknown>)['x-api-key'];
          }
          // Drop request bodies (may contain secrets / personal data)
          delete event.request.data;
        }
        return event;
      },
    });
    initialized = true;
    return true;
  } catch (err) {
    // Never crash bootstrap because of telemetry.
    // eslint-disable-next-line no-console
    console.error('[Sentry] init failed (non-fatal):', err);
    return false;
  }
}

export function isSentryEnabled(): boolean {
  return initialized;
}
