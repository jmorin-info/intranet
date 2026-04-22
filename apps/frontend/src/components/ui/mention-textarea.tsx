'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Bold, Italic, Code } from 'lucide-react';
import { useUserSearch, type SearchableUser } from '@/hooks/use-user-search';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  rows?: number;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  /**
   * Affiche une mini-toolbar au-dessus de la textarea avec Bold / Italic / Code inline.
   * Les boutons insèrent du markdown (`**X**`, `*X*`, `` `X` ``) autour de la sélection
   * courante. Le backend préserve le texte brut ; le rendu markdown est fait côté
   * lecture via `marked` + DOMPurify. Désactivé par défaut pour ne pas casser les
   * autres utilisations de ce composant.
   */
  showToolbar?: boolean;
}

/**
 * Normalise un nom en handle de mention : "Jean Dupont" → "jean.dupont".
 * Retire les accents via NFD, remplace espaces par points, lowercase.
 */
function toHandle(firstName: string, lastName: string): string {
  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.');
  return `${normalize(firstName)}.${normalize(lastName)}`.replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
}

/**
 * Textarea avec popup d'autocomplétion des mentions @user.
 *
 * Quand l'utilisateur tape `@` suivi d'au moins 1 caractère alphanumérique,
 * le composant appelle `/api/users?search=...` (debounce 200ms) et affiche
 * une liste déroulante de 5 utilisateurs. Navigation clavier Haut/Bas/Enter/Tab,
 * validation insère `@firstname.lastname` à la place de la requête.
 *
 * Le service backend `MentionsService` reconnaît ce format et notifie
 * automatiquement les utilisateurs mentionnés au submit.
 */
export function MentionTextarea({
  value,
  onChange,
  placeholder,
  className,
  rows = 4,
  disabled,
  onKeyDown: onKeyDownProp,
  showToolbar = false,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState('');
  const [popupOpen, setPopupOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);

  const { users, loading } = useUserSearch(query, 5);

  // Analyse la position du curseur : détecte un @ suivi de caractères non-espace
  const detectMention = useCallback((text: string, cursor: number) => {
    // Cherche le dernier @ avant le curseur, sans espace entre
    let i = cursor - 1;
    while (i >= 0) {
      const c = text[i];
      if (!c) break;
      if (c === '@') {
        // Vérifie qu'il est en début de texte OU précédé d'un espace/ponctuation
        const prev = i > 0 ? text[i - 1] : '';
        if (!prev || /[\s\(\[\{>,;]/.test(prev)) {
          const q = text.slice(i + 1, cursor);
          if (/^[a-zA-Z0-9._-]*$/.test(q)) {
            return { start: i, query: q };
          }
        }
        return null;
      }
      if (/[\s\n]/.test(c)) return null;
      i--;
    }
    return null;
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    onChange(text);
    const pos = e.target.selectionStart;
    const detected = detectMention(text, pos);
    if (detected) {
      setQuery(detected.query);
      setMentionStart(detected.start);
      setPopupOpen(true);
      setSelectedIdx(0);
    } else {
      setPopupOpen(false);
      setMentionStart(null);
    }
  };

  const insertMention = useCallback(
    (user: SearchableUser) => {
      if (mentionStart === null || !textareaRef.current) return;
      const handle = toHandle(user.firstName, user.lastName);
      const cursor = textareaRef.current.selectionStart;
      const before = value.slice(0, mentionStart);
      const after = value.slice(cursor);
      const newText = `${before}@${handle} ${after}`;
      onChange(newText);
      setPopupOpen(false);
      setMentionStart(null);
      // Repositionne le curseur après la mention
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          const newPos = before.length + handle.length + 2; // @ + handle + espace
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newPos, newPos);
        }
      });
    },
    [mentionStart, value, onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (popupOpen && users.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => (i + 1) % users.length);
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => (i - 1 + users.length) % users.length);
        return;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const user = users[selectedIdx];
        if (user) insertMention(user);
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setPopupOpen(false);
        return;
      }
    }
    // Forward to external handler if popup didn't consume the event
    onKeyDownProp?.(e);
  };

  // Click hors popup → ferme
  useEffect(() => {
    if (!popupOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (!textareaRef.current?.contains(e.target as Node)) {
        setPopupOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [popupOpen]);

  // Wrap la sélection courante avec un marker markdown (`**`, `*`, `` ` ``).
  // Si aucune sélection : insère les markers et place le curseur au milieu pour
  // que l'utilisateur tape directement son texte entre eux.
  const wrapSelection = useCallback(
    (marker: string) => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart ?? value.length;
      const end = ta.selectionEnd ?? value.length;
      const before = value.slice(0, start);
      const selected = value.slice(start, end);
      const after = value.slice(end);
      const newText = `${before}${marker}${selected}${marker}${after}`;
      onChange(newText);
      // Repositionne le curseur : si texte sélectionné → garde la sélection
      // entre les markers, sinon place le curseur au centre.
      requestAnimationFrame(() => {
        if (!textareaRef.current) return;
        textareaRef.current.focus();
        if (selected.length > 0) {
          const s = start + marker.length;
          const e = s + selected.length;
          textareaRef.current.setSelectionRange(s, e);
        } else {
          const pos = start + marker.length;
          textareaRef.current.setSelectionRange(pos, pos);
        }
      });
    },
    [value, onChange],
  );

  const initials = useMemo(
    () => (u: SearchableUser) =>
      `${u.firstName?.[0] || ''}${u.lastName?.[0] || ''}`.toUpperCase() || '?',
    [],
  );

  return (
    <div className="relative">
      {showToolbar && (
        <div
          className="flex items-center gap-1 mb-1.5 px-0.5"
          // `mousedown preventDefault` ci-dessous évite que le clic sur un bouton
          // vole le focus de la textarea : la sélection courante reste intacte.
        >
          <button
            type="button"
            aria-label="Gras"
            title="Gras (**texte**)"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => wrapSelection('**')}
            className="inline-flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-md text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-seal-navy dark:hover:text-white transition-colors touch-manipulation disabled:opacity-40"
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Italique"
            title="Italique (*texte*)"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => wrapSelection('*')}
            className="inline-flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-md text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-seal-navy dark:hover:text-white transition-colors touch-manipulation disabled:opacity-40"
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Code"
            title="Code inline (`texte`)"
            disabled={disabled}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => wrapSelection('`')}
            className="inline-flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded-md text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-seal-navy dark:hover:text-white transition-colors touch-manipulation disabled:opacity-40"
          >
            <Code className="h-4 w-4" />
          </button>
          <span
            className="ml-auto text-[10px] text-seal-gray-500/70 dark:text-slate-500 select-none hidden sm:inline"
            title="Markdown supporté : **gras**, *italique*, `code`, @mention"
          >
            Markdown supporté
          </span>
        </div>
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className={
          className ||
          'w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-base sm:text-sm text-seal-navy dark:text-white placeholder:text-seal-gray-500/60 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50'
        }
      />
      {popupOpen && (users.length > 0 || loading) && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden max-h-64 overflow-y-auto">
          {loading && users.length === 0 ? (
            <div className="px-3 py-2 text-xs text-seal-gray-500 dark:text-slate-500">Recherche…</div>
          ) : (
            users.map((u, i) => (
              <button
                key={u.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(u);
                }}
                onMouseEnter={() => setSelectedIdx(i)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition ${
                  i === selectedIdx
                    ? 'bg-primary/10 text-primary'
                    : 'text-seal-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800'
                }`}
              >
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary flex-shrink-0">
                  {initials(u)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate">
                    {u.firstName} {u.lastName}
                  </span>
                  <span className="block text-[10px] text-seal-gray-500 dark:text-slate-500 truncate">
                    {u.email} · @{toHandle(u.firstName, u.lastName)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
