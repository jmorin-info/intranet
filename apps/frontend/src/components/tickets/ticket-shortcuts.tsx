"use client";

/**
 * TicketShortcutsModal — overlay d'aide listant les raccourcis tickets.
 *
 * Hook `useTicketShortcuts` à monter au niveau de la liste tickets :
 *   - `c` : créer un nouveau ticket (modale)
 *   - `j/k` : naviguer dans la liste (focus next/prev)
 *   - `Enter` : ouvrir le ticket focusé
 *   - `e` : assigner à moi le ticket focusé
 *   - `r` : marquer résolu le ticket focusé
 *   - `?` : ouvrir cette modale d'aide
 *
 * Le hook ignore les raccourcis quand le focus est dans un input/textarea
 * (cf. isEditableTarget). Il appelle les callbacks fournis par le parent —
 * pas de logique métier ici.
 */

import React, { useEffect, useState } from "react";
import { X, Keyboard } from "lucide-react";

interface UseTicketShortcutsOptions {
  /** Crée un nouveau ticket (`c`). */
  onCreate?: () => void;
  /** Ouvre le ticket focusé (`Enter`). */
  onOpenFocused?: () => void;
  /** Assigne à moi le ticket focusé (`e`). */
  onAssignToMe?: () => void;
  /** Marque résolu le ticket focusé (`r`). */
  onMarkResolved?: () => void;
  /** Focus next ticket (`j`). */
  onFocusNext?: () => void;
  /** Focus previous ticket (`k`). */
  onFocusPrev?: () => void;
  /** Désactivation globale (modal de création ouverte par exemple). */
  disabled?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Hook clavier pour la liste tickets. Retourne `[helpOpen, setHelpOpen]`
 * — la modale d'aide est gérée par `TicketShortcutsModal`.
 */
export function useTicketShortcuts({
  onCreate,
  onOpenFocused,
  onAssignToMe,
  onMarkResolved,
  onFocusNext,
  onFocusPrev,
  disabled = false,
}: UseTicketShortcutsOptions): [boolean, (b: boolean) => void] {
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (disabled) return;
    function handler(e: KeyboardEvent) {
      // Ignore inside form controls
      if (isEditableTarget(e.target)) return;
      // Modifier keys reset our scope (let global shortcuts handle them)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const k = e.key;
      // `?` - help modal toggle
      if (k === "?" || (k === "/" && e.shiftKey)) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      // Escape closes help modal
      if (k === "Escape" && helpOpen) {
        setHelpOpen(false);
        return;
      }

      // Skip if help open
      if (helpOpen) return;

      switch (k.toLowerCase()) {
        case "c":
          if (onCreate) {
            e.preventDefault();
            onCreate();
          }
          break;
        case "j":
          if (onFocusNext) {
            e.preventDefault();
            onFocusNext();
          }
          break;
        case "k":
          if (onFocusPrev) {
            e.preventDefault();
            onFocusPrev();
          }
          break;
        case "enter":
          if (onOpenFocused) {
            e.preventDefault();
            onOpenFocused();
          }
          break;
        case "e":
          if (onAssignToMe) {
            e.preventDefault();
            onAssignToMe();
          }
          break;
        case "r":
          if (onMarkResolved) {
            e.preventDefault();
            onMarkResolved();
          }
          break;
        default:
          break;
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    disabled,
    helpOpen,
    onCreate,
    onOpenFocused,
    onAssignToMe,
    onMarkResolved,
    onFocusNext,
    onFocusPrev,
  ]);

  return [helpOpen, setHelpOpen];
}

interface TicketShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: Array<{ keys: string[]; description: string }> = [
  { keys: ["c"], description: "Créer un nouveau ticket" },
  { keys: ["j"], description: "Sélectionner le ticket suivant" },
  { keys: ["k"], description: "Sélectionner le ticket précédent" },
  { keys: ["Enter"], description: "Ouvrir le ticket sélectionné" },
  { keys: ["e"], description: "M'assigner le ticket sélectionné" },
  { keys: ["r"], description: "Marquer le ticket comme résolu" },
  { keys: ["?"], description: "Afficher cette aide" },
];

export function TicketShortcutsModal({
  open,
  onClose,
}: TicketShortcutsModalProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Raccourcis clavier tickets"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto"
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-seal-navy dark:text-white flex items-center gap-2">
            <Keyboard className="h-4 w-4" />
            Raccourcis clavier
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-seal-gray-500 dark:text-slate-400"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-4 space-y-2">
          {SHORTCUTS.map((s) => (
            <div
              key={s.keys.join("+")}
              className="flex items-center justify-between gap-4 py-1"
            >
              <span className="text-sm text-seal-navy dark:text-slate-200 flex-1">
                {s.description}
              </span>
              <span className="flex items-center gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="inline-flex items-center px-2 py-1 rounded border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 text-[11px] font-mono text-seal-navy dark:text-slate-100 shadow-sm"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
        <footer className="p-3 border-t border-gray-200 dark:border-slate-700 text-[11px] text-seal-gray-500 dark:text-slate-500">
          Les raccourcis sont désactivés dans les champs de saisie.
        </footer>
      </div>
    </div>
  );
}
