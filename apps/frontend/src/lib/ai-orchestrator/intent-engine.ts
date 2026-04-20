/**
 * Intent Engine — Converts telemetry metrics into user intent signals.
 *
 * Pure deterministic rules. No ML. No external dependency.
 * Reads from Phase 10 metrics store.
 */

import { metricsStore } from '@/lib/ux-telemetry';
import type { ModuleMetrics, TelemetryModule } from '@/lib/ux-telemetry';
import { aiContext } from '@/lib/ai-ux/context-store';
import type { IntentSignal, OrchestratorModule } from './types';

function telemetryToOrchModule(m: TelemetryModule): OrchestratorModule {
  return m as OrchestratorModule;
}

type IntentRule = (metrics: ModuleMetrics, sessionActions: number) => IntentSignal | null;

// ── Rule 1: Workflow Heavy ───────────────────────────────────────
// >5 status changes or >8 total actions in the module
const workflowHeavy: IntentRule = (m) => {
  const statusChanges = m.topAction === 'STATUS_CHANGE' ? m.totalActions : 0;
  if (m.totalActions < 5 && statusChanges < 3) return null;
  const confidence = Math.min(0.5 + m.totalActions * 0.05, 0.95);
  return {
    module: telemetryToOrchModule(m.module),
    intent: 'WORKFLOW_HEAVY',
    confidence,
    evidence: [`${m.totalActions} actions totales`, `action principale: ${m.topAction}`],
  };
};

// ── Rule 2: Bulk Actions Intent ──────────────────────────────────
// High burst count (>3 on same entity)
const bulkActions: IntentRule = (m) => {
  if (m.maxBurstSize < 3) return null;
  return {
    module: telemetryToOrchModule(m.module),
    intent: 'DO_BULK_ACTIONS',
    confidence: Math.min(0.6 + m.maxBurstSize * 0.08, 0.92),
    evidence: [`burst de ${m.maxBurstSize} actions sur meme entite`],
  };
};

// ── Rule 3: Confusion ────────────────────────────────────────────
// Rollbacks + navigation loops
const confusion: IntentRule = (m) => {
  const score = m.rollbackCount * 2 + m.navigationLoops;
  if (score < 2) return null;
  return {
    module: telemetryToOrchModule(m.module),
    intent: 'CONFUSION',
    confidence: Math.min(0.5 + score * 0.12, 0.9),
    evidence: [
      m.rollbackCount > 0 ? `${m.rollbackCount} rollback(s)` : '',
      m.navigationLoops > 0 ? `${m.navigationLoops} boucles navigation` : '',
    ].filter(Boolean),
  };
};

// ── Rule 4: Exploration Mode ─────────────────────────────────────
// Mostly navigation, low productive actions
const exploration: IntentRule = (m) => {
  if (m.totalActions < 3) return null;
  if (m.topAction !== 'NAVIGATE') return null;
  return {
    module: telemetryToOrchModule(m.module),
    intent: 'EXPLORATION_MODE',
    confidence: 0.65,
    evidence: ['navigation predominante', `${m.totalActions} actions dont majoritairement NAVIGATE`],
  };
};

// ── Rule 5: Review Mode ──────────────────────────────────────────
// Document module with approval-type actions
const reviewMode: IntentRule = (m) => {
  if (m.module !== 'DOCUMENTS') return null;
  if (m.totalActions < 2) return null;
  if (m.topAction !== 'STATUS_CHANGE') return null;
  return {
    module: 'DOCUMENTS',
    intent: 'REVIEW_MODE',
    confidence: 0.8,
    evidence: ['actions de changement de statut dominantes dans Documents'],
  };
};

// ── Rule 6: Idle / Default ───────────────────────────────────────
const idle: IntentRule = (m) => {
  if (m.totalActions > 2) return null;
  return {
    module: telemetryToOrchModule(m.module),
    intent: 'IDLE',
    confidence: 0.5,
    evidence: ['activite minimale'],
  };
};

const ALL_INTENT_RULES: IntentRule[] = [
  workflowHeavy,
  bulkActions,
  confusion,
  exploration,
  reviewMode,
  idle,
];

/**
 * Compute user intents for a specific module.
 * @returns Array of intent signals sorted by confidence (desc).
 */
export function computeIntents(module: OrchestratorModule): IntentSignal[] {
  const telemetryModule = module as TelemetryModule;
  const metrics = metricsStore.getModuleMetrics(telemetryModule);
  const sessionActions = aiContext.getContext().actions.length;

  return ALL_INTENT_RULES
    .map(rule => rule(metrics, sessionActions))
    .filter((s): s is IntentSignal => s !== null && s.confidence >= 0.5)
    .sort((a, b) => b.confidence - a.confidence);
}
