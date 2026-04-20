/**
 * AI UX Event Analyzer — Bridges Phase 7 Event Bus → AI Context Store
 *
 * Consumes all UI events and feeds them into the context store
 * for behavioral pattern detection.
 */

import { eventBus } from '@/lib/events';
import type { UIEvent } from '@/lib/events';
import { aiContext } from './context-store';
import type { TrackedAction } from './types';

/** Map UIEventType to a module name for context-switch tracking */
function entityToModule(entity: string): string {
  switch (entity) {
    case 'TICKET': return 'tickets';
    case 'DOCUMENT': return 'documents';
    case 'INCIDENT': return 'incidents';
    default: return 'unknown';
  }
}

/** Process a single event from the bus */
function processEvent(event: UIEvent): void {
  // Skip optimistic events — only track confirmed actions
  if (event.metadata?.optimistic) return;
  // Skip rollbacks — they undo, not new behavior
  if (event.type === 'ROLLBACK') return;

  const action: TrackedAction = {
    entity: event.entity,
    eventType: event.type,
    entityId: event.entityId,
    timestamp: event.timestamp,
    module: entityToModule(event.entity),
  };

  aiContext.trackAction(action);
  aiContext.setActiveModule(action.module);
}

let initialized = false;

/**
 * Initialize the event analyzer.
 * Subscribes to the global event bus. Call once at app startup.
 * Safe to call multiple times (idempotent).
 */
export function initEventAnalyzer(): void {
  if (initialized) return;
  eventBus.on('*', processEvent);
  initialized = true;
}
