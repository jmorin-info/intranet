/**
 * Stability Controller — Prevents AI oscillation and freezes UI during critical workflows.
 *
 * STABILITY MODE activates when:
 *  - Active document approval workflow
 *  - High-severity incident handling
 *  - Rollback storm (>2 rollbacks in 30s)
 *
 * When active: only CRITICAL actions are allowed, AI is read-only.
 */

import { eventBus } from '@/lib/events';
import type { UIEvent } from '@/lib/events';
import type { UIStateLock, UIGovernedAction, UIActionPriority } from './types';
import { PRIORITY_WEIGHT } from './types';

const ROLLBACK_STORM_THRESHOLD = 2;
const ROLLBACK_STORM_WINDOW_MS = 30_000;
const STABILITY_COOLDOWN_MS = 15_000;

class StabilityController {
  private rollbackTimestamps: number[] = [];
  private lock: UIStateLock = { active: false, reason: '', allowedPriority: 'LOW' };
  private lockUntil = 0;
  private initialized = false;

  /** Initialize event bus listener for rollback detection */
  init(): void {
    if (this.initialized) return;
    eventBus.on('ROLLBACK', (event: UIEvent) => {
      this.rollbackTimestamps.push(event.timestamp);
      // Trim old entries
      const cutoff = Date.now() - ROLLBACK_STORM_WINDOW_MS;
      this.rollbackTimestamps = this.rollbackTimestamps.filter(t => t > cutoff);

      if (this.rollbackTimestamps.length > ROLLBACK_STORM_THRESHOLD) {
        this.activateLock('Rollback storm detecte — UI stabilisee', 'CRITICAL');
      }
    });
    this.initialized = true;
  }

  /** Manually activate stability lock */
  activateLock(reason: string, allowedPriority: UIActionPriority = 'CRITICAL', module?: string): void {
    this.lock = { active: true, reason, module, allowedPriority };
    this.lockUntil = Date.now() + STABILITY_COOLDOWN_MS;
  }

  /** Check current stability state */
  checkStability(module?: string): UIStateLock {
    // Auto-release after cooldown
    if (this.lock.active && Date.now() > this.lockUntil) {
      this.lock = { active: false, reason: '', allowedPriority: 'LOW' };
    }

    // Module-specific lock check
    if (this.lock.active && this.lock.module && module && this.lock.module !== module) {
      // Lock is for a different module — don't apply
      return { active: false, reason: '', allowedPriority: 'LOW' };
    }

    return { ...this.lock };
  }

  /**
   * Filter actions based on current stability state.
   * When locked, only actions at or above the lock threshold pass through.
   */
  filterByStability(actions: UIGovernedAction[], module?: string): UIGovernedAction[] {
    const lock = this.checkStability(module);
    if (!lock.active) return actions;

    const threshold = PRIORITY_WEIGHT[lock.allowedPriority];
    return actions.filter(a => PRIORITY_WEIGHT[a.priority] >= threshold);
  }

  /** Reset (call on logout or test cleanup) */
  reset(): void {
    this.rollbackTimestamps = [];
    this.lock = { active: false, reason: '', allowedPriority: 'LOW' };
    this.lockUntil = 0;
  }
}

/** Singleton stability controller */
export const stabilityController = new StabilityController();
