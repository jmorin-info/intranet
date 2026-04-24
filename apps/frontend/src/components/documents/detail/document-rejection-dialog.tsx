"use client";

import React from "react";
import { Button, Dialog, Textarea } from "@omnitech/ui";
import type { RejectionSuggestionsCatalog } from "./types";

interface DocumentRejectionDialogProps {
  mode: "reject-review" | "reject-direction" | null;
  comment: string;
  suggestions: Set<string>;
  catalog: RejectionSuggestionsCatalog | null;
  loading: boolean;
  onClose: () => void;
  onCommentChange: (v: string) => void;
  onSuggestionsChange: (v: Set<string>) => void;
  onConfirm: () => void;
}

export function DocumentRejectionDialog({
  mode,
  comment,
  suggestions,
  catalog,
  loading,
  onClose,
  onCommentChange,
  onSuggestionsChange,
  onConfirm,
}: DocumentRejectionDialogProps) {
  return (
    <Dialog
      open={!!mode}
      onClose={onClose}
      title={
        mode === "reject-review"
          ? "Rejeter la revue technique"
          : "Rejeter le document"
      }
      description="Indiquez le motif du refus et cochez les suggestions d'amélioration pour guider le rédacteur."
      className="max-w-3xl"
    >
      <div className="space-y-4">
        <Textarea
          label="Motif du refus (obligatoire, minimum 10 caractères)"
          placeholder="Ex: Le document ne couvre pas les contrôles ISO 27001 A.8.1 et A.8.2. Merci de compléter la section sur le contrôle d'accès avant de soumettre à nouveau."
          value={comment}
          onChange={(e) => onCommentChange(e.target.value)}
          className="min-h-[100px]"
        />
        {catalog && (
          <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-800/40 p-4 max-h-[320px] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-seal-navy dark:text-white">
                  Suggestions d&apos;amélioration
                </p>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
                  Cochez les points à retravailler. Le rédacteur les verra dans
                  sa notification.
                </p>
              </div>
              {suggestions.size > 0 && (
                <span className="text-xs font-semibold text-primary">
                  {suggestions.size} sélectionnée
                  {suggestions.size > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="space-y-3">
              {catalog.categories.map((cat) => (
                <div key={cat.name}>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-seal-gray-500 dark:text-slate-500 mb-2">
                    {cat.name}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {cat.items.map((item) => {
                      const checked = suggestions.has(item.key);
                      return (
                        <label
                          key={item.key}
                          className={`flex items-start gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors ${
                            checked
                              ? "bg-primary/10 border border-primary/30"
                              : "hover:bg-white dark:hover:bg-slate-800 border border-transparent"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = new Set(suggestions);
                              if (checked) next.delete(item.key);
                              else next.add(item.key);
                              onSuggestionsChange(next);
                            }}
                            className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <span
                            className={`text-xs leading-snug ${checked ? "text-seal-navy dark:text-white font-medium" : "text-seal-gray-500 dark:text-slate-400"}`}
                          >
                            {item.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-100 dark:border-slate-700">
          <p className="text-[11px] text-seal-gray-500 dark:text-slate-500">
            {comment.trim().length < 10
              ? `${10 - comment.trim().length} caractère(s) restant(s) avant validation`
              : "✓ Commentaire suffisant"}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Annuler
            </Button>
            <Button
              variant="danger"
              disabled={comment.trim().length < 10}
              loading={loading}
              onClick={onConfirm}
            >
              Rejeter avec suggestions
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
