/**
 * Global UI Event Bus — Zero-dependency emitter using native EventTarget.
 *
 * Singleton pattern: one bus per browser tab.
 * All modules emit events here; all consumers subscribe here.
 *
 * No external dependencies (no mitt, no rxjs).
 * Uses CustomEvent + EventTarget which are available in all modern browsers.
 */

import type { UIEvent, UIEventType, UIEntity } from './types';

type EventHandler = (event: UIEvent) => void;

class UIEventBus {
  private target = new EventTarget();

  /** Recent events ring buffer for late subscribers (max 50) */
  private recentEvents: UIEvent[] = [];
  private static MAX_RECENT = 50;

  /** Emit an event to all subscribers */
  emit(event: UIEvent): void {
    // Store in ring buffer
    this.recentEvents.push(event);
    if (this.recentEvents.length > UIEventBus.MAX_RECENT) {
      this.recentEvents.shift();
    }

    // Dispatch to wildcard listeners
    this.target.dispatchEvent(
      new CustomEvent('*', { detail: event }),
    );

    // Dispatch to type-specific listeners (e.g. "STATUS_CHANGED")
    this.target.dispatchEvent(
      new CustomEvent(event.type, { detail: event }),
    );

    // Dispatch to entity-specific listeners (e.g. "TICKET")
    this.target.dispatchEvent(
      new CustomEvent(event.entity, { detail: event }),
    );

    // Dispatch to entity+type combo (e.g. "TICKET:STATUS_CHANGED")
    this.target.dispatchEvent(
      new CustomEvent(`${event.entity}:${event.type}`, { detail: event }),
    );
  }

  /**
   * Subscribe to events.
   *
   * @param channel - One of:
   *   - "*" — all events
   *   - UIEventType (e.g. "STATUS_CHANGED") — all entities with this type
   *   - UIEntity (e.g. "TICKET") — all events for this entity type
   *   - "TICKET:STATUS_CHANGED" — specific entity+type combo
   * @param handler - Callback receiving the UIEvent
   * @returns Unsubscribe function
   */
  on(channel: string, handler: EventHandler): () => void {
    const listener = (e: Event) => handler((e as CustomEvent<UIEvent>).detail);
    this.target.addEventListener(channel, listener);
    return () => this.target.removeEventListener(channel, listener);
  }

  /** Get recent events (for late-mounting components) */
  getRecent(filter?: { entity?: UIEntity; type?: UIEventType }): UIEvent[] {
    if (!filter) return [...this.recentEvents];
    return this.recentEvents.filter(
      (e) =>
        (!filter.entity || e.entity === filter.entity) &&
        (!filter.type || e.type === filter.type),
    );
  }

  /** Clear all recent events (for testing) */
  clearRecent(): void {
    this.recentEvents = [];
  }
}

/** Singleton event bus instance */
export const eventBus = new UIEventBus();
