/**
 * Event System — Public API
 *
 * Usage:
 *   import { eventBus, createEvent, useEventSubscription } from '@/lib/events';
 */

export { eventBus } from './event-bus';
export { createEvent } from './types';
export type { UIEvent, UIEventType, UIEntity, UIEventMetadata } from './types';
export { useEventSubscription, useEntityEvents } from './use-event-subscription';
