/**
 * Config Evolver — Applies optimized rules to runtime configuration.
 *
 * Rules:
 *  - Only apply if gain > 15%
 *  - Max 1 update per hour
 *  - Auto-rollback if degradation detected
 *  - Persist to localStorage for cross-session memory
 */

import type { OptimizedRules } from './rule-optimizer';

const STORAGE_KEY = 'omnitech_ui_os_config';
const MIN_GAIN_PERCENT = 15;
const MIN_UPDATE_INTERVAL_MS = 3_600_000; // 1 hour
const IS_DEV = process.env.NODE_ENV === 'development';

interface StoredConfig {
  rules: OptimizedRules;
  appliedAt: number;
  previousRules: OptimizedRules | null;
}

class ConfigEvolver {
  private lastApplied = 0;
  private currentRules: OptimizedRules | null = null;
  private previousRules: OptimizedRules | null = null;

  constructor() {
    this.load();
  }

  /** Get current active rules (or null for defaults) */
  getActiveRules(): OptimizedRules | null {
    return this.currentRules;
  }

  /**
   * Try to apply new optimized rules.
   * @returns true if applied, false if rejected (too soon, insufficient gain, etc.)
   */
  tryApply(newRules: OptimizedRules, gainPercent: number): boolean {
    const now = Date.now();

    // Guard: too soon since last update
    if (now - this.lastApplied < MIN_UPDATE_INTERVAL_MS) {
      if (IS_DEV) console.info('[UI-OS OPT] Config update skipped — too soon');
      return false;
    }

    // Guard: insufficient gain
    if (gainPercent < MIN_GAIN_PERCENT) {
      if (IS_DEV) console.info(`[UI-OS OPT] Config update skipped — gain ${gainPercent}% < ${MIN_GAIN_PERCENT}%`);
      return false;
    }

    // Apply
    this.previousRules = this.currentRules;
    this.currentRules = newRules;
    this.lastApplied = now;
    this.persist();

    if (IS_DEV) {
      console.info(`[UI-OS OPT] Config evolved: debounce=${newRules.debounceMs}ms, maxMutations=${newRules.maxMutationsPerCycle}`);
      for (const r of newRules.reasoning) console.info(`  → ${r}`);
    }

    return true;
  }

  /**
   * Rollback to previous config if degradation detected.
   * @returns true if rollback was possible.
   */
  rollback(): boolean {
    if (!this.previousRules) return false;
    this.currentRules = this.previousRules;
    this.previousRules = null;
    this.persist();
    if (IS_DEV) console.warn('[UI-OS OPT] Config rolled back to previous');
    return true;
  }

  /** Reset to defaults */
  reset(): void {
    this.currentRules = null;
    this.previousRules = null;
    this.lastApplied = 0;
    if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  }

  // ── Persistence ──────────────────────────────────────────────

  private persist(): void {
    if (typeof window === 'undefined') return;
    const data: StoredConfig = {
      rules: this.currentRules!,
      appliedAt: this.lastApplied,
      previousRules: this.previousRules,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage full — silently ignore
    }
  }

  private load(): void {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data: StoredConfig = JSON.parse(raw);
      this.currentRules = data.rules;
      this.lastApplied = data.appliedAt;
      this.previousRules = data.previousRules;
    } catch {
      // Corrupted data — ignore
    }
  }
}

export const configEvolver = new ConfigEvolver();
