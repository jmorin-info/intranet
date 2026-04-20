'use client';

/**
 * CommandPaletteProvider — expose open/close/toggle et monte la palette.
 * Écoute Cmd/Ctrl+K global (avec preventDefault pour écraser le bookmark du navigateur).
 * Les autres raccourcis (Ctrl+Shift+K RAG, ?, g+X, Ctrl+Shift+N/T) ne sont PAS interceptés.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CommandPalette } from './command-palette';

interface CommandPaletteContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    // Fallback no-op si le provider n'est pas monté — évite les crashes runtime.
    return { isOpen: false, open: () => {}, close: () => {}, toggle: () => {} };
  }
  return ctx;
}

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((o) => !o), []);

  // Global Cmd/Ctrl+K listener
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // On ne veut PAS intercepter Ctrl+Shift+K (RAG AI)
      if (e.shiftKey) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }
    };
    // capture: true pour passer AVANT les autres listeners (ex : ancien QuickNav deprecated)
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true } as EventListenerOptions);
  }, [toggle]);

  return (
    <CommandPaletteContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
      <CommandPalette isOpen={isOpen} onClose={close} />
    </CommandPaletteContext.Provider>
  );
}
