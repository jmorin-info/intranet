"use client";

/**
 * <SavedSearchesDropdown />
 * =========================
 *
 * Permet a l'utilisateur d'enregistrer la recherche en cours (query + filtres
 * + facettes + tri) sous un nom, et de la recharger plus tard.
 *
 * Persistance : localStorage `omnitech:saved-searches:v2`. Le suffixe `:v2`
 * marque le schema post-fusion (modules en array, facettes structurees) ;
 * les anciennes sauvegardes v1 (s'il y en avait) ne sont pas migrees ici
 * mais via `migrateLegacySearches()` dans `migrate.ts`.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, BookmarkPlus, ChevronDown, Trash2, X } from "lucide-react";
import type {
  ModuleKey,
  SavedSearch,
  SearchFiltersState,
  SortKey,
} from "./types";
import { migrateLegacySearches } from "./migrate";

const STORAGE_KEY = "omnitech:saved-searches:v2";
const LEGACY_KEY = "omnitech:saved-searches"; // v1 (si elle existait)
const MAX_SAVED = 20;

interface Props {
  currentQuery: string;
  currentState: SearchFiltersState;
  onApply: (saved: SavedSearch) => void;
}

export function SavedSearchesDropdown({
  currentQuery,
  currentState,
  onApply,
}: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [savedList, setSavedList] = useState<SavedSearch[]>([]);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [name, setName] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Load + migrate
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      let list: SavedSearch[] = raw ? JSON.parse(raw) : [];
      // Migration depuis l'ancienne cle si presente
      const legacyRaw = localStorage.getItem(LEGACY_KEY);
      if (legacyRaw && list.length === 0) {
        const migrated = migrateLegacySearches(legacyRaw);
        if (migrated.length > 0) {
          list = migrated;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
          localStorage.removeItem(LEGACY_KEY);
        }
      }
      setSavedList(list);
    } catch {
      // ignore corrupt JSON
    }
  }, []);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowSaveForm(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function persist(next: SavedSearch[]) {
    setSavedList(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // quota exceeded — silent
    }
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed || !currentQuery.trim()) return;
    const entry: SavedSearch = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `saved-${Date.now()}`,
      name: trimmed,
      query: currentQuery.trim(),
      modules: currentState.modules,
      categories: currentState.categories,
      classifications: currentState.classifications,
      statuses: currentState.statuses,
      sort: currentState.sort,
      createdAt: new Date().toISOString(),
    };
    const next = [entry, ...savedList].slice(0, MAX_SAVED);
    persist(next);
    setName("");
    setShowSaveForm(false);
  }

  function remove(id: string) {
    persist(savedList.filter((s) => s.id !== id));
  }

  const canSave = useMemo(
    () => currentQuery.trim().length >= 2,
    [currentQuery],
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Recherches enregistrees"
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-navy ${
          open
            ? "border-seal-navy bg-seal-navy/5 dark:border-slate-400 dark:bg-slate-700 text-seal-navy dark:text-white"
            : "border-gray-200 dark:border-slate-600 text-seal-gray-500 dark:text-slate-400 hover:border-gray-300"
        }`}
      >
        <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Sauvegardes</span>
        {savedList.length > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-bold">
            {savedList.length}
          </span>
        )}
        <ChevronDown
          className={`h-3 w-3 transition ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-80 max-h-[60vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl z-50"
        >
          <div className="p-3 border-b border-gray-100 dark:border-slate-800">
            {!showSaveForm ? (
              <button
                type="button"
                onClick={() => setShowSaveForm(true)}
                disabled={!canSave}
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary/10 dark:bg-primary/20 text-primary text-sm font-semibold hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <BookmarkPlus className="h-4 w-4" />
                Enregistrer cette recherche
              </button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nom de la sauvegarde..."
                  autoFocus
                  className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-seal-navy dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-seal-navy"
                />
                <button
                  type="submit"
                  disabled={!name.trim()}
                  className="px-3 py-1.5 rounded-lg bg-seal-navy text-white text-xs font-semibold hover:bg-seal-navy/90 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  OK
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSaveForm(false);
                    setName("");
                  }}
                  className="text-seal-gray-500 hover:text-red-500"
                  aria-label="Annuler"
                >
                  <X className="h-4 w-4" />
                </button>
              </form>
            )}
          </div>

          {savedList.length === 0 ? (
            <p className="p-4 text-xs text-seal-gray-500 dark:text-slate-400 text-center">
              Aucune recherche enregistree.
            </p>
          ) : (
            <ul className="py-1">
              {savedList.map((s) => (
                <li key={s.id} className="group">
                  <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-800/60 transition">
                    <button
                      type="button"
                      onClick={() => {
                        onApply(s);
                        setOpen(false);
                      }}
                      role="menuitem"
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="text-sm font-medium text-seal-navy dark:text-white truncate">
                        {s.name}
                      </p>
                      <p className="text-[10px] text-seal-gray-500 dark:text-slate-400 truncate">
                        &quot;{s.query}&quot;
                        {s.modules.length > 0 &&
                          ` · ${s.modules.length} module${s.modules.length > 1 ? "s" : ""}`}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(s.id)}
                      className="opacity-0 group-hover:opacity-100 text-seal-gray-500 hover:text-red-500 transition focus-visible:opacity-100"
                      aria-label={`Supprimer ${s.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Helpers exposes pour les tests Vitest. */
export const __SAVED_SEARCH_INTERNAL__ = {
  STORAGE_KEY,
  LEGACY_KEY,
  MAX_SAVED,
};
