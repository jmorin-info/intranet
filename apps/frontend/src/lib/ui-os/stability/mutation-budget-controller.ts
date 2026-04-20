/**
 * Mutation Budget Controller — Caps adaptive mutations per time window.
 *
 * Prevents AI oscillation by limiting how many layout changes
 * the adaptive kernel can produce within a rolling window.
 *
 * Budget: max 5 mutations per 30s window.
 */

const WINDOW_MS = 30_000;
const MAX_MUTATIONS_PER_WINDOW = 5;

class MutationBudgetController {
  private timestamps: number[] = [];

  /** Check if a mutation is allowed under current budget */
  canMutate(): boolean {
    this.trimOld();
    return this.timestamps.length < MAX_MUTATIONS_PER_WINDOW;
  }

  /** Record a mutation (call after governance approves an action) */
  recordMutation(): void {
    this.timestamps.push(Date.now());
    this.trimOld();
  }

  /** Get remaining budget */
  remaining(): number {
    this.trimOld();
    return Math.max(0, MAX_MUTATIONS_PER_WINDOW - this.timestamps.length);
  }

  /** Reset budget */
  reset(): void {
    this.timestamps = [];
  }

  private trimOld(): void {
    const cutoff = Date.now() - WINDOW_MS;
    this.timestamps = this.timestamps.filter(t => t > cutoff);
  }
}

export const mutationBudget = new MutationBudgetController();
