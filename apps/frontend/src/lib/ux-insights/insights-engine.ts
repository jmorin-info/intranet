/**
 * UX Insight Engine — Converts friction signals into actionable recommendations.
 *
 * Each friction type maps to a specific recommendation template.
 * Insights are module-specific and prioritized by severity.
 */

import { metricsStore } from '@/lib/ux-telemetry';
import type { TelemetryModule } from '@/lib/ux-telemetry';
import { detectFrictions } from '@/lib/ux-telemetry/friction-detector';
import type { FrictionSignal } from '@/lib/ux-telemetry/friction-detector';
import type { UXInsight } from './types';

const MAX_INSIGHTS_PER_MODULE = 5;

/** Recommendation templates by friction type + module */
const RECOMMENDATIONS: Record<string, Record<string, string>> = {
  FRICTION: {
    TICKETS: 'Promouvoir le InlineStatusDropdown en zone d\'action primaire du header',
    DOCUMENTS: 'Simplifier le workflow d\'approbation — regrouper les etapes de validation',
    INCIDENTS: 'Ajouter des actions rapides en hover sur les lignes de la liste',
    DASHBOARD: 'Reduire le nombre de widgets — consolider les actions prioritaires',
  },
  CONFUSION: {
    TICKETS: 'Ajouter un historique des modifications visible dans le detail du ticket',
    DOCUMENTS: 'Ajouter des modeles de motifs de rejet structures pour guider le revieweur',
    INCIDENTS: 'Clarifier les transitions de statut avec des labels descriptifs',
    DASHBOARD: 'Simplifier la hierarchie d\'information — une action par section',
  },
  INEFFICIENCY: {
    TICKETS: 'Activer le mode bulk par defaut quand >3 tickets sont selectionnes',
    DOCUMENTS: 'Proposer une file de revue avec navigation prev/next entre documents',
    INCIDENTS: 'Pre-remplir les champs de remediation depuis l\'historique des incidents similaires',
    DASHBOARD: 'Charger les KPIs en priorite, les widgets secondaires en lazy',
  },
  DISCOVERY_ISSUE: {
    TICKETS: 'Ajouter des filtres rapides par statut directement dans le header de la liste',
    DOCUMENTS: 'Reduire la profondeur de navigation — promouvoir la recherche',
    INCIDENTS: 'Afficher les incidents critiques en banniere persistante',
    DASHBOARD: 'Reorganiser les sections par frequence d\'utilisation',
  },
  OVERLOAD: {
    TICKETS: 'Masquer les colonnes secondaires par defaut — afficher sur hover',
    DOCUMENTS: 'Collapser les statistiques admin par defaut',
    INCIDENTS: 'Simplifier les cartes KPI — max 4 visibles',
    DASHBOARD: 'Collapser les widgets secondaires (Quick Links, RSS) par defaut',
  },
  REDUNDANCY: {
    TICKETS: 'Unifier les points d\'acces au changement de statut (header vs sidebar)',
    DOCUMENTS: 'Supprimer les boutons de workflow en CardFooter (deja dans le dropdown header)',
    INCIDENTS: 'Centraliser les actions dans le header uniquement',
    DASHBOARD: 'Consolider les widgets dupliques (activite + notifications)',
  },
};

function frictionToInsight(signal: FrictionSignal): UXInsight {
  const recs = RECOMMENDATIONS[signal.type] || {};
  const recommendation = recs[signal.module] || 'Analyser le flow utilisateur de ce module';

  return {
    id: signal.id,
    severity: signal.severity,
    type: signal.type,
    module: signal.module,
    description: signal.description,
    recommendation,
    confidence: signal.confidence,
    metrics: signal.metrics,
  };
}

/**
 * Generate all UX insights from current telemetry data.
 * Runs friction detection on all modules, converts to insights,
 * sorts by severity + confidence, caps per module.
 */
export function generateInsights(): UXInsight[] {
  const modules: TelemetryModule[] = ['TICKETS', 'DOCUMENTS', 'INCIDENTS', 'DASHBOARD'];
  const allInsights: UXInsight[] = [];

  for (const moduleName of modules) {
    const metrics = metricsStore.getModuleMetrics(moduleName);
    if (metrics.totalActions === 0) continue;

    const frictions = detectFrictions(metrics);
    const insights = frictions.map(frictionToInsight);

    // Sort by severity (HIGH first) then confidence
    insights.sort((a, b) => {
      const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      const aDelta = severityOrder[a.severity];
      const bDelta = severityOrder[b.severity];
      if (aDelta !== bDelta) return aDelta - bDelta;
      return b.confidence - a.confidence;
    });

    allInsights.push(...insights.slice(0, MAX_INSIGHTS_PER_MODULE));
  }

  return allInsights;
}
