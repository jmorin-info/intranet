'use client';

import { create } from 'zustand';

/**
 * Glance — aperçu rapide d'un lien interne sans quitter la page courante.
 *
 * Inspiré de Zen Browser (https://docs.zen-browser.app/user-manual/glance).
 * L'utilisateur maintient `Alt` en cliquant sur un lien interne → un panneau
 * flottant s'ouvre avec le contenu de la page cible (iframe same-origin).
 *
 * Préférence persistée dans localStorage pour permettre un opt-out utilisateur.
 */

const STORAGE_KEY = 'glanceEnabled';

const readEnabled = (): boolean => {
  if (typeof window === 'undefined') return true;
  const raw = localStorage.getItem(STORAGE_KEY);
  // Par défaut : activé
  return raw === null ? true : raw === 'true';
};

interface GlanceState {
  /** Toggle de la fonctionnalité Glance — désactivable dans /profile. */
  enabled: boolean;
  /** URL interne actuellement affichée dans le panneau Glance (null si fermé). */
  url: string | null;
  /** Position du clic d'origine (pour animer le panneau depuis le curseur). */
  origin: { x: number; y: number } | null;

  setEnabled: (value: boolean) => void;
  open: (url: string, origin?: { x: number; y: number } | null) => void;
  close: () => void;
}

export const useGlanceStore = create<GlanceState>((set) => ({
  enabled: readEnabled(),
  url: null,
  origin: null,

  setEnabled: (value) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(value));
    }
    // Ferme automatiquement tout Glance actif lorsqu'on désactive la feature.
    set(value ? { enabled: true } : { enabled: false, url: null, origin: null });
  },

  open: (url, origin = null) => set({ url, origin }),

  close: () => set({ url: null, origin: null }),
}));
