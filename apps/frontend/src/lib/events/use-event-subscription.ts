'use client';

import { useEffect, useRef } from 'react';
import { eventBus } from './event-bus';
import type { UIEvent, UIEventType, UIEntity } from './types';

/**
 * React hook to subscribe to the global event bus.
 * Auto-unsubscribes on unmount — no memory leaks.
 *
 * @param channel - Event channel to subscribe to:
 *   - "*" — all events
 *   - UIEventType (e.g. "CREATED")
 *   - UIEntity (e.g. "TICKET")
 *   - "TICKET:STATUS_CHANGED" — entity+type combo
 * @param handler - Callback. Uses a ref internally so the handler
 *   always sees fresh closure values without causing re-subscriptions.
 */
export function useEventSubscription(
  channel: '*' | UIEventType | UIEntity | `${UIEntity}:${UIEventType}`,
  handler: (event: UIEvent) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const unsubscribe = eventBus.on(channel, (event) => {
      handlerRef.current(event);
    });
    return unsubscribe;
  }, [channel]);
}

/**
 * Subscribe to all events for a specific entity type.
 * Convenience wrapper over useEventSubscription.
 */
export function useEntityEvents(
  entity: UIEntity,
  handler: (event: UIEvent) => void,
): void {
  useEventSubscription(entity, handler);
}
