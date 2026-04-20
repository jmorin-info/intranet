/**
 * Priority Resolver — Enforces strict action hierarchy.
 *
 * Rules:
 *  1. CRITICAL > HIGH > MEDIUM > LOW
 *  2. Only 1 action per target per governance cycle
 *  3. Highest priority wins
 *  4. Ties → latest timestamp wins
 */

import type { UIGovernedAction } from './types';
import { PRIORITY_WEIGHT } from './types';

/**
 * Resolve priority conflicts: for each target, keep only the
 * highest-priority action. Tiebreaker = latest timestamp.
 *
 * @returns Deduplicated list of actions (1 per target, sorted by priority desc).
 */
export function resolvePriority(actions: UIGovernedAction[]): UIGovernedAction[] {
  const byTarget = new Map<string, UIGovernedAction>();

  for (const action of actions) {
    const existing = byTarget.get(action.target);
    if (!existing) {
      byTarget.set(action.target, action);
      continue;
    }

    const existingWeight = PRIORITY_WEIGHT[existing.priority];
    const newWeight = PRIORITY_WEIGHT[action.priority];

    if (newWeight > existingWeight) {
      byTarget.set(action.target, action);
    } else if (newWeight === existingWeight && action.timestamp > existing.timestamp) {
      byTarget.set(action.target, action);
    }
    // else: existing wins, do nothing
  }

  return Array.from(byTarget.values())
    .sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);
}
