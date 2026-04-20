'use client';

/**
 * FeedbackPanel — Feature 4.
 *
 * Panneau inline qui apparaît au clic sur 👎. Demande une raison parmi 7
 * catégories standardisées + textarea commentaire libre (max 500 chars).
 *
 * Validation déléguée à `feedback-validation.ts` (testé unitairement).
 * Sérialisation JSON dans le champ `feedback` existant de `RagQueryLog` —
 * pas de migration Prisma requise (cf. justification dans le commit).
 */

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  COMMENT_MAX_LENGTH,
  FEEDBACK_REASONS,
  serializeFeedback,
  validateFeedback,
} from './feedback-validation';
import type { FeedbackReason } from './types';

interface FeedbackPanelProps {
  /**
   * Callback appelé avec le `feedback` sérialisé (JSON string) prêt à être
   * envoyé au backend. La responsabilité du POST reste au parent — ce
   * composant est purement UI + validation.
   */
  onSubmit: (feedback: string) => Promise<void> | void;
  /** Fermeture sans envoi. */
  onCancel: () => void;
}

export function FeedbackPanel({ onSubmit, onCancel }: FeedbackPanelProps) {
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [thankYou, setThankYou] = useState(false);
  const firstRadioRef = useRef<HTMLInputElement>(null);
  const groupId = useId();

  // Focus le premier radio à l'ouverture
  useEffect(() => {
    firstRadioRef.current?.focus();
  }, []);

  // Escape ferme le panneau
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, submitting]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const result = validateFeedback({ reason, comment });
      if (!result.valid) {
        setError(result.errorMessage ?? 'Formulaire invalide.');
        return;
      }
      setError(null);
      setSubmitting(true);
      try {
        await onSubmit(serializeFeedback(result.payload!));
        setThankYou(true);
        // Auto-close after a thank-you flash
        setTimeout(() => {
          onCancel();
        }, 1800);
      } catch {
        setError('Envoi impossible. Merci de réessayer.');
      } finally {
        setSubmitting(false);
      }
    },
    [reason, comment, onSubmit, onCancel],
  );

  if (thankYou) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400 animate-in fade-in duration-200"
      >
        Merci pour votre retour — il nous aide à améliorer l&apos;assistant.
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-800/50 animate-in fade-in slide-in-from-top-2 duration-150"
      aria-labelledby={`${groupId}-title`}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          id={`${groupId}-title`}
          className="text-xs font-semibold text-seal-navy dark:text-white"
        >
          Qu&apos;est-ce qui n&apos;allait pas ?
        </p>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-slate-700 dark:hover:text-slate-200 disabled:cursor-not-allowed"
          aria-label="Fermer le formulaire de feedback"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <fieldset className="mt-2" role="radiogroup" aria-labelledby={`${groupId}-title`}>
        <legend className="sr-only">Choisissez une raison</legend>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {FEEDBACK_REASONS.map((r, i) => (
            <label
              key={r.value}
              className="inline-flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs text-seal-navy hover:bg-white dark:text-slate-100 dark:hover:bg-slate-900"
            >
              <input
                ref={i === 0 ? firstRadioRef : undefined}
                type="radio"
                name={`${groupId}-reason`}
                value={r.value}
                checked={reason === r.value}
                onChange={() => {
                  setReason(r.value);
                  setError(null);
                }}
                disabled={submitting}
                className="h-3 w-3 accent-seal-blue"
                aria-label={r.label}
              />
              <span>{r.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-2 block">
        <span className="sr-only">Commentaire libre</span>
        <textarea
          value={comment}
          onChange={(e) => {
            setComment(e.target.value.slice(0, COMMENT_MAX_LENGTH));
            setError(null);
          }}
          disabled={submitting}
          placeholder={
            reason === 'autre'
              ? 'Précisez votre retour (obligatoire)…'
              : 'Commentaire libre (facultatif)…'
          }
          rows={2}
          maxLength={COMMENT_MAX_LENGTH}
          className="w-full resize-none rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-seal-navy placeholder:text-gray-400 focus:border-seal-blue focus:outline-none focus:ring-1 focus:ring-seal-blue/40 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
          aria-label="Commentaire libre sur la réponse"
        />
        <div className="mt-0.5 flex items-center justify-between">
          <span className="text-[10px] text-gray-400 dark:text-slate-500">
            {comment.length}/{COMMENT_MAX_LENGTH}
          </span>
          {error && (
            <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
              {error}
            </span>
          )}
        </div>
      </label>

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:text-slate-400 dark:hover:bg-slate-700 disabled:cursor-not-allowed"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={submitting || !reason}
          className="rounded-md bg-seal-blue px-2.5 py-1 text-xs font-semibold text-white hover:bg-seal-blue/90 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-seal-blue/40"
        >
          {submitting ? 'Envoi…' : 'Envoyer'}
        </button>
      </div>
    </form>
  );
}
