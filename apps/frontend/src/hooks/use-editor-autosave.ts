"use client";

/**
 * useEditorAutosave — sauvegarde locale d'un brouillon (draft) wiki / news /
 * procédure dans `localStorage` + détection de draft non-restauré au mount.
 *
 * Stratégie :
 *   - Toutes les `intervalMs` (défaut 5s), si la valeur a changé depuis le
 *     dernier flush ET diffère du `serverValue`, on persiste dans
 *     `localStorage` sous la clé `wiki-draft:<entityKey>`.
 *   - Au mount, si un draft local existe et qu'il diffère du `serverValue`,
 *     `hasDraft` passe à true. Le composant parent peut alors afficher un
 *     toast « Restaurer le brouillon ? » et appeler `restore()` ou `discard()`.
 *   - `clearAfterSave()` est appelée par le parent dès que l'API a accusé
 *     réception du save → suppression du draft local.
 *
 * Pas de dépendance externe : on utilise `localStorage` directement avec un
 * try/catch (mode privé Safari, quota dépassé…).
 */

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_PREFIX = "wiki-draft:";

export interface UseEditorAutosaveOptions<T> {
  /**
   * Identifiant stable de l'entité éditée (ex: `wiki:page-123` ou
   * `news:article-456`). Distingue les drafts de plusieurs onglets / entités.
   */
  entityKey: string;
  /** Valeur courante de l'éditeur. */
  value: T;
  /** Valeur côté serveur (référence pour détecter un dirty state). */
  serverValue: T;
  /** Sérializer (par défaut JSON.stringify). */
  serialize?: (v: T) => string;
  /** Désérializer (par défaut JSON.parse). */
  deserialize?: (raw: string) => T | null;
  /** Intervalle de flush (ms). Défaut 5000ms. */
  intervalMs?: number;
  /** Désactivation manuelle (ex: pendant un save serveur). */
  disabled?: boolean;
}

export interface AutosaveState<T> {
  /** Date du dernier flush local (null si rien). */
  lastSavedAt: Date | null;
  /** Vrai si un draft local diffère du serverValue (sur init). */
  hasUnsavedDraft: boolean;
  /** Récupère la valeur du draft local (null si absent). */
  loadDraft: () => T | null;
  /** Force un flush immédiat. */
  flushNow: () => void;
  /** Supprime le draft local (à appeler après save serveur OK). */
  clearDraft: () => void;
}

export function useEditorAutosave<T>({
  entityKey,
  value,
  serverValue,
  serialize = (v) => JSON.stringify(v),
  deserialize = (raw) => {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  intervalMs = 5000,
  disabled = false,
}: UseEditorAutosaveOptions<T>): AutosaveState<T> {
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [hasUnsavedDraft, setHasUnsavedDraft] = useState(false);
  const lastFlushedRef = useRef<string>("");
  const valueRef = useRef<T>(value);
  const serverRef = useRef<T>(serverValue);

  const storageKey = `${STORAGE_PREFIX}${entityKey}`;

  // Keep refs in sync without re-arming the interval
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => {
    serverRef.current = serverValue;
  }, [serverValue]);

  // On mount : detect existing draft
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const draft = deserialize(raw);
        if (draft !== null) {
          const draftStr = serialize(draft);
          const serverStr = serialize(serverValue);
          if (draftStr !== serverStr) {
            setHasUnsavedDraft(true);
          }
        }
      }
    } catch {
      // localStorage indisponible — silently ignore
    }
    // Only run on mount per entity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const flushNow = useCallback(() => {
    if (typeof window === "undefined") return;
    if (disabled) return;
    try {
      const valStr = serialize(valueRef.current);
      const serverStr = serialize(serverRef.current);
      if (valStr === serverStr) {
        // Identique au serveur : pas besoin de stocker un draft.
        if (lastFlushedRef.current) {
          window.localStorage.removeItem(storageKey);
          lastFlushedRef.current = "";
        }
        return;
      }
      if (valStr !== lastFlushedRef.current) {
        window.localStorage.setItem(storageKey, valStr);
        lastFlushedRef.current = valStr;
        setLastSavedAt(new Date());
      }
    } catch {
      // Quota exceeded etc — ignore
    }
  }, [serialize, storageKey, disabled]);

  const clearDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(storageKey);
      lastFlushedRef.current = "";
      setLastSavedAt(null);
      setHasUnsavedDraft(false);
    } catch {
      /* noop */
    }
  }, [storageKey]);

  const loadDraft = useCallback((): T | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return null;
      return deserialize(raw);
    } catch {
      return null;
    }
  }, [deserialize, storageKey]);

  // Periodic flush
  useEffect(() => {
    if (disabled) return;
    const id = window.setInterval(flushNow, intervalMs);
    return () => window.clearInterval(id);
  }, [flushNow, intervalMs, disabled]);

  return {
    lastSavedAt,
    hasUnsavedDraft,
    loadDraft,
    flushNow,
    clearDraft,
  };
}
