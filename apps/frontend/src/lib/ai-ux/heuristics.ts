/**
 * AI UX Heuristics — Deterministic Pattern Detection Rules
 *
 * No ML. No external API. Pure behavioral rules.
 * Each heuristic is a function that examines the BehaviorProfile
 * and returns 0 or more AISuggestion candidates.
 */

import type { BehaviorProfile, AISuggestion } from './types';

type HeuristicFn = (
  profile: BehaviorProfile,
  activeModule: string,
) => AISuggestion[];

let idCounter = 0;
function nextId(): string {
  return `ai-sug-${++idCounter}-${Date.now()}`;
}

// ── Heuristic 1: Burst Mode Detection ────────────────────────────
// User performing >3 actions in 30s → suggest bulk operations

const burstModeHeuristic: HeuristicFn = (profile, activeModule) => {
  if (!profile.patterns.burstMode) return [];

  const suggestions: AISuggestion[] = [];

  if (activeModule === 'tickets') {
    suggestions.push({
      id: nextId(),
      type: 'BULK',
      label: 'Activer le mode selection groupee',
      confidence: 0.8,
      entity: 'TICKET',
      icon: 'CheckSquare',
      href: '/tickets',
    });
  }

  if (activeModule === 'documents') {
    suggestions.push({
      id: nextId(),
      type: 'BULK',
      label: 'Actions groupees sur documents',
      confidence: 0.75,
      entity: 'DOCUMENT',
      icon: 'Layers',
      href: '/documents',
    });
  }

  return suggestions;
};

// ── Heuristic 2: Repeated Status Changes ─────────────────────────
// >2 status changes recently → suggest a quicker path

const repeatedStatusHeuristic: HeuristicFn = (profile, activeModule) => {
  if (profile.patterns.repeatedStatusChanges < 2) return [];

  const suggestions: AISuggestion[] = [];

  if (activeModule === 'tickets' || profile.actionCounts['TICKET:STATUS_CHANGED']) {
    suggestions.push({
      id: nextId(),
      type: 'BULK',
      label: 'Clore les tickets resolus',
      confidence: 0.7,
      entity: 'TICKET',
      icon: 'CheckCircle2',
      href: '/tickets?status=RESOLVED',
    });
  }

  return suggestions;
};

// ── Heuristic 3: Context Switch Detection ────────────────────────
// Frequent module switches → show recently viewed entities

const contextSwitchHeuristic: HeuristicFn = (profile) => {
  if (profile.patterns.contextSwitchCount < 2) return [];

  const lastModules = profile.recentModules.slice(-3);
  if (lastModules.length < 2) return [];

  return [{
    id: nextId(),
    type: 'NAVIGATION',
    label: 'Entites recemment consultees',
    confidence: 0.65,
    icon: 'History',
    href: '/dashboard',
  }];
};

// ── Heuristic 4: Workflow Completion Chaining ────────────────────
// Document approved → suggest related actions

const workflowCompletionHeuristic: HeuristicFn = (profile, activeModule) => {
  const suggestions: AISuggestion[] = [];

  // Document approved recently → suggest reviewing pending queue
  const docApprovals = profile.actionCounts['DOCUMENT:APPROVED'] || 0;
  if (docApprovals > 0 && activeModule === 'documents') {
    suggestions.push({
      id: nextId(),
      type: 'ACTION',
      label: 'Continuer les validations',
      confidence: 0.85,
      entity: 'DOCUMENT',
      icon: 'ArrowRight',
      href: '/documents/pending',
    });
  }

  // Ticket created → suggest assigning it
  const ticketCreations = profile.actionCounts['TICKET:CREATED'] || 0;
  if (ticketCreations > 0 && activeModule === 'tickets') {
    suggestions.push({
      id: nextId(),
      type: 'ACTION',
      label: 'Assigner les nouveaux tickets',
      confidence: 0.7,
      entity: 'TICKET',
      icon: 'UserPlus',
      href: '/tickets?status=OPEN',
    });
  }

  // Incident status changed → suggest adding remediation
  const incidentChanges = profile.actionCounts['INCIDENT:STATUS_CHANGED'] || 0;
  if (incidentChanges > 0 && activeModule === 'incidents') {
    suggestions.push({
      id: nextId(),
      type: 'ACTION',
      label: 'Ajouter une remediation',
      confidence: 0.7,
      entity: 'INCIDENT',
      icon: 'ClipboardList',
    });
  }

  return suggestions;
};

// ── Heuristic 5: Module-Specific Defaults ────────────────────────
// When no behavioral patterns detected, show module-appropriate defaults

const moduleDefaultHeuristic: HeuristicFn = (_profile, activeModule) => {
  switch (activeModule) {
    case 'tickets':
      return [{
        id: nextId(),
        type: 'SHORTCUT',
        label: 'Creer un ticket',
        confidence: 0.5,
        entity: 'TICKET',
        icon: 'Plus',
        href: '/tickets?create=true',
      }];
    case 'documents':
      return [{
        id: nextId(),
        type: 'SHORTCUT',
        label: 'Nouveau document',
        confidence: 0.5,
        entity: 'DOCUMENT',
        icon: 'Plus',
        href: '/documents/new',
      }];
    case 'dashboard':
      return [{
        id: nextId(),
        type: 'NAVIGATION',
        label: 'Voir les actions en attente',
        confidence: 0.55,
        icon: 'ClipboardList',
        href: '/tickets?assigneeId=me',
      }];
    default:
      return [];
  }
};

// ── All Heuristics ───────────────────────────────────────────────

export const ALL_HEURISTICS: HeuristicFn[] = [
  burstModeHeuristic,
  repeatedStatusHeuristic,
  contextSwitchHeuristic,
  workflowCompletionHeuristic,
  moduleDefaultHeuristic,
];
