/**
 * Message Builder — Generates human-readable explanations for UI mutations.
 *
 * Maps (actionType, target) → French explanation string.
 * Pure function, zero side effects.
 */

export interface ExplainabilityMessage {
  id: string;
  target: string;
  message: string;
  reason: string;
  confidence: number;
  timestamp: number;
}

let msgCounter = 0;

const MESSAGE_MAP: Record<string, Record<string, { message: string; reason: string }>> = {
  COLLAPSE: {
    'secondary-panels': { message: 'Panneau masque', reason: 'Reduire la surcharge visuelle' },
    'analytics-widgets': { message: 'Statistiques masquees', reason: 'Focus sur les actions prioritaires' },
  },
  HIDE_COMPONENT: {
    'secondary-panels': { message: 'Panneau masque', reason: 'Simplification de l\'interface' },
    'analytics-widgets': { message: 'Widgets masques', reason: 'Mode revue active' },
  },
  PROMOTE_ACTION: {
    'status-dropdown': { message: 'Changement de statut mis en avant', reason: 'Workflow intensif detecte' },
    'approval-actions': { message: 'Actions d\'approbation promues', reason: 'Mode revue detecte' },
  },
  PROMOTE: {
    'status-dropdown': { message: 'Statut mis en avant', reason: 'Actions repetees detectees' },
    'action-feedback': { message: 'Feedback renforce', reason: 'Corrections d\'erreurs detectees' },
    'navigation-hints': { message: 'Navigation guidee', reason: 'Difficulte de navigation detectee' },
  },
  SIMPLIFY: {
    'widget-density': { message: 'Densite reduite', reason: 'Surcharge d\'interface detectee' },
    'secondary-panels': { message: 'Vue simplifiee', reason: 'Focus sur le contenu principal' },
  },
  SIMPLIFY_VIEW: {
    'secondary-panels': { message: 'Vue simplifiee', reason: 'Confusion detectee' },
  },
  SHOW_COMPONENT: {
    'secondary-panels': { message: 'Panneau restauré', reason: 'Navigation enrichie' },
    'analytics-widgets': { message: 'Widgets affichés', reason: 'Données pertinentes détectées' },
    'recent-entities': { message: 'Entités récentes affichées', reason: 'Accélérer l\'accès aux éléments fréquents' },
    'advanced-filters': { message: 'Filtres avancés activés', reason: 'Recherche spécialisée détectée' },
  },
  ENABLE_BULK_MODE: {
    'list-selection': { message: 'Mode actions groupées activé', reason: 'Actions répétitives détectées' },
  },
  AUTO_FOCUS: {
    'search-input': { message: 'Recherche activee', reason: 'Accelerer votre action' },
  },
};

/**
 * Build an explainability message for a given action.
 * Returns null if no message template exists.
 */
export function buildMessage(
  actionType: string,
  target: string,
  confidence: number,
): ExplainabilityMessage | null {
  const byType = MESSAGE_MAP[actionType];
  if (!byType) return null;
  const template = byType[target];
  if (!template) return null;
  if (confidence < 0.5) return null;

  return {
    id: `explain-${++msgCounter}`,
    target,
    message: template.message,
    reason: template.reason,
    confidence,
    timestamp: Date.now(),
  };
}
