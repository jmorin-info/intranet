/**
 * Conflict Resolver — Detects and resolves same-target conflicts.
 *
 * When multiple actions target the same UI element:
 *  - Keep highest priority
 *  - Timestamp tiebreak
 *  - Log conflict for debug
 */

import type { UIGovernedAction, UIConflict } from './types';
import { PRIORITY_WEIGHT } from './types';

/**
 * Group actions by target and resolve conflicts.
 *
 * @returns Object with resolved (winning) actions and a list of conflicts detected.
 */
export function resolveConflicts(actions: UIGovernedAction[]): {
  resolved: UIGovernedAction[];
  conflicts: UIConflict[];
} {
  // Group by target
  const groups = new Map<string, UIGovernedAction[]>();
  for (const action of actions) {
    const list = groups.get(action.target) || [];
    list.push(action);
    groups.set(action.target, list);
  }

  const resolved: UIGovernedAction[] = [];
  const conflicts: UIConflict[] = [];

  for (const [target, group] of groups) {
    if (group.length === 1) {
      resolved.push(group[0]!);
      continue;
    }

    // Multiple actions on same target → conflict
    // Sort by priority desc, then timestamp desc
    const sorted = [...group].sort((a, b) => {
      const wDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
      if (wDiff !== 0) return wDiff;
      return b.timestamp - a.timestamp;
    });

    const winner = sorted[0]!;
    const dropped = sorted.slice(1).map(a => ({
      ...a,
      approved: false,
      rejectionReason: `Conflict on "${target}": outranked by ${winner.source}(${winner.priority})`,
    }));

    resolved.push({ ...winner, approved: true });
    conflicts.push({
      target,
      actions: group,
      winner,
      dropped,
    });
  }

  return { resolved, conflicts };
}
