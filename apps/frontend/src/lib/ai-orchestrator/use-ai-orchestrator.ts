'use client';

/**
 * React hook: AI UX Orchestrator.
 *
 * Subscribes to event bus, computes intents from telemetry,
 * generates UI action plans, applies guardrails, and returns
 * orchestration hints for the current module.
 *
 * Debounced at 300ms to prevent flicker.
 *
 * Usage:
 *   const { hints, intents, actions } = useAIOrchestrator('TICKETS');
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useEventSubscription } from '@/lib/events';
import { initTracker, metricsStore } from '@/lib/ux-telemetry';
import type { TelemetryModule } from '@/lib/ux-telemetry';
import { governanceEngine } from '@/lib/ui-os/governance-engine';
import type { UIGovernedAction } from '@/lib/ui-os/types';
import { uiStateManager } from '@/lib/ui-os/stability';
import { applyUIMutations, resetUIState } from '@/lib/ui-os/execution';
import { useAIModeStore } from '@/lib/ui-os/control';
import { detectAnomalies, generateRepairs } from '@/lib/ui-os/self-healing';
import { generatePredictions } from '@/lib/ui-os/predictive';
import { initOptimizationEngine, getOptimizedRules } from '@/lib/ui-os/optimization';
import { computeIntents } from './intent-engine';
import { decide } from './decision-engine';
import { applyGuardrails } from './guardrails';
import { prioritize } from './prioritizer';
import { rewrite } from './ui-rewriter';
import type { OrchestrationState, OrchestratorModule } from './types';
import { EMPTY_STATE } from './types';

export function useAIOrchestrator(module: OrchestratorModule): OrchestrationState {
  const [state, setState] = useState<OrchestrationState>(EMPTY_STATE);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);

  // Initialize all engines once
  useEffect(() => {
    if (!initialized.current) {
      initTracker();
      governanceEngine.init();
      initOptimizationEngine();
      initialized.current = true;
    }
  }, []);

  const compute = useCallback(() => {
    const telemetryModule = module as unknown as TelemetryModule;

    // Phase 12: Evaluate stability mode from telemetry
    const metrics = metricsStore.getModuleMetrics(telemetryModule);
    uiStateManager.evaluate({
      rollbackCount: metrics.rollbackCount,
      frictionScore: Math.min(100, metrics.maxBurstSize * 12 + metrics.slowFlowCount * 15),
      totalActions: metrics.totalActions,
      slowFlowCount: metrics.slowFlowCount,
    });
    const modeState = uiStateManager.getMode();

    // Phase 11 pipeline: intents → decisions → guardrails → prioritize
    const intents = computeIntents(module);
    const rawActions = decide(intents);
    const safeActions = applyGuardrails(rawActions);
    const rankedActions = prioritize(safeActions);

    // Phase 12: Self-healing (HEALING mode only)
    const healingActions: UIGovernedAction[] = [];
    if (modeState.healingAllowed) {
      const anomalies = detectAnomalies();
      const repairs = generateRepairs(anomalies);
      for (const r of repairs) {
        healingActions.push({
          id: r.id,
          source: 'UX_INSIGHTS',
          type: r.action,
          target: r.target,
          priority: 'MEDIUM',
          timestamp: Date.now(),
        });
      }
    }

    // Phase 12: Predictive (EXPLORATION mode only) — hints only, no governance needed
    if (modeState.predictiveAllowed) {
      generatePredictions(telemetryModule); // Side effect: updates internal state for future consumers
    }

    // Phase 11.5: Pass all actions through governance for final arbitration
    const governedInput: UIGovernedAction[] = [
      ...rankedActions.map(a => ({
        id: a.id,
        source: 'AI_ORCHESTRATOR' as const,
        type: a.type,
        target: a.target,
        priority: a.impactScore >= 0.8 ? 'HIGH' as const : 'MEDIUM' as const,
        timestamp: Date.now(),
      })),
      ...healingActions,
    ];
    const approved = governanceEngine.evaluate(governedInput, module);

    // Phase 13: Apply approved mutations to the global UI state store
    applyUIMutations(approved);

    // Filter rankedActions to only include governance-approved targets
    const approvedTargets = new Set(approved.map(a => a.target));
    const finalActions = rankedActions.filter(a => approvedTargets.has(a.target));
    const hints = rewrite(finalActions);

    setState({
      intents,
      actions: finalActions,
      hints,
      updatedAt: Date.now(),
    });
  }, [module]);

  // Reset UI state on module change (clean slate for each module)
  useEffect(() => {
    resetUIState();
    compute();
  }, [compute]);

  // Debounced recompute on every confirmed event
  // Phase 15: debounce reads from optimized config or mode config
  useEventSubscription('*', (event) => {
    if (event.metadata?.optimistic) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const optimized = getOptimizedRules();
    const modeConfig = useAIModeStore.getState().config;
    const debounceMs = optimized?.debounceMs ?? modeConfig.debounceMs;
    debounceRef.current = setTimeout(compute, debounceMs);
  });

  // Cleanup
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return state;
}
