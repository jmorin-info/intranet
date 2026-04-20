/**
 * Repair Recommendation Engine — Converts anomalies into advisory repair actions.
 *
 * ADVISORY ONLY: produces recommendations that feed into governance
 * as MEDIUM-priority governed actions. Never mutates UI directly.
 */

import type { UIAnomaly } from './ui-anomaly-detector';

export interface RepairRecommendation {
  id: string;
  target: string;
  action: 'SIMPLIFY' | 'PROMOTE' | 'COLLAPSE' | 'REORDER';
  confidence: number;
  reason: string;
  anomalyType: string;
  module: string;
}

let repairCounter = 0;

const REPAIR_MAP: Record<string, (a: UIAnomaly) => RepairRecommendation | null> = {
  FRICTION_SPIKE: (a) => ({
    id: `repair-${++repairCounter}`,
    target: 'secondary-panels',
    action: 'COLLAPSE',
    confidence: Math.min(a.severity / 100, 0.9),
    reason: `Friction elevee dans ${a.module} — collapser les panneaux secondaires`,
    anomalyType: a.type,
    module: a.module,
  }),

  ROLLBACK_CHAIN: (a) => ({
    id: `repair-${++repairCounter}`,
    target: 'action-feedback',
    action: 'PROMOTE',
    confidence: Math.min(a.severity / 100, 0.85),
    reason: `Rollbacks repetes dans ${a.module} — promouvoir le feedback d'action`,
    anomalyType: a.type,
    module: a.module,
  }),

  WORKFLOW_DEAD_END: (a) => ({
    id: `repair-${++repairCounter}`,
    target: 'navigation-hints',
    action: 'PROMOTE',
    confidence: Math.min(a.severity / 100, 0.8),
    reason: `Boucles dans ${a.module} — promouvoir les indices de navigation`,
    anomalyType: a.type,
    module: a.module,
  }),

  UI_OVERLOAD: (a) => ({
    id: `repair-${++repairCounter}`,
    target: 'widget-density',
    action: 'SIMPLIFY',
    confidence: 0.6,
    reason: `Surcharge UI dans ${a.module} — simplifier la densite`,
    anomalyType: a.type,
    module: a.module,
  }),

  CLICK_DEPTH_EXCESSIVE: (a) => ({
    id: `repair-${++repairCounter}`,
    target: 'primary-actions',
    action: 'REORDER',
    confidence: 0.7,
    reason: `Profondeur de clic elevee dans ${a.module} — reorganiser les actions primaires`,
    anomalyType: a.type,
    module: a.module,
  }),
};

/**
 * Generate repair recommendations from detected anomalies.
 * @returns Array of recommendations sorted by confidence (desc).
 */
export function generateRepairs(anomalies: UIAnomaly[]): RepairRecommendation[] {
  return anomalies
    .map(a => REPAIR_MAP[a.type]?.(a))
    .filter((r): r is RepairRecommendation => r != null && r.confidence >= 0.6)
    .sort((a, b) => b.confidence - a.confidence);
}
