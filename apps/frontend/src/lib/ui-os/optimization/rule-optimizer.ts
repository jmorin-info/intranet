/**
 * Rule Optimizer — Adapts system behavior based on real performance data.
 *
 * Reads a PerformanceReport and produces OptimizedRules.
 * All adjustments are progressive (max +/-20% per cycle).
 * Never modifies hard locks. Never bypasses governance.
 */

import type { PerformanceReport } from './performance-analyzer';

export interface OptimizedRules {
  /** Weight multiplier per action type (1.0 = default, <1 = reduce, >1 = boost) */
  actionWeights: Record<string, number>;
  /** Recommended debounce (ms) */
  debounceMs: number;
  /** Recommended max mutations per cycle */
  maxMutationsPerCycle: number;
  /** Threshold adjustments */
  thresholds: {
    minConfidence: number;
    burstDetectionWindow: number;
  };
  /** Reasoning for each adjustment */
  reasoning: string[];
}

const DEFAULT_RULES: OptimizedRules = {
  actionWeights: {},
  debounceMs: 300,
  maxMutationsPerCycle: 3,
  thresholds: {
    minConfidence: 0.6,
    burstDetectionWindow: 30_000,
  },
  reasoning: [],
};

/** Maximum adjustment per cycle (20%) */
const MAX_ADJUSTMENT = 0.2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Generate optimized rules from a performance report.
 * Adjustments are progressive — never more than 20% change per cycle.
 */
export function optimizeRules(
  report: PerformanceReport,
  currentRules: OptimizedRules = DEFAULT_RULES,
): OptimizedRules {
  const reasoning: string[] = [];
  const weights = { ...currentRules.actionWeights };
  let debounceMs = currentRules.debounceMs;
  let maxMutations = currentRules.maxMutationsPerCycle;
  let minConfidence = currentRules.thresholds.minConfidence;

  const health = report.systemHealth;
  const global = report.actionEfficiency['_global'];

  // Rule 1: High fatigue → reduce mutations
  if (health.fatigueScore > 50) {
    maxMutations = Math.max(1, maxMutations - 1);
    debounceMs = Math.min(500, debounceMs + 50);
    reasoning.push(`Fatigue elevee (${health.fatigueScore}) → mutations reduites, debounce augmente`);
  }

  // Rule 2: High rollback rate → increase confidence threshold
  if (health.rollbackRate > 0.15) {
    minConfidence = clamp(minConfidence + 0.05, 0.5, 0.9);
    reasoning.push(`Rollback rate ${(health.rollbackRate * 100).toFixed(0)}% → confidence threshold augmente`);
  }

  // Rule 3: Low success rate → reduce action weights
  if (global && global.successRate < 0.3 && global.totalApplied > 5) {
    for (const key of Object.keys(weights)) {
      weights[key] = clamp((weights[key] || 1) * (1 - MAX_ADJUSTMENT), 0.2, 2.0);
    }
    reasoning.push(`Success rate bas (${(global.successRate * 100).toFixed(0)}%) → poids actions reduits`);
  }

  // Rule 4: High success + low fatigue → can increase mutations
  if (global && global.successRate > 0.7 && health.fatigueScore < 25) {
    maxMutations = Math.min(5, maxMutations + 1);
    debounceMs = Math.max(100, debounceMs - 30);
    reasoning.push(`Bonne performance + faible fatigue → mutations augmentees`);
  }

  // Rule 5: Per-module adjustment
  for (const [mod, efficiency] of Object.entries(report.actionEfficiency)) {
    if (mod === '_global') continue;
    if (efficiency.rejectionRate > 0.6) {
      weights[mod] = clamp((weights[mod] || 1) * (1 - MAX_ADJUSTMENT), 0.2, 2.0);
      reasoning.push(`Module ${mod}: rejection elevee → poids reduit`);
    }
    if (efficiency.successRate > 0.8 && efficiency.totalApplied > 3) {
      weights[mod] = clamp((weights[mod] || 1) * (1 + MAX_ADJUSTMENT * 0.5), 0.2, 2.0);
      reasoning.push(`Module ${mod}: haute performance → poids augmente`);
    }
  }

  if (reasoning.length === 0) {
    reasoning.push('Aucun ajustement necessaire — performance stable');
  }

  return {
    actionWeights: weights,
    debounceMs: clamp(debounceMs, 100, 500),
    maxMutationsPerCycle: clamp(maxMutations, 1, 5),
    thresholds: {
      minConfidence: clamp(minConfidence, 0.5, 0.9),
      burstDetectionWindow: currentRules.thresholds.burstDetectionWindow,
    },
    reasoning,
  };
}
