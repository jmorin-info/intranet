/**
 * UX Telemetry — Type Definitions
 *
 * Tracks interaction quality metrics per module per session.
 * No persistence, no backend — pure in-memory observation.
 */

export type TelemetryModule = 'TICKETS' | 'DOCUMENTS' | 'INCIDENTS' | 'DASHBOARD';

/** A single tracked interaction event */
export interface TelemetryEvent {
  id: string;
  timestamp: number;
  module: TelemetryModule;
  /** What the user did */
  action: 'CLICK' | 'STATUS_CHANGE' | 'CREATE' | 'NAVIGATE' | 'SCROLL' | 'ROLLBACK' | 'SEARCH' | 'FILTER';
  /** Entity ID involved (if any) */
  entityId?: string;
  /** Milliseconds since last action (time-to-action) */
  timeSincePrevious: number;
  /** How many actions have happened on the same entity in this burst */
  burstCount: number;
}

/** Aggregated metrics for a single module */
export interface ModuleMetrics {
  module: TelemetryModule;
  /** Total interaction count this session */
  totalActions: number;
  /** Average time between actions (ms) */
  avgTimeToAction: number;
  /** Number of rollback/undo events */
  rollbackCount: number;
  /** Number of rapid navigation switches (context switches) */
  navigationLoops: number;
  /** Actions that took >5s to perform */
  slowFlowCount: number;
  /** Maximum burst (same-entity rapid actions) */
  maxBurstSize: number;
  /** Most common action type */
  topAction: string;
  /** Last updated timestamp */
  updatedAt: number;
}

/** Session-level aggregated telemetry */
export interface TelemetrySnapshot {
  sessionStart: number;
  totalEvents: number;
  modules: Record<TelemetryModule, ModuleMetrics>;
}
