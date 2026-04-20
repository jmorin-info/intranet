/**
 * UI Anomaly Detector — Identifies UX problems from telemetry data.
 *
 * Reads Phase 10 metrics store. Produces anomaly signals
 * that the repair engine converts into recommendations.
 *
 * Pure detection — never modifies UI.
 */

import { metricsStore } from '@/lib/ux-telemetry';
import type { TelemetryModule, ModuleMetrics } from '@/lib/ux-telemetry';

export type AnomalyType =
  | 'FRICTION_SPIKE'
  | 'ROLLBACK_CHAIN'
  | 'CLICK_DEPTH_EXCESSIVE'
  | 'WORKFLOW_DEAD_END'
  | 'UI_OVERLOAD';

export interface UIAnomaly {
  type: AnomalyType;
  module: TelemetryModule;
  severity: number; // 0-100
  description: string;
  evidence: string[];
}

type AnomalyRule = (m: ModuleMetrics) => UIAnomaly | null;

const rules: AnomalyRule[] = [
  // Friction spike: high burst + slow flows
  (m) => {
    if (m.maxBurstSize < 4 && m.slowFlowCount < 2) return null;
    const severity = Math.min(100, m.maxBurstSize * 12 + m.slowFlowCount * 15);
    return {
      type: 'FRICTION_SPIKE',
      module: m.module,
      severity,
      description: `Pic de friction: ${m.maxBurstSize} actions en burst, ${m.slowFlowCount} flows lents`,
      evidence: [`burst: ${m.maxBurstSize}`, `slow: ${m.slowFlowCount}`],
    };
  },

  // Rollback chain
  (m) => {
    if (m.rollbackCount < 2) return null;
    return {
      type: 'ROLLBACK_CHAIN',
      module: m.module,
      severity: Math.min(100, m.rollbackCount * 30),
      description: `${m.rollbackCount} rollbacks en chaine — confusion utilisateur`,
      evidence: [`rollbacks: ${m.rollbackCount}`],
    };
  },

  // Navigation loops → dead end pattern
  (m) => {
    if (m.navigationLoops < 2) return null;
    return {
      type: 'WORKFLOW_DEAD_END',
      module: m.module,
      severity: Math.min(100, m.navigationLoops * 20),
      description: `${m.navigationLoops} boucles de navigation — impasse workflow possible`,
      evidence: [`loops: ${m.navigationLoops}`],
    };
  },

  // UI overload: high action count but low productive output
  (m) => {
    if (m.totalActions < 8) return null;
    if (m.topAction !== 'NAVIGATE' && m.topAction !== 'CLICK') return null;
    return {
      type: 'UI_OVERLOAD',
      module: m.module,
      severity: 40,
      description: `Densite d'interactions elevee sans resultat productif`,
      evidence: [`actions: ${m.totalActions}`, `top: ${m.topAction}`],
    };
  },
];

/**
 * Scan all modules for anomalies.
 * @returns Array of detected anomalies sorted by severity (desc).
 */
export function detectAnomalies(): UIAnomaly[] {
  const modules: TelemetryModule[] = ['TICKETS', 'DOCUMENTS', 'INCIDENTS', 'DASHBOARD'];
  const anomalies: UIAnomaly[] = [];

  for (const mod of modules) {
    const metrics = metricsStore.getModuleMetrics(mod);
    if (metrics.totalActions === 0) continue;
    for (const rule of rules) {
      const anomaly = rule(metrics);
      if (anomaly) anomalies.push(anomaly);
    }
  }

  return anomalies.sort((a, b) => b.severity - a.severity);
}
