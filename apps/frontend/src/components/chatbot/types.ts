/**
 * Types partagés pour les sous-composants du chatbot RAG (modale Ctrl+Shift+K).
 *
 * Extraits depuis `ai-search-modal.tsx` pour permettre la réutilisation
 * et les tests unitaires des composants isolés.
 */

export type RagSourceType =
  | 'DOCUMENT'
  | 'WIKI'
  | 'PROCEDURE'
  | 'RUNBOOK'
  | 'FAQ';

/**
 * Citation retournée par le backend RAG.
 * `title` et `classification` sont optionnels car non systématiquement exposés
 * par tous les endpoints (rétro-compatibilité).
 */
export interface RagCitation {
  sourceType: RagSourceType;
  sourceId: string;
  chunkIndex: number;
  snippet: string;
  score: number;
  title?: string;
  classification?: 'PUBLIC' | 'INTERNE' | 'CONFIDENTIEL' | 'SECRET';
}

/**
 * Catégories standardisées pour le feedback négatif (Feature 4).
 * Reprises dans `feedback-validation.ts`.
 */
export type FeedbackReason =
  | 'incorrecte'
  | 'manquante'
  | 'hors_sujet'
  | 'trop_long'
  | 'trop_court'
  | 'erreurs_factuelles'
  | 'autre';

export interface FeedbackPayload {
  reason: FeedbackReason;
  comment?: string;
}

/**
 * Catégorisation des erreurs côté UX. Permet d'afficher des CTAs contextuels
 * (Feature 6). Calculée côté client à partir du code HTTP / nature de l'erreur.
 */
export type ChatbotErrorKind =
  | 'confidence_low'
  | 'ollama_timeout'
  | 'rbac_filtered'
  | 'rate_limit'
  | 'aborted'
  | 'network'
  | 'unknown';

export interface ChatbotError {
  kind: ChatbotErrorKind;
  /** Message lisible par l'utilisateur (déjà traduit, en français). */
  message: string;
  /** Message technique pour debug (ne pas afficher brut). */
  technical?: string;
}
