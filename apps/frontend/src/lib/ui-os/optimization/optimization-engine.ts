/**
 * Optimization Engine — Autonomous self-improvement orchestrator.
 *
 * Pipeline:
 *   Impact Metrics → Performance Analyzer → Rule Optimizer
 *   → A/B Testing → Config Evolver → Updated Behavior
 *
 * Runs periodically (every 60s) when active.
 * Safe: max 1 config update/hour, progressive adjustments only.
 */

import { analyzePerformance } from './performance-analyzer';
import type { PerformanceReport } from './performance-analyzer';
import { optimizeRules } from './rule-optimizer';
import type { OptimizedRules } from './rule-optimizer';
import { abTestingEngine } from './ab-testing-engine';
import { configEvolver } from './config-evolver';
import { perceptionGuard } from '../perception';
import { useImpactStore } from '../impact';

const IS_DEV = process.env.NODE_ENV === 'development';
const OPTIMIZATION_INTERVAL_MS = 60_000; // 1 minute

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let initialized = false;

/** Latest performance report (read by external consumers) */
let lastReport: PerformanceReport | null = null;
let lastOptimizedRules: OptimizedRules | null = null;

/**
 * Run one optimization cycle.
 */
function runCycle(): void {
  // Step 1: Analyze performance
  const report = analyzePerformance();
  lastReport = report;

  // Step 2: Optimize rules
  const currentConfig = configEvolver.getActiveRules();
  const optimized = optimizeRules(report, currentConfig || undefined);
  lastOptimizedRules = optimized;

  // Step 3: A/B test recording (feed current session's data)
  const impact = useImpactStore.getState();
  abTestingEngine.record('debounce-test', {
    clicksSaved: impact.totalClicksSaved,
    timeSavedMs: impact.totalTimeSavedMs,
    fatigueScore: perceptionGuard.getFatigueScore(),
  });

  // Step 4: Evaluate A/B tests
  const abResult = abTestingEngine.evaluate('debounce-test');

  // Step 5: Apply config if gain is sufficient
  // Compute gain: compare optimized debounce improvement vs current
  const gainEstimate = report.systemHealth.totalMutations > 0
    ? Math.round(
        ((report.actionEfficiency['_global']?.successRate || 0) * 100) -
        (report.systemHealth.fatigueScore),
      )
    : 0;

  if (gainEstimate > 0) {
    configEvolver.tryApply(optimized, gainEstimate);
  }

  // Step 6: Auto-rollback if degradation
  if (report.systemHealth.fatigueScore > 70 && report.systemHealth.rollbackRate > 0.2) {
    configEvolver.rollback();
    if (IS_DEV) console.warn('[UI-OS OPT] Auto-rollback: high fatigue + rollbacks');
  }

  if (IS_DEV && optimized.reasoning.length > 0) {
    console.groupCollapsed('[UI-OS OPT] Optimization cycle');
    console.log('Health:', report.systemHealth);
    for (const r of optimized.reasoning) console.log(`  → ${r}`);
    if (abResult.ready) console.log(`  A/B winner: ${abResult.winnerVariant} (+${abResult.improvement}%)`);
    console.groupEnd();
  }
}

/**
 * Initialize the optimization engine.
 * Registers default A/B tests and starts periodic optimization.
 * Safe to call multiple times (idempotent).
 */
export function initOptimizationEngine(): void {
  if (initialized) return;

  // Register default A/B tests
  abTestingEngine.registerTest({
    id: 'debounce-test',
    name: 'Debounce 300ms vs 200ms',
    paramName: 'debounceMs',
    variantA: 300,
    variantB: 200,
  });

  // Start periodic optimization (every 60s)
  intervalHandle = setInterval(runCycle, OPTIMIZATION_INTERVAL_MS);

  // Run first cycle after 10s (let telemetry accumulate)
  setTimeout(runCycle, 10_000);

  initialized = true;
}

/** Stop optimization (cleanup) */
export function stopOptimizationEngine(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  initialized = false;
}

/** Get latest report (read-only) */
export function getLastReport(): PerformanceReport | null {
  return lastReport;
}

/** Get latest optimized rules (consumed by orchestrator) */
export function getOptimizedRules(): OptimizedRules | null {
  return configEvolver.getActiveRules() || lastOptimizedRules;
}
