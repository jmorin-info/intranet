"use client";

import { create } from "zustand";

/**
 * Glance — aperçu rapide d'un lien interne sans quitter la page courante.
 *
 * Inspiré de Zen Browser (https://docs.zen-browser.app/user-manual/glance).
 *
 * Modes :
 *   - `normal` : panneau flottant unique (Alt+Clic ou auto-trigger sur pages
 *     épinglées). C'est le comportement historique.
 *   - `split`  : vue 50/50 (page d'origine + page cible côte à côte) avec
 *     drag-handle redimensionnable. L'utilisateur peut ajuster `splitRatio`
 *     (0.2 ≤ r ≤ 0.8) pour pondérer chaque iframe.
 *
 * Préférence `enabled` persistée dans localStorage pour permettre un opt-out.
 */

const STORAGE_KEY = "glanceEnabled";
const SPLIT_RATIO_KEY = "glanceSplitRatio";

const readEnabled = (): boolean => {
  if (typeof window === "undefined") return true;
  const raw = localStorage.getItem(STORAGE_KEY);
  // Par défaut : activé
  return raw === null ? true : raw === "true";
};

const readSplitRatio = (): number => {
  if (typeof window === "undefined") return 0.5;
  const raw = localStorage.getItem(SPLIT_RATIO_KEY);
  if (!raw) return 0.5;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return 0.5;
  return clampRatio(n);
};

function clampRatio(r: number): number {
  if (r < 0.2) return 0.2;
  if (r > 0.8) return 0.8;
  return r;
}

export type GlanceMode = "normal" | "split";

interface GlanceState {
  /** Toggle de la fonctionnalité Glance — désactivable dans /profile. */
  enabled: boolean;
  /** Mode courant : panel unique ou split-view. */
  mode: GlanceMode;
  /** URL interne actuellement affichée dans le panneau Glance (null si fermé). */
  url: string | null;
  /** En mode split : URL de la page d'origine (gauche). */
  baseUrl: string | null;
  /** En mode split : ratio de largeur du panel gauche (0.2…0.8). */
  splitRatio: number;
  /** Position du clic d'origine (pour animer le panneau depuis le curseur). */
  origin: { x: number; y: number } | null;

  setEnabled: (value: boolean) => void;
  open: (url: string, origin?: { x: number; y: number } | null) => void;
  openSplit: (
    targetUrl: string,
    baseUrl: string,
    origin?: { x: number; y: number } | null,
  ) => void;
  /** Repasse en mode normal (utilisé par le bouton Close en split). */
  toNormal: () => void;
  setSplitRatio: (ratio: number) => void;
  close: () => void;
}

export const useGlanceStore = create<GlanceState>((set) => ({
  enabled: readEnabled(),
  mode: "normal",
  url: null,
  baseUrl: null,
  splitRatio: readSplitRatio(),
  origin: null,

  setEnabled: (value) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(value));
    }
    // Ferme automatiquement tout Glance actif lorsqu'on désactive la feature.
    set(
      value
        ? { enabled: true }
        : {
            enabled: false,
            url: null,
            baseUrl: null,
            origin: null,
            mode: "normal",
          },
    );
  },

  open: (url, origin = null) =>
    set({ url, origin, mode: "normal", baseUrl: null }),

  openSplit: (targetUrl, baseUrl, origin = null) =>
    set({
      url: targetUrl,
      baseUrl,
      origin,
      mode: "split",
    }),

  toNormal: () =>
    set((state) => ({
      mode: "normal",
      baseUrl: null,
      // Conserver l'url cible et l'origin pour l'animation
      url: state.url,
      origin: state.origin,
    })),

  setSplitRatio: (ratio) => {
    const clamped = clampRatio(ratio);
    if (typeof window !== "undefined") {
      localStorage.setItem(SPLIT_RATIO_KEY, String(clamped));
    }
    set({ splitRatio: clamped });
  },

  close: () => set({ url: null, origin: null, baseUrl: null, mode: "normal" }),
}));
