/**
 * Validation pure (sans React) du formulaire de feedback négatif.
 *
 * Utilisé à la fois par `feedback-panel.tsx` (UI) et par les tests unitaires
 * (`__tests__/feedback-validation.test.ts`).
 *
 * Règles :
 * - `reason` obligatoire, doit appartenir à la liste blanche.
 * - `comment` optionnel, tronqué à 500 caractères max (hard limit).
 * - `comment` obligatoire UNIQUEMENT si `reason === 'autre'` (≥ 3 chars).
 */

import type { FeedbackPayload, FeedbackReason } from './types';

export const FEEDBACK_REASONS: ReadonlyArray<{
  value: FeedbackReason;
  label: string;
}> = [
  { value: 'incorrecte', label: 'Réponse incorrecte' },
  { value: 'manquante', label: 'Information manquante' },
  { value: 'hors_sujet', label: 'Hors sujet' },
  { value: 'trop_long', label: 'Trop long' },
  { value: 'trop_court', label: 'Trop court' },
  { value: 'erreurs_factuelles', label: 'Erreurs factuelles' },
  { value: 'autre', label: 'Autre (précisez)' },
];

export const COMMENT_MAX_LENGTH = 500;
export const COMMENT_MIN_FOR_OTHER = 3;

const VALID_REASONS: ReadonlySet<string> = new Set(
  FEEDBACK_REASONS.map((r) => r.value),
);

export interface FeedbackValidationResult {
  valid: boolean;
  /** Payload nettoyé (comment trim + tronqué) — uniquement si valid. */
  payload?: FeedbackPayload;
  /** Code d'erreur stable (pour tests / i18n). */
  errorCode?:
    | 'REASON_REQUIRED'
    | 'REASON_INVALID'
    | 'COMMENT_TOO_LONG'
    | 'COMMENT_REQUIRED_FOR_OTHER';
  /** Message utilisateur (français). */
  errorMessage?: string;
}

export function validateFeedback(input: {
  reason: string | null | undefined;
  comment?: string | null;
}): FeedbackValidationResult {
  const { reason } = input;
  const comment = (input.comment ?? '').trim();

  if (!reason) {
    return {
      valid: false,
      errorCode: 'REASON_REQUIRED',
      errorMessage: 'Veuillez sélectionner une raison.',
    };
  }

  if (!VALID_REASONS.has(reason)) {
    return {
      valid: false,
      errorCode: 'REASON_INVALID',
      errorMessage: 'Raison invalide.',
    };
  }

  if (comment.length > COMMENT_MAX_LENGTH) {
    return {
      valid: false,
      errorCode: 'COMMENT_TOO_LONG',
      errorMessage: `Le commentaire est limité à ${COMMENT_MAX_LENGTH} caractères.`,
    };
  }

  if (reason === 'autre' && comment.length < COMMENT_MIN_FOR_OTHER) {
    return {
      valid: false,
      errorCode: 'COMMENT_REQUIRED_FOR_OTHER',
      errorMessage: 'Merci de préciser votre retour (3 caractères minimum).',
    };
  }

  return {
    valid: true,
    payload: {
      reason: reason as FeedbackReason,
      comment: comment.length > 0 ? comment : undefined,
    },
  };
}

/**
 * Sérialise un payload feedback dans la colonne `feedback: String?` de
 * `RagQueryLog`. On utilise JSON (plutôt qu'une nouvelle colonne `reason`)
 * pour éviter une migration Prisma et rester retro-compatible : si la
 * chaîne n'est pas du JSON, le backend peut toujours la lire comme texte.
 */
export function serializeFeedback(payload: FeedbackPayload): string {
  return JSON.stringify({
    reason: payload.reason,
    comment: payload.comment ?? '',
    v: 1,
  });
}
