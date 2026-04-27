"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { Image as ImageIcon } from "lucide-react";

export interface RichTextEditorProps {
  /** HTML courant (contrôle externe). Le composant ne re-sync l'innerHTML que
      si la valeur change et que l'éditeur n'est pas focus (évite la perte du
      caret pendant la saisie). */
  value: string;
  onChange: (html: string) => void;
  /** Optionnel : handler pour le bouton image. Si absent, le bouton est masqué. */
  onImageButton?: () => void;
  /** Hauteur minimale du contentEditable. Défaut 200px. */
  minHeight?: number;
  /** Placeholder affiché quand l'éditeur est vide (empty HTML). */
  placeholder?: string;
  /** Classes supplémentaires sur le container root. */
  className?: string;
  /** Label accessible (sr-only) de l'éditeur. */
  ariaLabel?: string;
  disabled?: boolean;
  /**
   * Optional callback for Cmd/Ctrl+S (save). If provided, intercepts the
   * default browser "save page" behaviour and forwards a save event.
   */
  onSave?: () => void;
  /**
   * Optional callback for Cmd/Ctrl+K (insert link). Receives the currently
   * selected text. Parent should prompt for a URL and call insertLink.
   */
  onInsertLink?: (selectedText: string) => void;
  /**
   * Optional callback for Cmd/Ctrl+Shift+K (insert wiki link `[[`).
   */
  onInsertWikiLink?: () => void;
}

interface ToolbarItem {
  id: string;
  label: string;
  title: string;
  style?: string;
  action: (editor: HTMLDivElement) => void;
}

function buildToolbar(onImage?: () => void): ToolbarItem[] {
  const execInline =
    (cmd: string, arg = "") =>
    (el: HTMLDivElement) => {
      document.execCommand(cmd, false, arg);
      el.focus();
    };
  const insertBlock = (html: string) => (el: HTMLDivElement) => {
    document.execCommand("insertHTML", false, html);
    el.focus();
  };

  const items: ToolbarItem[] = [
    {
      id: "bold",
      label: "B",
      title: "Gras (Ctrl+B)",
      style: "font-semibold",
      action: execInline("bold"),
    },
    {
      id: "italic",
      label: "I",
      title: "Italique (Ctrl+I)",
      style: "italic",
      action: execInline("italic"),
    },
    {
      id: "h2",
      label: "H2",
      title: "Titre",
      style: "font-semibold",
      action: execInline("formatBlock", "H2"),
    },
    {
      id: "h3",
      label: "H3",
      title: "Sous-titre",
      style: "font-semibold",
      action: execInline("formatBlock", "H3"),
    },
    {
      id: "ul",
      label: "•",
      title: "Liste à puces",
      style: "font-semibold",
      action: execInline("insertUnorderedList"),
    },
    {
      id: "ol",
      label: "1.",
      title: "Liste numérotée",
      style: "font-semibold text-[11px]",
      action: execInline("insertOrderedList"),
    },
    {
      id: "quote",
      label: "“",
      title: "Citation",
      style: "font-semibold",
      action: insertBlock(
        "<blockquote><p>Citation</p></blockquote><p><br></p>",
      ),
    },
    {
      id: "code",
      label: "</>",
      title: "Bloc de code",
      style: "font-mono text-[10px]",
      action: insertBlock("<pre><code>// code</code></pre><p><br></p>"),
    },
  ];

  return items;
}

/**
 * Éditeur WYSIWYG partagé pour news / tickets / autres modules sans exigences
 * avancées (wikilinks, slash menu…).
 *
 * - Container contentEditable avec la classe `.wiki-content` pour un rendu
 *   100% cohérent avec le reader (mêmes styles code, citation, table, dark mode).
 * - Toolbar minimale mais suffisante : B / I / H2 / H3 / UL / OL / Quote / Code.
 * - Le composant est non-contrôlé côté DOM (document.execCommand modifie
 *   directement le contentEditable) pour éviter les re-renders qui détruisent
 *   le caret. `value` sert uniquement à seed et à sync en cas de reset externe.
 * - `onChange(html)` est appelé à chaque mutation (onInput).
 */
export function RichTextEditor({
  value,
  onChange,
  onImageButton,
  minHeight = 200,
  placeholder,
  className = "",
  ariaLabel,
  disabled,
  onSave,
  onInsertLink,
  onInsertWikiLink,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const isFocusedRef = useRef(false);
  const toolbar = buildToolbar(onImageButton);

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLDivElement>) => {
      onChange((e.target as HTMLDivElement).innerHTML);
    },
    [onChange],
  );

  /**
   * Keyboard shortcuts inside the editor:
   *   - Cmd/Ctrl+S          → onSave (defaults: noop)
   *   - Cmd/Ctrl+B          → bold (browser handles natively)
   *   - Cmd/Ctrl+I          → italic (browser handles natively)
   *   - Cmd/Ctrl+K          → onInsertLink with current selection
   *   - Cmd/Ctrl+Shift+K    → onInsertWikiLink (or insert `[[` placeholder)
   *
   * Bold/Italic are NOT intercepted: the browser's default behaviour on
   * contentEditable already covers them. We only intercept the ones that
   * collide with browser shortcuts (Save) or that need parent input.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (!isMod) return;

      // Cmd/Ctrl+S → save
      if (e.key.toLowerCase() === "s" && !e.shiftKey && !e.altKey) {
        if (onSave) {
          e.preventDefault();
          onSave();
        }
        return;
      }

      // Cmd/Ctrl+Shift+K → wiki link
      if (e.key.toLowerCase() === "k" && e.shiftKey) {
        if (onInsertWikiLink) {
          e.preventDefault();
          onInsertWikiLink();
        }
        return;
      }

      // Cmd/Ctrl+K → insert link with current selection
      if (e.key.toLowerCase() === "k" && !e.shiftKey && !e.altKey) {
        if (onInsertLink) {
          e.preventDefault();
          const sel = window.getSelection();
          const text = sel?.toString() ?? "";
          onInsertLink(text);
        }
        return;
      }
    },
    [onSave, onInsertLink, onInsertWikiLink],
  );

  // Sync externe (ex: reset du form, sélection de template). On ne re-écrit
  // l'innerHTML que si l'éditeur n'est PAS focus — sinon on détruit le caret
  // à chaque frappe.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (isFocusedRef.current) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value || "";
    }
  }, [value]);

  const isEmpty =
    !value ||
    value === "<br>" ||
    value === "<p></p>" ||
    value === "<p><br></p>";

  return (
    <div className={className}>
      {/* Toolbar */}
      <div className="flex items-center flex-wrap gap-1 border border-b-0 border-gray-300 dark:border-slate-600 rounded-t-lg p-2 bg-gray-50 dark:bg-slate-800">
        {toolbar.map((item) => (
          <button
            key={item.id}
            type="button"
            title={item.title}
            aria-label={item.title}
            disabled={disabled}
            onClick={() => {
              const el = editorRef.current;
              if (!el) return;
              item.action(el);
              onChange(el.innerHTML);
            }}
            className={`px-2 py-1 text-xs rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white disabled:opacity-40 disabled:cursor-not-allowed ${item.style ?? "font-semibold"}`}
          >
            {item.label}
          </button>
        ))}
        {onImageButton && (
          <button
            type="button"
            title="Insérer une image"
            aria-label="Insérer une image"
            disabled={disabled}
            onClick={onImageButton}
            className="px-2 py-1 text-xs font-semibold rounded hover:bg-gray-200 dark:hover:bg-slate-700 text-seal-navy dark:text-white disabled:opacity-40"
          >
            <ImageIcon className="h-3.5 w-3.5 inline" />
          </button>
        )}
      </div>

      {/* Contenteditable — wiki-content fournit le styling prose + dark mode */}
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable={!disabled}
          role="textbox"
          aria-label={ariaLabel ?? "Éditeur de contenu"}
          aria-multiline="true"
          style={{ minHeight: `${minHeight}px` }}
          className={`wiki-content w-full rounded-b-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-seal-navy dark:text-white px-4 py-3 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 max-w-none overflow-y-auto ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
          onInput={handleInput}
          onFocus={() => {
            isFocusedRef.current = true;
          }}
          onBlur={() => {
            isFocusedRef.current = false;
          }}
          onKeyDown={handleKeyDown}
          suppressContentEditableWarning
        />
        {isEmpty && placeholder && (
          <div
            className="absolute top-3 left-4 text-sm text-seal-gray-400 dark:text-slate-500 pointer-events-none select-none"
            aria-hidden="true"
          >
            {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}
