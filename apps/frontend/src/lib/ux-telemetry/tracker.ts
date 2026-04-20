/**
 * UX Telemetry Tracker — Event Bus Consumer
 *
 * Subscribes to Phase 7 event bus and converts UI events into
 * telemetry events for the metrics store.
 *
 * Call initTracker() once at app startup.
 */

import { eventBus } from '@/lib/events';
import type { UIEvent } from '@/lib/events';
import { metricsStore } from './metrics-store';
import type { TelemetryEvent, TelemetryModule } from './types';

let lastEventTimestamp = Date.now();
let lastEntityId = '';
let burstCount = 0;
let initialized = false;

function entityToModule(entity: string): TelemetryModule {
  switch (entity) {
    case 'TICKET': return 'TICKETS';
    case 'DOCUMENT': return 'DOCUMENTS';
    case 'INCIDENT': return 'INCIDENTS';
    default: return 'DASHBOARD';
  }
}

function eventTypeToAction(type: string): TelemetryEvent['action'] {
  switch (type) {
    case 'STATUS_CHANGED': return 'STATUS_CHANGE';
    case 'CREATED': return 'CREATE';
    case 'ROLLBACK': return 'ROLLBACK';
    case 'COMMENTED': return 'CLICK';
    case 'ASSIGNED': return 'CLICK';
    case 'APPROVED': return 'STATUS_CHANGE';
    case 'REJECTED': return 'STATUS_CHANGE';
    case 'DELETED': return 'CLICK';
    default: return 'CLICK';
  }
}

function processEvent(event: UIEvent): void {
  // Skip optimistic — only measure confirmed interactions
  if (event.metadata?.optimistic) return;

  const now = event.timestamp;
  const timeSincePrevious = now - lastEventTimestamp;

  // Burst detection: same entity within 10s
  if (event.entityId === lastEntityId && timeSincePrevious < 10_000) {
    burstCount++;
  } else {
    burstCount = 1;
  }

  const telemetryEvent: TelemetryEvent = {
    id: event.id,
    timestamp: now,
    module: entityToModule(event.entity),
    action: eventTypeToAction(event.type),
    entityId: event.entityId,
    timeSincePrevious,
    burstCount,
  };

  metricsStore.record(telemetryEvent);

  lastEventTimestamp = now;
  lastEntityId = event.entityId;
}

/** Initialize the telemetry tracker. Safe to call multiple times. */
export function initTracker(): void {
  if (initialized) return;
  eventBus.on('*', processEvent);
  initialized = true;
}
