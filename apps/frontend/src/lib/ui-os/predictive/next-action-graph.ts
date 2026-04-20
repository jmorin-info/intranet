/**
 * Next Action Graph — Markov-like transition probability calculator.
 *
 * Builds a frequency table of "action A was followed by action B"
 * from the telemetry ring buffer. Uses these frequencies as
 * transition probabilities.
 *
 * No ML — just counting and normalizing.
 */

import { metricsStore } from '@/lib/ux-telemetry';

export interface ActionTransition {
  from: string;
  to: string;
  probability: number;
  count: number;
}

/**
 * Compute transition probabilities from recent telemetry events.
 * @returns Array of transitions sorted by probability (desc).
 */
export function computeTransitions(): ActionTransition[] {
  const events = metricsStore.getRecentEvents();
  if (events.length < 2) return [];

  // Count transitions
  const counts = new Map<string, number>();
  const fromCounts = new Map<string, number>();

  for (let i = 1; i < events.length; i++) {
    const from = `${events[i - 1]!.module}:${events[i - 1]!.action}`;
    const to = `${events[i]!.module}:${events[i]!.action}`;
    const key = `${from}→${to}`;
    counts.set(key, (counts.get(key) || 0) + 1);
    fromCounts.set(from, (fromCounts.get(from) || 0) + 1);
  }

  // Normalize to probabilities
  const transitions: ActionTransition[] = [];
  for (const [key, count] of counts) {
    const [from, to] = key.split('→') as [string, string];
    const total = fromCounts.get(from) || 1;
    transitions.push({
      from,
      to,
      probability: count / total,
      count,
    });
  }

  return transitions.sort((a, b) => b.probability - a.probability);
}

/**
 * Predict the most likely next action given the last action.
 */
export function predictNext(lastAction: string): ActionTransition | null {
  const transitions = computeTransitions();
  return transitions.find(t => t.from === lastAction && t.probability >= 0.3) || null;
}
