/**
 * UX Friction Detector — Deterministic Rule Engine
 *
 * Analyzes ModuleMetrics and raw events to detect interaction friction.
 * Pure rules, no ML, no external dependency.
 *
 * Each rule returns a friction signal with severity + confidence.
 */

import type { ModuleMetrics, TelemetryModule } from './types';

export type FrictionSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface FrictionSignal {
  id: string;
  severity: FrictionSeverity;
  type: 'FRICTION' | 'CONFUSION' | 'INEFFICIENCY' | 'REDUNDANCY' | 'OVERLOAD' | 'DISCOVERY_ISSUE';
  module: TelemetryModule;
  description: string;
  confidence: number;
  metrics: {
    clicks?: number;
    scrollDepth?: number;
    timeToAction?: number;
    rollbacks?: number;
    loops?: number;
  };
}

type FrictionRule = (metrics: ModuleMetrics) => FrictionSignal | null;

let signalCounter = 0;
function nextSignalId(): string {
  return `friction-${++signalCounter}`;
}

// ── Rule 1: High interaction cost ────────────────────────────────
// If max burst >3 clicks on same entity → friction
const highClickFriction: FrictionRule = (m) => {
  if (m.maxBurstSize <= 3) return null;
  return {
    id: nextSignalId(),
    severity: m.maxBurstSize > 5 ? 'HIGH' : 'MEDIUM',
    type: 'FRICTION',
    module: m.module,
    description: `Cout d'interaction eleve : ${m.maxBurstSize} actions sur la meme entite`,
    confidence: Math.min(0.5 + m.maxBurstSize * 0.1, 0.95),
    metrics: { clicks: m.maxBurstSize },
  };
};

// ── Rule 2: Slow flows ───────────────────────────────────────────
// If >2 actions took >5s → slow flow
const slowFlowDetector: FrictionRule = (m) => {
  if (m.slowFlowCount < 2) return null;
  return {
    id: nextSignalId(),
    severity: m.slowFlowCount > 4 ? 'HIGH' : 'MEDIUM',
    type: 'INEFFICIENCY',
    module: m.module,
    description: `${m.slowFlowCount} actions ont pris plus de 5 secondes`,
    confidence: Math.min(0.5 + m.slowFlowCount * 0.1, 0.9),
    metrics: { timeToAction: m.avgTimeToAction },
  };
};

// ── Rule 3: Confusion pattern (rollbacks) ────────────────────────
// If rollbacks detected → user confusion
const confusionDetector: FrictionRule = (m) => {
  if (m.rollbackCount < 1) return null;
  return {
    id: nextSignalId(),
    severity: m.rollbackCount > 2 ? 'HIGH' : 'MEDIUM',
    type: 'CONFUSION',
    module: m.module,
    description: `${m.rollbackCount} annulation(s) detectee(s) — possible erreur de manipulation`,
    confidence: Math.min(0.6 + m.rollbackCount * 0.15, 0.95),
    metrics: { rollbacks: m.rollbackCount },
  };
};

// ── Rule 4: Navigation loops ─────────────────────────────────────
// Rapid back-and-forth between pages
const navigationLoopDetector: FrictionRule = (m) => {
  if (m.navigationLoops < 2) return null;
  return {
    id: nextSignalId(),
    severity: m.navigationLoops > 3 ? 'HIGH' : 'MEDIUM',
    type: 'DISCOVERY_ISSUE',
    module: m.module,
    description: `${m.navigationLoops} boucles de navigation detectees — l'information est difficile a trouver`,
    confidence: Math.min(0.5 + m.navigationLoops * 0.12, 0.9),
    metrics: { loops: m.navigationLoops },
  };
};

// ── Rule 5: Low activity module ──────────────────────────────────
// Module visited but barely interacted with
const overloadDetector: FrictionRule = (m) => {
  if (m.totalActions < 3) return null;
  const clickRatio = m.topAction === 'NAVIGATE' ? 1 : 0;
  if (clickRatio === 0) return null;
  // Mostly navigation, very few productive actions
  return {
    id: nextSignalId(),
    severity: 'LOW',
    type: 'OVERLOAD',
    module: m.module,
    description: `Module principalement utilise pour la navigation — peu d'actions productives`,
    confidence: 0.6,
    metrics: { clicks: m.totalActions },
  };
};

/** All friction rules */
const ALL_RULES: FrictionRule[] = [
  highClickFriction,
  slowFlowDetector,
  confusionDetector,
  navigationLoopDetector,
  overloadDetector,
];

/**
 * Run all friction detection rules on a module's metrics.
 * @returns Array of detected friction signals (may be empty).
 */
export function detectFrictions(metrics: ModuleMetrics): FrictionSignal[] {
  return ALL_RULES
    .map(rule => rule(metrics))
    .filter((s): s is FrictionSignal => s !== null && s.confidence >= 0.6);
}
