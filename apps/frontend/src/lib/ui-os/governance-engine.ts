/**
 * UI OS Governance Engine — Central arbitrator for all UI mutations.
 *
 * Pipeline:
 *   Input actions (from Phase 9, 10, 11)
 *     → Conflict resolution (same-target dedup)
 *       → Priority enforcement (strict hierarchy)
 *         → Stability check (freeze if unstable)
 *           → Safety validation (hard-locked targets)
 *             → Approved actions output
 *
 * No UI mutation reaches the rendering layer without passing through this engine.
 */

import type { UIGovernedAction } from './types';
import { HARD_LOCKED_TARGETS, PRIORITY_WEIGHT } from './types';
import { resolveConflicts } from './conflict-resolver';
import { resolvePriority } from './priority-resolver';
import { stabilityController } from './stability-controller';
import { logConflict, logRejection, logStabilityLock, logPipeline } from './governance-debug';

/** Maximum actions that can be approved per governance cycle */
const MAX_APPROVED_PER_CYCLE = 3;

class UIGovernanceEngine {
  private initialized = false;

  /** Initialize the governance engine (call once at app startup) */
  init(): void {
    if (this.initialized) return;
    stabilityController.init();
    this.initialized = true;
  }

  /**
   * Evaluate a batch of UI actions through the full governance pipeline.
   *
   * @param actions - Raw actions from all AI subsystems
   * @param module - Current active module (for stability scoping)
   * @returns Approved actions (max 3, safe, non-conflicting, priority-ordered)
   */
  evaluate(actions: UIGovernedAction[], module?: string): UIGovernedAction[] {
    if (actions.length === 0) return [];

    const inputCount = actions.length;

    // Step 1: Conflict resolution
    const { resolved, conflicts } = resolveConflicts(actions);
    for (const c of conflicts) logConflict(c);

    // Step 2: Priority enforcement
    const prioritized = resolvePriority(resolved);

    // Step 3: Stability check
    const lock = stabilityController.checkStability(module);
    if (lock.active) logStabilityLock(lock);
    const stable = stabilityController.filterByStability(prioritized, module);

    // Step 4: Safety validation (hard-locked targets)
    const safe = stable.filter(action => {
      // Block any HIDE action on hard-locked targets
      if ((action.type.includes('HIDE') || action.type === 'COLLAPSE') && HARD_LOCKED_TARGETS.has(action.target)) {
        logRejection(action, `Hard-locked target: ${action.target}`);
        return false;
      }
      return true;
    });

    // Step 5: Cap at max per cycle
    const approved = safe.slice(0, MAX_APPROVED_PER_CYCLE).map(a => ({
      ...a,
      approved: true,
    }));

    logPipeline(inputCount, resolved.length, stable.length, approved.length);

    return approved;
  }

  /** Check current stability state for a module */
  checkStability(module: string) {
    return stabilityController.checkStability(module);
  }

  /** Manually trigger stability lock (e.g. during critical workflow) */
  lockStability(reason: string, module?: string): void {
    stabilityController.activateLock(reason, 'CRITICAL', module);
  }

  /** Reset all state (call on logout) */
  reset(): void {
    stabilityController.reset();
  }
}

/** Singleton governance engine */
export const governanceEngine = new UIGovernanceEngine();
