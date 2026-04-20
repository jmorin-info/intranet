/**
 * Logique pure de manipulation de citations RAG (sans React).
 *
 * Utilisée par `citation-chip.tsx` et les tests unitaires
 * (`__tests__/citation-parser.test.ts`).
 */

import type { RagCitation, RagSourceType } from './types';

export const SOURCE_LABEL: Record<RagSourceType, string> = {
  DOCUMENT: 'Document',
  WIKI: 'Wiki',
  PROCEDURE: 'Procédure',
  RUNBOOK: 'Runbook',
  FAQ: 'FAQ',
};

export const SOURCE_ROUTE: Record<RagSourceType, (id: string) => string> = {
  DOCUMENT: (id) => `/documents/${id}`,
  WIKI: (id) => `/wiki/${id}`,
  PROCEDURE: (id) => `/procedures/${id}`,
  RUNBOOK: (id) => `/runbooks/${id}`,
  FAQ: (id) => `/helpdesk/faq/${id}`,
};

/**
 * Tronque un snippet à une fenêtre 100-150 caractères,
 * en coupant sur un espace si possible (pas au milieu d'un mot).
 *
 * Contrat :
 *  - snippet <= `min` chars   → retourné tel quel
 *  - snippet entre min et max → retourné tel quel
 *  - snippet > `max` chars    → tronqué sur le dernier espace avant `max`,
 *                               suivi de "…"
 */
export function truncateSnippet(
  snippet: string,
  min = 100,
  max = 150,
): string {
  const s = (snippet ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;

  // Coupe sur le dernier espace entre min et max pour ne pas couper un mot.
  const slice = s.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace >= min ? lastSpace : max;
  return s.slice(0, cut).trimEnd() + '…';
}

/**
 * Score 0..1 → label + couleur Tailwind (+ dark mode).
 * Seuils cohérents avec `confidenceLabel` historique du modal.
 */
export function scoreToConfidence(score: number): {
  percent: number;
  label: string;
  tone: 'high' | 'medium' | 'low';
} {
  const percent = Math.max(0, Math.min(100, Math.round(score * 100)));
  if (percent >= 70) return { percent, label: 'élevée', tone: 'high' };
  if (percent >= 40) return { percent, label: 'moyenne', tone: 'medium' };
  return { percent, label: 'faible', tone: 'low' };
}

/**
 * Retourne un titre lisible pour la citation (fallback : SOURCE_LABEL + #id court).
 */
export function citationTitle(c: RagCitation): string {
  if (c.title && c.title.trim()) return c.title.trim();
  const shortId = c.sourceId.slice(0, 8);
  return `${SOURCE_LABEL[c.sourceType]} ${shortId}`;
}

/**
 * Construit le markdown de la réponse complète à copier dans le presse-papier
 * (Feature 2). Inclut réponse, citations numérotées avec liens et métadonnées.
 */
export function buildCopyMarkdown(params: {
  question: string;
  answer: string;
  sources: RagCitation[];
  confidencePercent?: number | null;
}): string {
  const { question, answer, sources, confidencePercent } = params;

  const citationsBlock =
    sources.length === 0
      ? ''
      : '\n\n---\n\n**Sources**\n\n' +
        sources
          .map((s, i) => {
            const title = citationTitle(s);
            const route = SOURCE_ROUTE[s.sourceType](s.sourceId);
            return `${i + 1}. [${SOURCE_LABEL[s.sourceType]} — ${title}](${route})`;
          })
          .join('\n');

  const meta =
    confidencePercent != null
      ? `\n\n_Confiance retrieval : ${confidencePercent}%_`
      : '';

  return `> ${question}\n\n${answer.trim()}${citationsBlock}${meta}\n`;
}
