'use client';

/**
 * EmptyState — Feature 6 du polish RAG.
 *
 * État vide initial de la modale :
 *  - Phrase d'accroche
 *  - 4-6 questions suggérées adaptées au département de l'user
 *  - Bouton « Que puis-je demander ? » qui déplie un mini tutoriel (5 tips)
 */

import React, { useState } from 'react';
import { Sparkles, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import {
  getSuggestionsForDepartment,
  TUTORIAL_TIPS,
  type SuggestedQuestion,
} from './suggestions';

interface EmptyStateProps {
  /** Nom du département de l'utilisateur (libre — matching permissif). */
  departmentName?: string | null;
  /** Prénom pour personnaliser l'accroche. */
  firstName?: string | null;
  onPick: (question: string) => void;
}

export function EmptyState({ departmentName, firstName, onPick }: EmptyStateProps) {
  const [showTutorial, setShowTutorial] = useState(false);
  const suggestions: SuggestedQuestion[] = getSuggestionsForDepartment(departmentName);
  const greeting = firstName ? `Bonjour ${firstName}` : 'Bonjour';

  return (
    <div className="px-5 py-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-seal-blue/10 text-seal-blue dark:bg-seal-blue/20">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-navy dark:text-white">
            {greeting}, que puis-je chercher pour vous ?
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
            Posez une question en langage naturel — je fouille documents, wikis,
            procédures, runbooks et FAQ, en respectant vos habilitations.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs uppercase font-semibold text-taupe">
          Questions suggérées
          {departmentName && (
            <span className="ml-1 normal-case text-gray-400 dark:text-slate-500">
              · {departmentName}
            </span>
          )}
        </p>
        <ul className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <li key={s.question}>
              <button
                type="button"
                onClick={() => onPick(s.question)}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-navy hover:border-seal-blue hover:bg-seal-blue/5 hover:text-seal-blue dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-seal-blue dark:hover:bg-seal-blue/10 transition-colors focus:outline-none focus:ring-2 focus:ring-seal-blue/40"
                aria-label={`Poser la question : ${s.question}`}
                title={s.question}
              >
                <Sparkles className="h-3 w-3 text-seal-orange" aria-hidden="true" />
                <span>{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowTutorial((v) => !v)}
          aria-expanded={showTutorial}
          aria-controls="chatbot-tutorial"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-seal-blue hover:bg-seal-blue/10 dark:hover:bg-seal-blue/20 transition-colors focus:outline-none focus:ring-2 focus:ring-seal-blue/40"
        >
          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
          Que puis-je demander&nbsp;?
          {showTutorial ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>

        {showTutorial && (
          <div
            id="chatbot-tutorial"
            className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/50 animate-in fade-in slide-in-from-top-2 duration-150"
          >
            <ul className="space-y-2">
              {TUTORIAL_TIPS.map((tip) => (
                <li key={tip.title} className="text-xs text-navy dark:text-slate-100">
                  <strong className="text-seal-blue">{tip.title}.</strong>{' '}
                  <span className="text-gray-600 dark:text-slate-400">{tip.detail}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
