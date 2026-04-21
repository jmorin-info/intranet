'use client';

/**
 * WikiSlashMenu — Notion-style `/` command palette for the wiki editor.
 *
 * Designed as a light overlay that can be bolted onto the existing
 * contentEditable wiki editor without rewriting it. The parent owns the
 * editor ref, keyboard events and insertion logic; this component is
 * purely presentational with a hook (`useSlashMenu`) for state.
 *
 * Usage sketch (in the parent editor):
 *   const slash = useSlashMenu({ editorRef, onInsert });
 *   // onInput:   slash.onInput(e)
 *   // onKeyDown: if (slash.onKeyDown(e)) return;   // consumed
 *   // render:    <WikiSlashMenu state={slash.state} />
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Heading1,
  Heading2,
  Heading3,
  List as ListIcon,
  ListOrdered,
  CheckSquare,
  Quote,
  Code2,
  Minus,
  Link as LinkIcon,
  Type,
} from 'lucide-react';

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  icon: React.ElementType;
  /**
   * HTML snippet inserted at the cursor. `%CURSOR%` will be removed after
   * insertion; it is kept only for documentation purposes today.
   */
  html: string;
}

const COMMANDS: SlashCommand[] = [
  {
    id: 'h1',
    label: 'Titre 1',
    description: 'Grand titre de section',
    keywords: ['h1', 'heading', 'titre', 'title'],
    icon: Heading1,
    html: '<h1>Titre 1</h1><p></p>',
  },
  {
    id: 'h2',
    label: 'Titre 2',
    description: 'Sous-titre',
    keywords: ['h2', 'heading', 'titre'],
    icon: Heading2,
    html: '<h2>Titre 2</h2><p></p>',
  },
  {
    id: 'h3',
    label: 'Titre 3',
    description: 'Titre secondaire',
    keywords: ['h3', 'heading', 'titre'],
    icon: Heading3,
    html: '<h3>Titre 3</h3><p></p>',
  },
  {
    id: 'paragraph',
    label: 'Texte',
    description: 'Paragraphe normal',
    keywords: ['p', 'paragraph', 'texte', 'text'],
    icon: Type,
    html: '<p></p>',
  },
  {
    id: 'ul',
    label: 'Liste à puces',
    description: 'Liste non ordonnée',
    keywords: ['ul', 'list', 'liste', 'puce', 'bullet'],
    icon: ListIcon,
    html: '<ul><li></li></ul>',
  },
  {
    id: 'ol',
    label: 'Liste numérotée',
    description: 'Liste ordonnée',
    keywords: ['ol', 'list', 'liste', 'numero', 'number'],
    icon: ListOrdered,
    html: '<ol><li></li></ol>',
  },
  {
    id: 'checklist',
    label: 'Checklist',
    description: 'Liste de cases à cocher',
    keywords: ['todo', 'check', 'checkbox', 'task', 'tache'],
    icon: CheckSquare,
    html: '<ul><li><input type="checkbox" /> </li></ul>',
  },
  {
    id: 'quote',
    label: 'Citation',
    description: 'Bloc de citation',
    keywords: ['quote', 'citation', 'blockquote'],
    icon: Quote,
    html: '<blockquote><p>Citation</p></blockquote>',
  },
  {
    id: 'code',
    label: 'Bloc de code',
    description: 'Extrait de code monospace',
    keywords: ['code', 'pre', 'snippet'],
    icon: Code2,
    html: '<pre><code>code</code></pre><p></p>',
  },
  {
    id: 'divider',
    label: 'Séparateur',
    description: 'Ligne horizontale',
    keywords: ['hr', 'divider', 'separateur', 'line', 'ligne'],
    icon: Minus,
    html: '<hr /><p></p>',
  },
  {
    id: 'wikilink',
    label: 'Lien wiki',
    description: 'Insère un lien interne [[slug]]',
    keywords: ['wiki', 'link', 'lien', 'internal', '[['],
    icon: LinkIcon,
    html: '[[]]',
  },
];

export interface SlashMenuState {
  open: boolean;
  query: string;
  index: number;
  items: SlashCommand[];
  /** Viewport-relative coordinates where the menu should render. */
  position: { top: number; left: number };
}

interface UseSlashMenuOptions {
  editorRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Called with the chosen command. The parent is expected to replace the
   * `/query` trigger text and insert the appropriate markup.
   */
  onInsert: (cmd: SlashCommand, query: string) => void;
}

/**
 * Filter commands by a fuzzy lowercase match on label / keywords.
 */
function filterCommands(query: string): SlashCommand[] {
  if (!query) return COMMANDS;
  const q = query.toLowerCase();
  return COMMANDS.filter((c) => {
    if (c.label.toLowerCase().includes(q)) return true;
    if (c.description.toLowerCase().includes(q)) return true;
    return c.keywords.some((k) => k.includes(q));
  });
}

/**
 * Reads the current selection's caret coordinates relative to the viewport.
 * Falls back to editor bounds when the range is collapsed in an empty block.
 */
function readCaretPosition(editor: HTMLElement): {
  top: number;
  left: number;
} | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0).cloneRange();
  let rect = range.getBoundingClientRect();
  // Collapsed ranges inside empty elements report a zero-sized rect — fall
  // back to the start container's bounding box to avoid (0,0).
  if (rect.width === 0 && rect.height === 0) {
    const node = range.startContainer;
    const el = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode) as HTMLElement | null;
    if (el) rect = el.getBoundingClientRect();
  }
  if (!rect || (rect.top === 0 && rect.left === 0)) {
    const er = editor.getBoundingClientRect();
    return { top: er.top + 24, left: er.left + 8 };
  }
  return { top: rect.bottom + 4, left: rect.left };
}

/**
 * Hook that wires the slash-menu state to the host editor's input/keydown
 * stream. Returns callbacks to be proxied from the editor plus a `state`
 * object consumed by `<WikiSlashMenu />`.
 */
export function useSlashMenu({ editorRef, onInsert }: UseSlashMenuOptions) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  // Absolute caret offset in the current text node where `/` was typed.
  const triggerRef = useRef<{ node: Node; offset: number } | null>(null);

  const items = useMemo(() => filterCommands(query), [query]);

  // Clamp index whenever the filtered list shrinks.
  useEffect(() => {
    if (index >= items.length) setIndex(Math.max(0, items.length - 1));
  }, [items.length, index]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setIndex(0);
    triggerRef.current = null;
  }, []);

  /**
   * Inspect the selection after an input event and decide whether the
   * menu should be visible.
   */
  const onInput = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) {
      if (open) close();
      return;
    }
    const text = node.textContent ?? '';
    const caret = range.startOffset;

    // Walk backwards from the caret to find a `/` that is either at the
    // very start of the block or preceded by whitespace. Stop if we hit
    // another whitespace before reaching a `/` (the user isn't typing
    // a command).
    let slashPos = -1;
    for (let i = caret - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === '/') {
        const prev = i > 0 ? text[i - 1] : '';
        if (i === 0 || prev === ' ' || prev === '\n' || prev === '\t') {
          slashPos = i;
        }
        break;
      }
      if (ch === ' ' || ch === '\n' || ch === '\t') break;
    }

    if (slashPos < 0) {
      if (open) close();
      return;
    }

    const rawQuery = text.slice(slashPos + 1, caret);
    if (/\s/.test(rawQuery)) {
      if (open) close();
      return;
    }

    triggerRef.current = { node, offset: slashPos };
    setQuery(rawQuery);
    setIndex(0);
    setOpen(true);

    const editor = editorRef.current;
    if (editor) {
      const pos = readCaretPosition(editor);
      if (pos) setPosition(pos);
    }
  }, [open, close, editorRef]);

  /**
   * Intercept keyboard events for navigation / selection / dismissal.
   * Returns `true` when the event was consumed and the host editor
   * should short-circuit its own key handling.
   */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): boolean => {
      if (!open) return false;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndex((prev) => (items.length === 0 ? 0 : (prev + 1) % items.length));
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((prev) =>
          items.length === 0 ? 0 : (prev - 1 + items.length) % items.length,
        );
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (items.length > 0) {
          e.preventDefault();
          const picked = items[index] ?? items[0];
          if (picked) {
            onInsert(picked, query);
          }
          close();
          return true;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return true;
      }
      return false;
    },
    [open, items, index, onInsert, query, close],
  );

  /**
   * Consume (select) the command at the given index — used by mouse click.
   */
  const select = useCallback(
    (cmd: SlashCommand) => {
      onInsert(cmd, query);
      close();
    },
    [onInsert, query, close],
  );

  const state: SlashMenuState = { open, query, index, items, position };

  return {
    state,
    onInput,
    onKeyDown,
    select,
    close,
    /** Absolute caret trigger info (text node + offset of the `/`). */
    getTrigger: () => triggerRef.current,
  };
}

interface WikiSlashMenuProps {
  state: SlashMenuState;
  onSelect: (cmd: SlashCommand) => void;
  onHoverIndex?: (i: number) => void;
}

export function WikiSlashMenu({
  state,
  onSelect,
  onHoverIndex,
}: WikiSlashMenuProps) {
  const { open, items, index, position } = state;
  if (!open || items.length === 0) return null;

  // Clamp the horizontal position so the menu doesn't overflow the viewport.
  const width = 288; // ~w-72
  const maxLeft =
    typeof window !== 'undefined'
      ? Math.max(8, window.innerWidth - width - 8)
      : position.left;
  const left = Math.min(position.left, maxLeft);

  return (
    <div
      role="listbox"
      aria-label="Menu de commandes"
      className="fixed z-[60] w-72 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl max-h-72 overflow-y-auto"
      style={{ top: position.top, left }}
    >
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-500 border-b border-gray-100 dark:border-slate-700">
        Commandes
      </div>
      {items.map((cmd, i) => {
        const Icon = cmd.icon;
        const active = i === index;
        return (
          <button
            key={cmd.id}
            type="button"
            role="option"
            aria-selected={active}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(cmd);
            }}
            onMouseEnter={() => onHoverIndex?.(i)}
            className={`w-full flex items-start gap-2 px-3 py-2 text-left transition-colors ${
              active
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-gray-50 dark:hover:bg-slate-800'
            }`}
          >
            <span
              className={`h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                active
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-xs font-medium text-seal-navy dark:text-white truncate">
                {cmd.label}
              </span>
              <span className="block text-[10px] text-seal-gray-500 dark:text-slate-500 truncate">
                {cmd.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export { COMMANDS as WIKI_SLASH_COMMANDS };
