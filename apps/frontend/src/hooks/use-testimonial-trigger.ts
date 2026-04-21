'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';

/**
 * Trigger discret pour inviter les collaborateurs à laisser un témoignage
 * après une action positive (ticket résolu rapidement, document approuvé,
 * quiz 100 %, etc.).
 *
 * Stratégie « zéro harcèlement » :
 *   - Cooldown de 90 j après une soumission (testimonial_last_submitted)
 *   - Cooldown de 30 j si l'utilisateur a cliqué "Plus tard" (last_asked)
 *   - Bouton "Ne plus me demander" → flag permanent never_again = true
 *   - Probabilité de déclenchement = 1 / 5 (on ne spam pas à chaque action)
 *   - Toast non-bloquant (sonner) avec 3 actions claires
 *
 * Usage (depuis n'importe quelle page "action positive") :
 *
 *   const { maybePrompt } = useTestimonialTrigger();
 *   // Après close-ticket / doc-approved / quiz-perfect :
 *   maybePrompt('ticket_closed_fast');
 *
 * Le paramètre `reason` est seulement utilisé pour les logs / analytics
 * futures ; il n'influe pas sur la décision de prompt.
 */

const STORAGE_LAST_ASKED = 'testimonial_last_asked';
const STORAGE_LAST_SUBMITTED = 'testimonial_last_submitted';
const STORAGE_NEVER_AGAIN = 'testimonial_never_again';
const DAY_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_AFTER_ASK_DAYS = 30;
const COOLDOWN_AFTER_SUBMIT_DAYS = 90;
const TRIGGER_PROBABILITY = 1 / 5; // 20 % des actions éligibles

function hasCooldownPassed(storageKey: string, days: number): boolean {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return true;
    const lastMs = Date.parse(raw);
    if (Number.isNaN(lastMs)) return true;
    return Date.now() - lastMs > days * DAY_MS;
  } catch {
    return true;
  }
}

function markLastAsked() {
  try { localStorage.setItem(STORAGE_LAST_ASKED, new Date().toISOString()); } catch { /* ignore */ }
}

export function useTestimonialTrigger() {
  const maybePrompt = useCallback((reason: string) => {
    if (typeof window === 'undefined') return;

    // 1. Flag "ne plus me demander" → respect strict
    try {
      if (localStorage.getItem(STORAGE_NEVER_AGAIN) === '1') return;
    } catch { /* ignore */ }

    // 2. Cooldowns
    if (!hasCooldownPassed(STORAGE_LAST_SUBMITTED, COOLDOWN_AFTER_SUBMIT_DAYS)) return;
    if (!hasCooldownPassed(STORAGE_LAST_ASKED, COOLDOWN_AFTER_ASK_DAYS)) return;

    // 3. Random 1/5
    if (Math.random() > TRIGGER_PROBABILITY) return;

    // 4. Enregistre "asked now" AVANT d'afficher pour éviter double-prompt
    markLastAsked();

    // 5. Log dans la console en dev (peut devenir un ping analytics plus tard)
    if (process.env.NODE_ENV === 'development') {

      console.info('[testimonial-trigger] prompting user after positive action:', reason);
    }

    // 6. Affiche le toast non-bloquant
    toast(
      'Merci d\'utiliser l\'intranet ! Voulez-vous partager votre expérience ?',
      {
        description: 'Une phrase courte suffit — votre retour motive les autres et nourrit les prochaines améliorations.',
        duration: 15000,
        action: {
          label: 'Partager',
          onClick: () => {
            window.location.href = '/testimonials';
          },
        },
        cancel: {
          label: 'Plus tard',
          onClick: () => {
            // cooldown 30j = déjà marqué par markLastAsked()
          },
        },
      },
    );

    // 7. Bouton "Ne plus me demander" : on le met comme action secondaire
    //    via un second toast minuté après 1s (ou le user peut juste ignorer)
    setTimeout(() => {
      toast('Vous préférez ne plus être sollicité ?', {
        duration: 8000,
        action: {
          label: 'Ne plus me demander',
          onClick: () => {
            try { localStorage.setItem(STORAGE_NEVER_AGAIN, '1'); } catch { /* ignore */ }
            toast.success('D\'accord — nous ne vous solliciterons plus.');
          },
        },
      });
    }, 1000);
  }, []);

  /** Appelé après qu'un témoignage vient d'être soumis avec succès. */
  const markSubmitted = useCallback(() => {
    try { localStorage.setItem(STORAGE_LAST_SUBMITTED, new Date().toISOString()); } catch { /* ignore */ }
  }, []);

  /** Appelé si l'utilisateur active "ne plus me demander" depuis un autre contexte. */
  const setNeverAgain = useCallback((value: boolean) => {
    try {
      if (value) localStorage.setItem(STORAGE_NEVER_AGAIN, '1');
      else localStorage.removeItem(STORAGE_NEVER_AGAIN);
    } catch { /* ignore */ }
  }, []);

  return { maybePrompt, markSubmitted, setNeverAgain };
}
