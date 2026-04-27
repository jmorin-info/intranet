"use client";

/**
 * EditorPreview — split-view live preview pour le rich text editor.
 *
 * Usage : enrobe `<RichTextEditor>` côté gauche, panneau de rendu HTML côté
 * droit (ou en dessous selon le `mode`). Le rendu est sanitizé via DOMPurify
 * et debouncé à 200ms pour éviter le thrash sur les longs articles.
 *
 * Le mode (split-h | split-v | preview-only | edit-only) est piloté par le
 * parent et persisté dans localStorage côté parent — ce composant reste
 * stateless pour faciliter les tests.
 */

import React, { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { Eye, Edit3, Columns2, Rows2 } from "lucide-react";

export type EditorPreviewMode =
  | "edit-only"
  | "split-h"
  | "split-v"
  | "preview-only";

export const EDITOR_PREVIEW_STORAGE_KEY = "editor.previewMode";

interface EditorPreviewProps {
  /** HTML courant (provenant de l'éditeur). */
  html: string;
  /** Mode actif. */
  mode: EditorPreviewMode;
  /** Children = éditeur (RichTextEditor). */
  children: React.ReactNode;
  /** Appelé quand l'utilisateur change le mode. */
  onModeChange?: (next: EditorPreviewMode) => void;
  /** Délai (ms) avant de rafraîchir le preview après une frappe. Défaut 200ms. */
  debounceMs?: number;
}

export function EditorPreview({
  html,
  mode,
  children,
  onModeChange,
  debounceMs = 200,
}: EditorPreviewProps) {
  const [debouncedHtml, setDebouncedHtml] = useState(html);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedHtml(html), debounceMs);
    return () => window.clearTimeout(id);
  }, [html, debounceMs]);

  const sanitized = DOMPurify.sanitize(debouncedHtml || "", {
    USE_PROFILES: { html: true },
  });

  const isEditOnly = mode === "edit-only";
  const isPreviewOnly = mode === "preview-only";
  const isSplit = mode === "split-h" || mode === "split-v";

  const containerClass =
    mode === "split-v"
      ? "flex flex-col gap-4"
      : mode === "split-h"
        ? "grid grid-cols-1 lg:grid-cols-2 gap-4"
        : "block";

  return (
    <div className="space-y-2">
      {onModeChange && (
        <div
          role="toolbar"
          aria-label="Aperçu de l'éditeur"
          className="flex items-center gap-1 text-[11px] font-medium"
        >
          <ModeBtn
            active={isEditOnly}
            onClick={() => onModeChange("edit-only")}
            title="Édition seule"
          >
            <Edit3 className="h-3.5 w-3.5" />
            Éditer
          </ModeBtn>
          <ModeBtn
            active={mode === "split-h"}
            onClick={() => onModeChange("split-h")}
            title="Vue partagée horizontale"
          >
            <Columns2 className="h-3.5 w-3.5" />
            Split H
          </ModeBtn>
          <ModeBtn
            active={mode === "split-v"}
            onClick={() => onModeChange("split-v")}
            title="Vue partagée verticale"
          >
            <Rows2 className="h-3.5 w-3.5" />
            Split V
          </ModeBtn>
          <ModeBtn
            active={isPreviewOnly}
            onClick={() => onModeChange("preview-only")}
            title="Aperçu seul"
          >
            <Eye className="h-3.5 w-3.5" />
            Aperçu
          </ModeBtn>
        </div>
      )}

      <div className={containerClass}>
        {!isPreviewOnly && (
          <div className={isSplit ? "min-w-0" : ""}>{children}</div>
        )}
        {(isPreviewOnly || isSplit) && (
          <div
            className="min-w-0 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 overflow-auto"
            aria-label="Aperçu du contenu"
          >
            <div
              className="wiki-content max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitized }}
            />
            {!sanitized && (
              <p className="text-xs text-seal-gray-500 dark:text-slate-500 italic">
                L'aperçu apparaîtra ici dès que vous taperez du contenu.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded ${
        active
          ? "bg-primary text-white"
          : "bg-gray-50 dark:bg-slate-800 text-seal-navy dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Hook utilitaire pour persister le mode dans localStorage.
 */
export function useEditorPreviewMode(
  defaultMode: EditorPreviewMode = "edit-only",
): [EditorPreviewMode, (next: EditorPreviewMode) => void] {
  const [mode, setMode] = useState<EditorPreviewMode>(defaultMode);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(EDITOR_PREVIEW_STORAGE_KEY);
      if (stored && isValidMode(stored)) setMode(stored);
    } catch {
      /* noop */
    }
  }, []);

  const persist = (next: EditorPreviewMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(EDITOR_PREVIEW_STORAGE_KEY, next);
    } catch {
      /* noop */
    }
  };

  return [mode, persist];
}

function isValidMode(s: string): s is EditorPreviewMode {
  return (
    s === "edit-only" ||
    s === "split-h" ||
    s === "split-v" ||
    s === "preview-only"
  );
}
