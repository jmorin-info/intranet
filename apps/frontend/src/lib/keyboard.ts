/**
 * Utilitaires raccourcis clavier OMNITECH
 * =======================================
 *
 * Fournit :
 *   - un type `KeyboardShortcut` pour décrire un raccourci,
 *   - un hook `useHotkey(shortcut, handler)` pour l'attacher,
 *   - un formatteur `formatShortcut()` pour l'afficher (⌘⇧P / Ctrl+Shift+P).
 *
 * Syntaxe d'entrée : `"cmd+k"`, `"cmd+shift+p"`, `"ctrl+/"`, `"escape"`...
 * - `cmd` est automatiquement traduit en `meta` sur macOS, en `ctrl` ailleurs.
 * - Insensible à la casse.
 * - Le dernier segment est TOUJOURS la touche principale.
 */

import { useEffect, useRef } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Description textuelle d'un raccourci : `"cmd+shift+p"`, `"escape"`, etc. */
export type KeyboardShortcut = string;

interface ParsedShortcut {
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string; // touche principale, en minuscule
}

/* ------------------------------------------------------------------ */
/*  Détection plateforme                                               */
/* ------------------------------------------------------------------ */

/** True si l'utilisateur est sur macOS / iOS. */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  // navigator.platform est déprécié mais reste le plus fiable côté UA.
  const ua = navigator.userAgent || navigator.platform || '';
  return /Mac|iPhone|iPad|iPod/.test(ua);
}

/* ------------------------------------------------------------------ */
/*  Parsing                                                            */
/* ------------------------------------------------------------------ */

/**
 * Parse une string raccourci vers une description structurée.
 * `cmd` → meta sur mac, ctrl sinon.
 */
function parseShortcut(shortcut: KeyboardShortcut): ParsedShortcut {
  const parts = shortcut
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);

  const result: ParsedShortcut = {
    meta: false,
    ctrl: false,
    shift: false,
    alt: false,
    key: '',
  };

  const mac = isMac();

  for (const part of parts) {
    switch (part) {
      case 'cmd':
      case 'command':
        // cmd → meta sur mac, ctrl ailleurs
        if (mac) result.meta = true;
        else result.ctrl = true;
        break;
      case 'meta':
      case 'super':
      case 'win':
        result.meta = true;
        break;
      case 'ctrl':
      case 'control':
        result.ctrl = true;
        break;
      case 'shift':
        result.shift = true;
        break;
      case 'alt':
      case 'option':
      case 'opt':
        result.alt = true;
        break;
      default:
        result.key = part;
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Matching                                                           */
/* ------------------------------------------------------------------ */

/** Vrai si l'évènement clavier correspond au raccourci donné. */
function matches(event: KeyboardEvent, parsed: ParsedShortcut): boolean {
  // Normaliser la touche : ' ' → 'space', 'Escape' → 'escape'
  let key = event.key.toLowerCase();
  if (key === ' ') key = 'space';

  if (key !== parsed.key) return false;
  if (event.metaKey !== parsed.meta) return false;
  if (event.ctrlKey !== parsed.ctrl) return false;
  if (event.shiftKey !== parsed.shift) return false;
  if (event.altKey !== parsed.alt) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/*  Hook useHotkey                                                     */
/* ------------------------------------------------------------------ */

export interface UseHotkeyOptions {
  /** Si false, le hook est désactivé. */
  enabled?: boolean;
  /** Empêcher le comportement par défaut du navigateur. Default: true. */
  preventDefault?: boolean;
  /** Déclencher même si le focus est dans un input / textarea. Default: false. */
  allowInInput?: boolean;
}

/**
 * Attache un raccourci clavier global.
 *
 * @example
 *   useHotkey('cmd+k', () => setOpen(true));
 *   useHotkey('escape', close, { preventDefault: false });
 */
export function useHotkey(
  shortcut: KeyboardShortcut,
  handler: (event: KeyboardEvent) => void,
  options: UseHotkeyOptions = {},
): void {
  const { enabled = true, preventDefault = true, allowInInput = false } =
    options;
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const parsed = parseShortcut(shortcut);

    const onKeyDown = (event: KeyboardEvent) => {
      // Ignorer si le focus est dans un champ de saisie (sauf si explicitement autorisé).
      if (!allowInInput) {
        const target = event.target as HTMLElement | null;
        const tag = target?.tagName;
        const editable = target?.isContentEditable;
        if (
          editable ||
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT'
        ) {
          return;
        }
      }

      if (!matches(event, parsed)) return;
      if (preventDefault) event.preventDefault();
      handlerRef.current(event);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcut, enabled, preventDefault, allowInInput]);
}

/* ------------------------------------------------------------------ */
/*  Formatage lisible                                                  */
/* ------------------------------------------------------------------ */

/**
 * Formate un raccourci pour affichage utilisateur.
 *
 * @example
 *   formatShortcut('cmd+shift+p') // → '⌘⇧P' sur mac, 'Ctrl+Shift+P' sinon
 *   formatShortcut('cmd+k')       // → '⌘K'    / 'Ctrl+K'
 *   formatShortcut('escape')      // → 'Esc'
 */
export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parsed = parseShortcut(shortcut);
  const mac = isMac();

  const prettyKey = (k: string): string => {
    if (!k) return '';
    if (k === 'escape' || k === 'esc') return 'Esc';
    if (k === 'arrowup') return '↑';
    if (k === 'arrowdown') return '↓';
    if (k === 'arrowleft') return '←';
    if (k === 'arrowright') return '→';
    if (k === 'enter' || k === 'return') return '↵';
    if (k === 'space') return 'Space';
    if (k === 'tab') return 'Tab';
    if (k === 'backspace') return '⌫';
    if (k === 'delete') return 'Del';
    return k.length === 1 ? k.toUpperCase() : (k[0] ?? '').toUpperCase() + k.slice(1);
  };

  if (mac) {
    // Ordre Apple HIG : ctrl ⌃ → alt ⌥ → shift ⇧ → cmd ⌘ → touche
    let out = '';
    if (parsed.ctrl) out += '⌃';
    if (parsed.alt) out += '⌥';
    if (parsed.shift) out += '⇧';
    if (parsed.meta) out += '⌘';
    out += prettyKey(parsed.key);
    return out;
  }

  // Windows / Linux : segments séparés par "+"
  const segments: string[] = [];
  if (parsed.meta) segments.push('Win');
  if (parsed.ctrl) segments.push('Ctrl');
  if (parsed.alt) segments.push('Alt');
  if (parsed.shift) segments.push('Shift');
  if (parsed.key) segments.push(prettyKey(parsed.key));
  return segments.join('+');
}
