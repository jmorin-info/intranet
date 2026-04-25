'use client';

/**
 * Runtime React du mode "Noa".
 *
 * Trois responsabilités :
 *  1) Charger le feature flag global `feature.humor.noa` via /config/{key} et
 *     le mettre en cache (15 min). On retombe sur "OFF" en cas d'échec — la
 *     défense est : si on ne sait pas, Noa ne parle pas.
 *  2) Synchroniser `User.noaEnabled` (auth-store) et `pathname` courant dans
 *     le store interne du helper (`setNoaRuntimeState`), pour que `noa()`
 *     soit utilisable hors React (resolver Zod, toast wrapper).
 *  3) Fournir un hook `useNoaActive()` aux composants UI (badge, settings).
 *
 * Le provider est monté dans `(app)/layout.tsx` après l'AuthProvider, donc
 * `auth-store.user` est déjà chargé au moment où l'effet tourne.
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { create } from 'zustand';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import {
  isNoaActiveForUser,
  isNoaActiveHere,
  setNoaRuntimeState,
} from './index';

// ---------------------------------------------------------------------------
// Store React-side : permet aux composants de re-render quand l'état change.
// ---------------------------------------------------------------------------
interface NoaState {
  flagEnabled: boolean;
  userEnabled: boolean;
  pathname: string | null;
  setFlagEnabled: (v: boolean) => void;
  setUserEnabled: (v: boolean) => void;
  setPathname: (v: string | null) => void;
}

export const useNoaStore = create<NoaState>((set) => ({
  flagEnabled: false,
  userEnabled: false,
  pathname: null,
  setFlagEnabled: (v) => {
    setNoaRuntimeState({ flagEnabled: v });
    set({ flagEnabled: v });
  },
  setUserEnabled: (v) => {
    setNoaRuntimeState({ userEnabled: v });
    set({ userEnabled: v });
  },
  setPathname: (v) => {
    setNoaRuntimeState({ pathname: v });
    set({ pathname: v });
  },
}));

// ---------------------------------------------------------------------------
// Cache du feature flag (TTL 15 min).
// ---------------------------------------------------------------------------
let lastFetchAt = 0;
const FLAG_TTL_MS = 15 * 60 * 1000;

async function fetchFeatureFlag(force = false): Promise<boolean> {
  if (!force && Date.now() - lastFetchAt < FLAG_TTL_MS) {
    return useNoaStore.getState().flagEnabled;
  }
  try {
    // Endpoint accessible aux SUPER_ADMIN seulement (config), donc pour les
    // autres rôles on tombe en 403. C'est intentionnel : par défaut OFF
    // pour les non-SUPER_ADMIN sauf si on ajoute un endpoint public dédié.
    // Pour l'instant on utilise un endpoint public dédié si dispo.
    const { data } = await api.get('/config/public/feature-flags');
    const flags = (data?.data ?? data ?? {}) as Record<string, string>;
    const raw = flags['feature.humor.noa'];
    return raw === 'true' || raw === '1';
  } catch {
    return false;
  } finally {
    lastFetchAt = Date.now();
  }
}

// ---------------------------------------------------------------------------
// Provider : à monter sous AuthProvider.
// ---------------------------------------------------------------------------
export function NoaProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();
  const setFlagEnabled = useNoaStore((s) => s.setFlagEnabled);
  const setUserEnabled = useNoaStore((s) => s.setUserEnabled);
  const setPathname = useNoaStore((s) => s.setPathname);

  // Sync user flag.
  useEffect(() => {
    setUserEnabled(Boolean(user?.noaEnabled));
  }, [user?.noaEnabled, setUserEnabled]);

  // Sync route.
  useEffect(() => {
    setPathname(pathname ?? null);
  }, [pathname, setPathname]);

  // Fetch global flag (1x au mount, puis toutes les 15 min). On ne charge
  // pas le flag si l'utilisateur n'est pas connecté (AuthProvider redirige
  // déjà sur /auth/login dans ce cas).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchFeatureFlag(true).then((v) => {
      if (!cancelled) setFlagEnabled(v);
    });
    const id = setInterval(() => {
      fetchFeatureFlag(true).then((v) => {
        if (!cancelled) setFlagEnabled(v);
      });
    }, FLAG_TTL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [user, setFlagEnabled]);

  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Hooks d'usage.
// ---------------------------------------------------------------------------

/** True si `feature.humor.noa` est ON ET `user.noaEnabled` est true. */
export function useNoaActive(): boolean {
  const flag = useNoaStore((s) => s.flagEnabled);
  const userEnabled = useNoaStore((s) => s.userEnabled);
  return flag && userEnabled;
}

/** Comme `useNoaActive()` mais prend aussi en compte la route courante. */
export function useNoaActiveHere(): boolean {
  // Bind sur les 3 fragments pour re-render à chaque navigation/toggle.
  useNoaStore((s) => s.flagEnabled);
  useNoaStore((s) => s.userEnabled);
  useNoaStore((s) => s.pathname);
  return isNoaActiveHere();
}

// Re-export pour les non-React (resolver Zod, etc.).
export { isNoaActiveForUser, isNoaActiveHere };
