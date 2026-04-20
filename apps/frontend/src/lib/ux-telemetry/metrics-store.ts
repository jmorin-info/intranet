/**
 * UX Metrics Store — In-Memory Session Aggregator
 *
 * Ring buffer of raw events + per-module aggregated metrics.
 * No persistence. Resets on page reload.
 */

import type { TelemetryEvent, TelemetryModule, ModuleMetrics, TelemetrySnapshot } from './types';

const MAX_EVENTS = 50;
const SLOW_THRESHOLD_MS = 5_000;

function emptyModuleMetrics(module: TelemetryModule): ModuleMetrics {
  return {
    module,
    totalActions: 0,
    avgTimeToAction: 0,
    rollbackCount: 0,
    navigationLoops: 0,
    slowFlowCount: 0,
    maxBurstSize: 0,
    topAction: '',
    updatedAt: 0,
  };
}

class MetricsStore {
  private events: TelemetryEvent[] = [];
  private sessionStart = Date.now();
  private modules: Record<TelemetryModule, ModuleMetrics> = {
    TICKETS: emptyModuleMetrics('TICKETS'),
    DOCUMENTS: emptyModuleMetrics('DOCUMENTS'),
    INCIDENTS: emptyModuleMetrics('INCIDENTS'),
    DASHBOARD: emptyModuleMetrics('DASHBOARD'),
  };

  /** Record a telemetry event and recompute module metrics */
  record(event: TelemetryEvent): void {
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.shift();
    this.recomputeModule(event.module);
  }

  /** Get a read-only snapshot of all metrics */
  getSnapshot(): TelemetrySnapshot {
    return {
      sessionStart: this.sessionStart,
      totalEvents: this.events.length,
      modules: { ...this.modules },
    };
  }

  /** Get metrics for a specific module */
  getModuleMetrics(module: TelemetryModule): ModuleMetrics {
    return this.modules[module];
  }

  /** Get raw events (for debugging / command center) */
  getRecentEvents(module?: TelemetryModule): TelemetryEvent[] {
    if (module) return this.events.filter(e => e.module === module);
    return [...this.events];
  }

  /** Reset everything */
  reset(): void {
    this.events = [];
    this.sessionStart = Date.now();
    this.modules = {
      TICKETS: emptyModuleMetrics('TICKETS'),
      DOCUMENTS: emptyModuleMetrics('DOCUMENTS'),
      INCIDENTS: emptyModuleMetrics('INCIDENTS'),
      DASHBOARD: emptyModuleMetrics('DASHBOARD'),
    };
  }

  // ── Private: recompute module metrics from raw events ──────────

  private recomputeModule(module: TelemetryModule): void {
    const moduleEvents = this.events.filter(e => e.module === module);
    if (moduleEvents.length === 0) return;

    const totalActions = moduleEvents.length;

    // Average time-to-action
    const times = moduleEvents.map(e => e.timeSincePrevious).filter(t => t > 0);
    const avgTimeToAction = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;

    // Rollback count
    const rollbackCount = moduleEvents.filter(e => e.action === 'ROLLBACK').length;

    // Navigation loops: count rapid NAVIGATE events (within 3s of each other)
    let navigationLoops = 0;
    for (let i = 1; i < moduleEvents.length; i++) {
      if (moduleEvents[i]!.action === 'NAVIGATE' && moduleEvents[i - 1]!.action === 'NAVIGATE') {
        if (moduleEvents[i]!.timeSincePrevious < 3_000) navigationLoops++;
      }
    }

    // Slow flows
    const slowFlowCount = moduleEvents.filter(e => e.timeSincePrevious > SLOW_THRESHOLD_MS).length;

    // Max burst
    const maxBurstSize = Math.max(...moduleEvents.map(e => e.burstCount), 0);

    // Top action
    const actionCounts: Record<string, number> = {};
    for (const e of moduleEvents) {
      actionCounts[e.action] = (actionCounts[e.action] || 0) + 1;
    }
    const topAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

    this.modules[module] = {
      module,
      totalActions,
      avgTimeToAction: Math.round(avgTimeToAction),
      rollbackCount,
      navigationLoops,
      slowFlowCount,
      maxBurstSize,
      topAction,
      updatedAt: Date.now(),
    };
  }
}

/** Singleton metrics store */
export const metricsStore = new MetricsStore();
