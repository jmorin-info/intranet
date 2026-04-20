'use client';

/**
 * ErrorState — Feature 6 du polish RAG.
 *
 * Affiche une erreur actionnable avec CTAs contextuels selon le type :
 *  - confidence_low → [Réessayer, Reformuler, Contacter IT]
 *  - ollama_timeout → [Réessayer, Créer un ticket]
 *  - rbac_filtered  → [Contacter RSSI]
 *  - rate_limit     → [Réessayer dans 1 min]
 *  - aborted        → [Réessayer]
 *  - network        → [Vérifier connexion, Réessayer]
 *  - unknown        → [Réessayer, Créer un ticket]
 */

import React from 'react';
import {
  AlertTriangle,
  Ban,
  Clock,
  ShieldAlert,
  WifiOff,
  HelpCircle,
  Info,
} from 'lucide-react';
import { ctaTargetsForError } from './error-classifier';
import type { ChatbotError, ChatbotErrorKind } from './types';

type ActionKind = 'retry' | 'rephrase' | 'ticket' | 'contact_it' | 'contact_rssi' | 'dismiss';

interface ErrorStateProps {
  error: ChatbotError;
  onAction: (action: ActionKind) => void;
}

const ICONS: Record<ChatbotErrorKind, React.ElementType> = {
  confidence_low: Info,
  ollama_timeout: Clock,
  rbac_filtered: ShieldAlert,
  rate_limit: AlertTriangle,
  aborted: Ban,
  network: WifiOff,
  unknown: HelpCircle,
};

const TONE: Record<ChatbotErrorKind, string> = {
  confidence_low:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
  ollama_timeout:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
  rbac_filtered:
    'border-seal-bordeaux/30 bg-seal-bordeaux/5 text-seal-bordeaux dark:border-seal-bordeaux/50 dark:bg-seal-bordeaux/10 dark:text-red-300',
  rate_limit:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300',
  aborted:
    'border-gray-200 bg-gray-50 text-gray-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300',
  network:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300',
  unknown:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300',
};

export function ErrorState({ error, onAction }: ErrorStateProps) {
  const Icon = ICONS[error.kind] ?? HelpCircle;
  const ctas = ctaTargetsForError(error.kind);
  const toneClass = TONE[error.kind] ?? TONE.unknown;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`mx-5 my-4 flex items-start gap-3 rounded-lg border px-3 py-3 ${toneClass}`}
    >
      <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{error.message}</p>
        {ctas.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {ctas.map((cta) => (
              <button
                key={cta.action}
                type="button"
                onClick={() => onAction(cta.action)}
                className="inline-flex items-center rounded-md border border-current/20 bg-white/60 px-2.5 py-1 text-xs font-semibold hover:bg-white dark:bg-slate-900/40 dark:hover:bg-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-current/30"
                aria-label={cta.label}
              >
                {cta.label}
              </button>
            ))}
          </div>
        )}
        {error.technical && process.env.NODE_ENV !== 'production' && (
          <p className="mt-1 text-[10px] font-mono opacity-60">{error.technical}</p>
        )}
      </div>
    </div>
  );
}
