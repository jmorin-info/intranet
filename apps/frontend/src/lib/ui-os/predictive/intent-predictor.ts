/**
 * Intent Predictor — Predicts what the user will do next.
 *
 * Combines transition probabilities from the action graph with
 * contextual signals (active module, recent patterns).
 *
 * Output: soft UI hints (highlight, preload). Never layout mutations.
 */

import { metricsStore } from '@/lib/ux-telemetry';
import type { TelemetryModule } from '@/lib/ux-telemetry';
import { predictNext } from './next-action-graph';

export interface UIPrediction {
  id: string;
  target: string;
  probability: number;
  actionHint: string;
  module: TelemetryModule;
}

let predCounter = 0;

/**
 * Generate predictions for the current module.
 * @returns Array of predictions above 0.3 probability, max 3.
 */
export function generatePredictions(module: TelemetryModule): UIPrediction[] {
  const events = metricsStore.getRecentEvents(module);
  if (events.length < 2) return [];

  const lastEvent = events[events.length - 1]!;
  const lastKey = `${lastEvent.module}:${lastEvent.action}`;

  const predictions: UIPrediction[] = [];

  // Predict from transition graph
  const nextTransition = predictNext(lastKey);
  if (nextTransition) {
    const [targetModule, targetAction] = nextTransition.to.split(':') as [string, string];
    predictions.push({
      id: `pred-${++predCounter}`,
      target: targetAction || 'unknown',
      probability: nextTransition.probability,
      actionHint: `Prochain: ${targetAction} dans ${targetModule}`,
      module: (targetModule as TelemetryModule) || module,
    });
  }

  // Context-based predictions
  // If user just changed status → likely to change another (workflow pattern)
  if (lastEvent.action === 'STATUS_CHANGE' && events.filter(e => e.action === 'STATUS_CHANGE').length >= 2) {
    predictions.push({
      id: `pred-${++predCounter}`,
      target: 'status-dropdown',
      probability: 0.7,
      actionHint: 'Continuer les changements de statut',
      module,
    });
  }

  // If user just created → likely to view the entity
  if (lastEvent.action === 'CREATE') {
    predictions.push({
      id: `pred-${++predCounter}`,
      target: 'entity-detail',
      probability: 0.8,
      actionHint: 'Voir le detail de l\'entite creee',
      module,
    });
  }

  return predictions
    .filter(p => p.probability >= 0.3)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 3);
}
