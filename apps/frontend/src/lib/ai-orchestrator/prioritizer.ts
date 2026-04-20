/**
 * Prioritizer — Ranks and deduplicates UI action plans.
 *
 * Ensures no conflicting actions (e.g. SHOW + HIDE same target).
 */

import type { UIActionPlan } from './types';

/**
 * Deduplicate and rank actions.
 * If conflicting actions target the same component, keep the highest-impact one.
 */
export function prioritize(actions: UIActionPlan[]): UIActionPlan[] {
  const byTarget = new Map<string, UIActionPlan>();

  for (const action of actions) {
    const existing = byTarget.get(action.target);
    if (!existing || action.impactScore > existing.impactScore) {
      byTarget.set(action.target, action);
    }
  }

  return Array.from(byTarget.values())
    .sort((a, b) => b.impactScore - a.impactScore);
}
