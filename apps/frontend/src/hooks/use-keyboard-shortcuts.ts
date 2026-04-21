'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Raccourcis clavier globaux vim-like (séquences à 2 touches).
 *
 * Pattern : l'utilisateur tape `g` puis une lettre dans la fenêtre de 1500ms.
 * Ex. `g d` → /dashboard, `g t` → /tickets.
 *
 * Règles de désactivation :
 *   - Focus sur input / textarea / select / contenteditable → skip
 *   - Modifiers actifs (Ctrl/Cmd/Alt) → skip (réservés aux autres raccourcis)
 *   - Escape → réinitialise toute séquence en cours
 *
 * Shortcut `?` : ouvre la modal d'aide (délégué via callback onHelp).
 */

const SEQUENCE_TIMEOUT_MS = 1500;

export interface KeyboardShortcutEntry {
  /** Touche à presser après le préfixe `g`. */
  key: string;
  /** Libellé affiché dans la modal d'aide. */
  label: string;
  /** Chemin de destination (Next router.push). */
  href: string;
  /** Restriction optionnelle : si définie, la combinaison n'est active que si le prédicat retourne true. */
  enabled?: () => boolean;
}

export interface UseKeyboardShortcutsOptions {
  /** Liste des raccourcis séquentiels `g <key>`. */
  shortcuts: KeyboardShortcutEntry[];
  /** Callback déclenché quand l'utilisateur presse `?`. */
  onHelp?: () => void;
}

/**
 * Indique si l'élément actif est un champ de saisie (input, textarea, etc.).
 * On ne déclenche pas les raccourcis globaux dans ce contexte pour ne pas
 * interrompre la saisie de l'utilisateur.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.isContentEditable) return true;
  const role = target.getAttribute('role');
  if (role === 'textbox' || role === 'combobox' || role === 'searchbox') return true;
  return false;
}

export function useKeyboardShortcuts({ shortcuts, onHelp }: UseKeyboardShortcutsOptions): void {
  const router = useRouter();
  const pendingPrefixRef = useRef<NodeJS.Timeout | null>(null);
  const awaitingSecondKeyRef = useRef(false);

  useEffect(() => {
    function resetSequence() {
      awaitingSecondKeyRef.current = false;
      if (pendingPrefixRef.current) {
        clearTimeout(pendingPrefixRef.current);
        pendingPrefixRef.current = null;
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      // Désactivation globale sur champs de saisie
      if (isEditableTarget(e.target)) {
        resetSequence();
        return;
      }

      // Escape → reset toute séquence
      if (e.key === 'Escape') {
        resetSequence();
        return;
      }

      // `?` (sans modifier) → ouvre aide. Certains claviers : Shift+/
      if ((e.key === '?' || (e.key === '/' && e.shiftKey)) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        resetSequence();
        onHelp?.();
        return;
      }

      // Modifiers actifs → skip (réservé aux raccourcis Ctrl+*)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Phase 2 : l'utilisateur a déjà pressé `g` et on attend la seconde touche
      if (awaitingSecondKeyRef.current) {
        const matched = shortcuts.find((s) => s.key.toLowerCase() === e.key.toLowerCase());
        if (matched && (!matched.enabled || matched.enabled())) {
          e.preventDefault();
          resetSequence();
          router.push(matched.href);
          return;
        }
        // Séquence invalide → reset
        resetSequence();
        return;
      }

      // Phase 1 : préfixe `g`
      if (e.key.toLowerCase() === 'g') {
        awaitingSecondKeyRef.current = true;
        pendingPrefixRef.current = setTimeout(resetSequence, SEQUENCE_TIMEOUT_MS);
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      resetSequence();
    };
  }, [shortcuts, onHelp, router]);
}
