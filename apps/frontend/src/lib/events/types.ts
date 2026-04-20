/**
 * Global UI Event System — Type Definitions
 *
 * Every frontend mutation emits a typed event through the event bus.
 * Consumers (dashboard, lists, detail pages) subscribe to relevant events
 * and update their local state without a full refetch.
 *
 * Future-compatible with: WebSocket push, CRDT sync, offline queue.
 */

export type UIEntity = 'TICKET' | 'DOCUMENT' | 'INCIDENT';

export type UIEventType =
  | 'CREATED'
  | 'UPDATED'
  | 'STATUS_CHANGED'
  | 'ASSIGNED'
  | 'COMMENTED'
  | 'DELETED'
  | 'APPROVED'
  | 'REJECTED'
  | 'ROLLBACK';

export interface UIEventMetadata {
  /** Previous value (for status changes, assignments) */
  from?: string;
  /** New value */
  to?: string;
  /** True when the event represents a local-only optimistic update (not yet confirmed by server) */
  optimistic?: boolean;
  /** User ID who triggered the mutation */
  actorId?: string;
  /** Human-readable label for activity stream */
  label?: string;
}

export interface UIEvent {
  /** Unique event ID (crypto.randomUUID) */
  id: string;
  /** Unix timestamp ms */
  timestamp: number;
  /** What happened */
  type: UIEventType;
  /** Which entity type */
  entity: UIEntity;
  /** Entity primary key */
  entityId: string;
  /** Optional structured metadata */
  metadata?: UIEventMetadata;
}

/** Helper to create a UIEvent with defaults */
export function createEvent(
  type: UIEventType,
  entity: UIEntity,
  entityId: string,
  metadata?: UIEventMetadata,
): UIEvent {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    type,
    entity,
    entityId,
    metadata,
  };
}
