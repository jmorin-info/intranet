/**
 * Observability Stack — Frontend telemetry, error tracking, and performance monitoring.
 *
 * Architecture:
 *   ErrorBoundary → captureError() → buffer → flush to /api/telemetry (if available)
 *   PageView → trackNavigation() → usage-tracker (localStorage)
 *   API Call → trackApiCall() → performance metrics (in-memory)
 *
 * Sentry-ready: replace captureError internals with Sentry.captureException when integrated.
 * No external dependencies — pure TypeScript.
 */

// ── Error Tracking ──────────────────────────────────────────────

interface ErrorEvent {
  message: string;
  stack?: string;
  component?: string;
  page?: string;
  userId?: string;
  timestamp: number;
  severity: 'error' | 'warning' | 'info';
  metadata?: Record<string, unknown>;
}

const errorBuffer: ErrorEvent[] = [];
const MAX_BUFFER = 50;

export function captureError(
  error: Error | string,
  context?: { component?: string; page?: string; userId?: string; severity?: 'error' | 'warning' | 'info'; metadata?: Record<string, unknown> },
) {
  const event: ErrorEvent = {
    message: typeof error === 'string' ? error : error.message,
    stack: typeof error === 'string' ? undefined : error.stack,
    component: context?.component,
    page: context?.page || (typeof window !== 'undefined' ? window.location.pathname : undefined),
    userId: context?.userId,
    timestamp: Date.now(),
    severity: context?.severity || 'error',
    metadata: context?.metadata,
  };

  errorBuffer.push(event);
  if (errorBuffer.length > MAX_BUFFER) errorBuffer.shift();

  // Forward to Sentry if it has been initialised (NEXT_PUBLIC_SENTRY_DSN set).
  // Lazy require so the bundle only pulls @sentry/nextjs at runtime when
  // observability code actually fires.
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const SentryMod = require('@sentry/nextjs');
      const err = typeof error === 'string' ? new Error(error) : error;
      SentryMod.withScope((scope: { setTag: (k: string, v: string) => void; setContext: (k: string, v: unknown) => void; setLevel: (l: string) => void }) => {
        if (context?.component) scope.setTag('component', context.component);
        if (context?.page) scope.setTag('page', context.page);
        if (context?.userId) scope.setTag('user_id', context.userId);
        scope.setLevel(context?.severity || 'error');
        if (context?.metadata) scope.setContext('metadata', context.metadata);
        SentryMod.captureException(err);
      });
    } catch {
      // Sentry not available — fail silent (telemetry must never break the app).
    }
  }

  // Console in dev for visibility.
  if (process.env.NODE_ENV === 'development') {
    console.error('[OBS]', event.message, event.metadata);
  }
}

export function getErrorBuffer(): readonly ErrorEvent[] {
  return errorBuffer;
}

// ── API Performance Tracking ────────────────────────────────────

interface ApiMetric {
  endpoint: string;
  method: string;
  status: number;
  durationMs: number;
  timestamp: number;
}

const apiMetrics: ApiMetric[] = [];
const MAX_API_METRICS = 200;

export function trackApiCall(metric: Omit<ApiMetric, 'timestamp'>) {
  apiMetrics.push({ ...metric, timestamp: Date.now() });
  if (apiMetrics.length > MAX_API_METRICS) apiMetrics.shift();
}

export function getApiMetrics(): readonly ApiMetric[] {
  return apiMetrics;
}

export function getApiSummary(): {
  totalCalls: number;
  avgLatencyMs: number;
  errorRate: number;
  slowestEndpoints: Array<{ endpoint: string; avgMs: number }>;
} {
  if (apiMetrics.length === 0) {
    return { totalCalls: 0, avgLatencyMs: 0, errorRate: 0, slowestEndpoints: [] };
  }

  const total = apiMetrics.length;
  const avgLatency = apiMetrics.reduce((sum, m) => sum + m.durationMs, 0) / total;
  const errors = apiMetrics.filter(m => m.status >= 400).length;

  // Group by endpoint, compute avg latency
  const byEndpoint = new Map<string, number[]>();
  for (const m of apiMetrics) {
    const key = `${m.method} ${m.endpoint}`;
    if (!byEndpoint.has(key)) byEndpoint.set(key, []);
    byEndpoint.get(key)!.push(m.durationMs);
  }

  const slowest = [...byEndpoint.entries()]
    .map(([endpoint, durations]) => ({
      endpoint,
      avgMs: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
    }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 5);

  return {
    totalCalls: total,
    avgLatencyMs: Math.round(avgLatency),
    errorRate: Math.round((errors / total) * 100),
    slowestEndpoints: slowest,
  };
}

// ── Page Performance ────────────────────────────────────────────

interface PageLoadMetric {
  path: string;
  loadTimeMs: number;
  timestamp: number;
}

const pageMetrics: PageLoadMetric[] = [];

export function trackPageLoad(path: string, loadTimeMs: number) {
  pageMetrics.push({ path, loadTimeMs, timestamp: Date.now() });
  if (pageMetrics.length > 100) pageMetrics.shift();
}

export function getPagePerformance(): Array<{ path: string; avgLoadMs: number; visits: number }> {
  const byPath = new Map<string, number[]>();
  for (const m of pageMetrics) {
    if (!byPath.has(m.path)) byPath.set(m.path, []);
    byPath.get(m.path)!.push(m.loadTimeMs);
  }
  return [...byPath.entries()]
    .map(([path, times]) => ({
      path,
      avgLoadMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      visits: times.length,
    }))
    .sort((a, b) => b.visits - a.visits);
}

// ── Web Vitals (lightweight) ────────────────────────────────────

export function initWebVitals() {
  if (typeof window === 'undefined') return;

  // Track page navigation timing
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.entryType === 'navigation') {
        const nav = entry as PerformanceNavigationTiming;
        trackPageLoad(window.location.pathname, Math.round(nav.loadEventEnd - nav.startTime));
      }
    }
  });

  try {
    observer.observe({ type: 'navigation', buffered: true });
  } catch {
    // PerformanceObserver not supported
  }
}
