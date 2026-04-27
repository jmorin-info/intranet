"use client";

/**
 * useTicketsViewMode — persiste dans localStorage le mode d'affichage de la
 * liste tickets (table | kanban). Le mode est synchronisé entre onglets via
 * le `storage` event.
 */

import { useEffect, useState } from "react";

export type TicketsViewMode = "table" | "kanban";

const STORAGE_KEY = "tickets.viewMode";

export function useTicketsViewMode(
  defaultMode: TicketsViewMode = "table",
): [TicketsViewMode, (next: TicketsViewMode) => void] {
  const [mode, setMode] = useState<TicketsViewMode>(defaultMode);

  // Initial read
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "table" || stored === "kanban") setMode(stored);
    } catch {
      /* noop */
    }
  }, []);

  // Cross-tab sync
  useEffect(() => {
    if (typeof window === "undefined") return;
    function handler(e: StorageEvent) {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      if (e.newValue === "table" || e.newValue === "kanban") {
        setMode(e.newValue);
      }
    }
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const persist = (next: TicketsViewMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* noop */
    }
  };

  return [mode, persist];
}
