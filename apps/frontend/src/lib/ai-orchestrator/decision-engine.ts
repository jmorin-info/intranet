/**
 * Decision Engine — Converts intent signals into UI action decisions.
 *
 * Maps each detected intent to a set of UI adaptations.
 * All decisions are reversible and non-destructive.
 */

import type { IntentSignal, UIActionPlan, UIActionType } from './types';

let actionCounter = 0;
function nextActionId(): string {
  return `uiact-${++actionCounter}`;
}

interface DecisionRule {
  intent: string;
  produce: (signal: IntentSignal) => UIActionPlan[];
}

const DECISION_RULES: DecisionRule[] = [
  {
    intent: 'WORKFLOW_HEAVY',
    produce: (s) => [
      {
        id: nextActionId(),
        type: 'PROMOTE_ACTION',
        target: 'status-dropdown',
        impactScore: 0.85,
        reversible: true,
        reason: `${s.module}: flux de travail intensif detecte — promouvoir les actions de statut`,
      },
    ],
  },
  {
    intent: 'DO_BULK_ACTIONS',
    produce: (s) => [
      {
        id: nextActionId(),
        type: 'ENABLE_BULK_MODE',
        target: 'list-selection',
        impactScore: 0.8,
        reversible: true,
        reason: `${s.module}: actions repetitives — activer le mode selection groupee`,
      },
    ],
  },
  {
    intent: 'CONFUSION',
    produce: (s) => [
      {
        id: nextActionId(),
        type: 'SIMPLIFY_VIEW',
        target: 'secondary-panels',
        impactScore: 0.75,
        reversible: true,
        reason: `${s.module}: confusion detectee — simplifier l'interface`,
      },
    ],
  },
  {
    intent: 'SEARCH_INTENT',
    produce: (s) => [
      {
        id: nextActionId(),
        type: 'AUTO_FOCUS',
        target: 'search-input',
        impactScore: 0.7,
        reversible: true,
        reason: `${s.module}: intent de recherche detecte`,
      },
    ],
  },
  {
    intent: 'EXPLORATION_MODE',
    produce: (s) => [
      {
        id: nextActionId(),
        type: 'SHOW_COMPONENT',
        target: 'recent-entities',
        impactScore: 0.6,
        reversible: true,
        reason: `${s.module}: mode exploration — montrer les entites recentes`,
      },
    ],
  },
  {
    intent: 'REVIEW_MODE',
    produce: (s) => [
      {
        id: nextActionId(),
        type: 'PROMOTE_ACTION',
        target: 'approval-actions',
        impactScore: 0.85,
        reversible: true,
        reason: `Documents: mode revue detecte — promouvoir les actions d'approbation`,
      },
      {
        id: nextActionId(),
        type: 'HIDE_COMPONENT',
        target: 'analytics-widgets',
        impactScore: 0.5,
        reversible: true,
        reason: `Documents: en revue — masquer les widgets analytiques`,
      },
    ],
  },
  {
    intent: 'EXPERT_USAGE',
    produce: (s) => [
      {
        id: nextActionId(),
        type: 'SHOW_COMPONENT',
        target: 'advanced-filters',
        impactScore: 0.65,
        reversible: true,
        reason: `${s.module}: usage expert — afficher les filtres avances`,
      },
    ],
  },
];

/**
 * Convert a list of intent signals into UI action plans.
 * Applies matching decision rules and returns action plans.
 */
export function decide(intents: IntentSignal[]): UIActionPlan[] {
  const actions: UIActionPlan[] = [];

  for (const signal of intents) {
    const rules = DECISION_RULES.filter(r => r.intent === signal.intent);
    for (const rule of rules) {
      actions.push(...rule.produce(signal));
    }
  }

  return actions;
}
