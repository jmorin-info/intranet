/**
 * Perception Guard — Prevents AI fatigue and "creepy UX".
 *
 * CAN BLOCK mutations (unlike explainability which is non-blocking).
 *
 * Rules:
 *  - >2 layout shifts in <3s → BLOCK further mutations
 *  - Same target toggled twice in 10s → LOCK that target for session
 *  - Dismiss hint repeatedly → reduce hint frequency
 *  - High fatigue score → system becomes more conservative
 */

import type { UIGovernedAction } from '../types';

const SHIFT_WINDOW_MS = 3_000;
const MAX_SHIFTS_IN_WINDOW = 2;
const TARGET_LOCK_WINDOW_MS = 10_000;
const LOCK_TTL_MS = 300_000; // 5 minutes
const DISMISSAL_WINDOW_MS = 3_600_000; // 1 hour rolling window

class PerceptionGuard {
  /** Timestamps of recent layout shifts */
  private shiftTimestamps: number[] = [];
  /** Targets that have been toggled (show/hide) recently: target → timestamps */
  private targetHistory = new Map<string, number[]>();
  /** Targets locked with expiry timestamps */
  private lockedTargets = new Map<string, number>();
  /** Hint dismissal timestamps (rolling window) */
  private dismissalTimestamps: number[] = [];

  /**
   * Filter actions through perception guardrails.
   * Returns only actions that are safe to apply.
   */
  filter(actions: UIGovernedAction[]): UIGovernedAction[] {
    const now = Date.now();

    // Trim old shift timestamps
    this.shiftTimestamps = this.shiftTimestamps.filter(t => now - t < SHIFT_WINDOW_MS);

    // Block ALL if too many recent shifts
    if (this.shiftTimestamps.length >= MAX_SHIFTS_IN_WINDOW) {
      return [];
    }

    // Evict expired locks
    for (const [target, expiresAt] of this.lockedTargets) {
      if (now > expiresAt) this.lockedTargets.delete(target);
    }

    return actions.filter(action => {
      // Skip locked targets
      if (this.lockedTargets.has(action.target)) return false;

      // Check for toggle oscillation on this target
      const history = this.targetHistory.get(action.target) || [];
      const recentHistory = history.filter(t => now - t < TARGET_LOCK_WINDOW_MS);
      if (recentHistory.length >= 2) {
        // Target was mutated 2+ times in 10s → lock it
        this.lockedTargets.set(action.target, now + LOCK_TTL_MS);
        return false;
      }

      return true;
    });
  }

  /** Record that a mutation was applied (call after execution) */
  recordShift(target: string): void {
    this.shiftTimestamps.push(Date.now());

    const history = this.targetHistory.get(target) || [];
    history.push(Date.now());
    // Keep only last 5 entries per target
    this.targetHistory.set(target, history.slice(-5));
  }

  /** Record that a user dismissed an explainability hint */
  recordHintDismissal(): void {
    this.dismissalTimestamps.push(Date.now());
  }

  /** Get current fatigue score (0-100). Higher = more conservative */
  getFatigueScore(): number {
    const now = Date.now();
    this.dismissalTimestamps = this.dismissalTimestamps.filter(t => now - t < DISMISSAL_WINDOW_MS);
    const shiftFatigue = this.shiftTimestamps.length * 15;
    const lockFatigue = this.lockedTargets.size * 10;
    const dismissFatigue = this.dismissalTimestamps.length * 5;
    return Math.min(100, shiftFatigue + lockFatigue + dismissFatigue);
  }

  /** Whether the guard recommends reducing AI aggressiveness */
  shouldReduceAggressiveness(): boolean {
    return this.getFatigueScore() > 50;
  }

  /** Reset (call on logout) */
  reset(): void {
    this.shiftTimestamps = [];
    this.targetHistory.clear();
    this.lockedTargets = new Map();
    this.dismissalTimestamps = [];
  }
}

export const perceptionGuard = new PerceptionGuard();
