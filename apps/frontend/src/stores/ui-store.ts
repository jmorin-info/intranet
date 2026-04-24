'use client';

import { create } from 'zustand';

const PINNED_KEY = 'sidebarPinned';
const RECENTS_KEY = 'sidebarRecents';
const COMPACT_KEY = 'sidebarCompact';
const MAX_PINS = 8;
const MAX_RECENTS = 5;

const readStorageArray = (key: string): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === 'string');
    return [];
  } catch {
    return [];
  }
};

const readStorageBool = (key: string): boolean => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(key) === 'true';
};

interface UIState {
  sidebarOpen: boolean;
  mobileSidebarOpen: boolean;
  sidebarCompact: boolean;
  sidebarPinned: string[];
  sidebarRecents: string[];
  darkMode: boolean;
  locale: 'fr' | 'en';
  zenMode: boolean;
  activeSpaceId: string | null;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleMobileSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  toggleCompact: () => void;
  setCompact: (value: boolean) => void;
  togglePinned: (href: string) => void;
  pushRecent: (href: string) => void;
  toggleDarkMode: () => void;
  /**
   * Change the UI language.
   *
   * - Always writes to localStorage (immediate offline fallback).
   * - By default also PATCHes `/users/me/preferences` so the preference
   *   follows the user across devices. Pass `{ skipRemote: true }` when
   *   the new value *came* from the server (hydration) to avoid a loop.
   */
  setLocale: (locale: 'fr' | 'en', options?: { skipRemote?: boolean }) => void;
  toggleZenMode: () => void;
  setActiveSpace: (id: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  mobileSidebarOpen: false,
  zenMode: false,
  activeSpaceId: null,
  sidebarCompact: readStorageBool(COMPACT_KEY),
  sidebarPinned: readStorageArray(PINNED_KEY),
  sidebarRecents: readStorageArray(RECENTS_KEY),
  darkMode: typeof window !== 'undefined' ? localStorage.getItem('darkMode') === 'true' : false,
  locale: (typeof window !== 'undefined' ? localStorage.getItem('locale') as 'fr' | 'en' : null) || 'fr',

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleMobileSidebar: () => set((state) => ({ mobileSidebarOpen: !state.mobileSidebarOpen })),
  setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),

  toggleCompact: () =>
    set((state) => {
      const next = !state.sidebarCompact;
      if (typeof window !== 'undefined') localStorage.setItem(COMPACT_KEY, String(next));
      return { sidebarCompact: next };
    }),
  setCompact: (value) =>
    set(() => {
      if (typeof window !== 'undefined') localStorage.setItem(COMPACT_KEY, String(value));
      return { sidebarCompact: value };
    }),

  togglePinned: (href) =>
    set((state) => {
      let next: string[];
      if (state.sidebarPinned.includes(href)) {
        next = state.sidebarPinned.filter((h) => h !== href);
      } else {
        if (state.sidebarPinned.length >= MAX_PINS) return state;
        next = [...state.sidebarPinned, href];
      }
      if (typeof window !== 'undefined') localStorage.setItem(PINNED_KEY, JSON.stringify(next));
      return { sidebarPinned: next };
    }),

  pushRecent: (href) =>
    set((state) => {
      const filtered = state.sidebarRecents.filter((h) => h !== href);
      const next = [href, ...filtered].slice(0, MAX_RECENTS);
      if (typeof window !== 'undefined') localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      return { sidebarRecents: next };
    }),

  toggleDarkMode: () =>
    set((state) => {
      const next = !state.darkMode;
      if (typeof window !== 'undefined') {
        localStorage.setItem('darkMode', String(next));
        document.documentElement.classList.toggle('dark', next);
      }
      return { darkMode: next };
    }),

  setLocale: (locale, options) => {
    if (typeof window !== 'undefined') localStorage.setItem('locale', locale);
    set({ locale });
    if (!options?.skipRemote && typeof window !== 'undefined' && localStorage.getItem('accessToken')) {
      // Lazy import to keep ui-store free of an `api` dependency at module init.
      import('@/lib/api')
        .then(({ api }) => api.patch('/users/me/preferences', { locale }))
        .catch(() => {
          // Best-effort: the localStorage write above already gave the user immediate feedback.
        });
    }
  },

  toggleZenMode: () => set((state) => ({ zenMode: !state.zenMode })),

  setActiveSpace: (id) => set({ activeSpaceId: id }),
}));
