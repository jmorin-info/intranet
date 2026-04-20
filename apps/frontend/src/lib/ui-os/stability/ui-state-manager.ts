/**
 * UI State Manager — Controls the adaptive system mode.
 *
 * Three modes govern what Phase 12 subsystems are active:
 *  - STABLE:      No layout changes. Only governance-approved hints.
 *  - HEALING:     Self-healing active, predictive disabled. For high-friction states.
 *  - EXPLORATION: Predictive active, healing limited. For calm usage patterns.
 *
 * Mode transitions are deterministic, based on telemetry signals.
 */

export type AdaptiveMode = 'STABLE' | 'HEALING' | 'EXPLORATION';

export interface ModeState {
  mode: AdaptiveMode;
  reason: string;
  since: number;
  /** Whether self-healing recommendations are allowed */
  healingAllowed: boolean;
  /** Whether predictive hints are allowed */
  predictiveAllowed: boolean;
}

const MODE_CONFIG: Record<AdaptiveMode, Pick<ModeState, 'healingAllowed' | 'predictiveAllowed'>> = {
  STABLE:      { healingAllowed: false, predictiveAllowed: false },
  HEALING:     { healingAllowed: true,  predictiveAllowed: false },
  EXPLORATION: { healingAllowed: false, predictiveAllowed: true },
};

class UIStateManager {
  private state: ModeState = {
    mode: 'STABLE',
    reason: 'Initial state',
    since: Date.now(),
    ...MODE_CONFIG.STABLE,
  };

  /** Get current mode */
  getMode(): ModeState {
    return { ...this.state };
  }

  /** Switch to a new mode with a reason */
  setMode(mode: AdaptiveMode, reason: string): void {
    if (mode === this.state.mode) return;
    this.state = {
      mode,
      reason,
      since: Date.now(),
      ...MODE_CONFIG[mode],
    };
  }

  /**
   * Evaluate telemetry signals and decide mode transition.
   * Called after each governance cycle.
   */
  evaluate(signals: {
    rollbackCount: number;
    frictionScore: number;
    totalActions: number;
    slowFlowCount: number;
  }): void {
    // Rollback storm or high friction → STABLE (lockdown)
    if (signals.rollbackCount >= 2 || signals.frictionScore > 80) {
      this.setMode('STABLE', signals.rollbackCount >= 2
        ? 'Rollback storm detected'
        : 'High friction score');
      return;
    }

    // Moderate friction → HEALING (allow repair suggestions)
    if (signals.frictionScore > 40 || signals.slowFlowCount > 2) {
      this.setMode('HEALING', 'Moderate friction — healing active');
      return;
    }

    // Low friction, enough activity → EXPLORATION (allow predictions)
    if (signals.totalActions >= 5 && signals.frictionScore <= 40) {
      this.setMode('EXPLORATION', 'Calm usage — predictions active');
      return;
    }

    // Default: stay stable
    if (this.state.mode !== 'STABLE') {
      this.setMode('STABLE', 'Insufficient activity for adaptation');
    }
  }

  /** Reset to default */
  reset(): void {
    this.state = {
      mode: 'STABLE',
      reason: 'Reset',
      since: Date.now(),
      ...MODE_CONFIG.STABLE,
    };
  }
}

export const uiStateManager = new UIStateManager();
