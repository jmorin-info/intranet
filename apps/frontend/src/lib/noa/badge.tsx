'use client';

/**
 * Badge "Mode Noa actif" — affiché dans la sidebar quand l'utilisateur a
 * Noa active (flag global ON + user opt-in ON). Click → confirmation puis
 * désactivation côté serveur.
 *
 * Le badge n'apparaît PAS si Noa n'est pas active. Il n'a aucun effet sur
 * les routes blacklistées ; il sert juste à signaler l'état et à offrir
 * un raccourci de désactivation rapide.
 */

import React, { useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useNoaActive } from './runtime';

export function NoaBadge() {
  const active = useNoaActive();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [busy, setBusy] = useState(false);

  if (!active || !user) return null;

  const handleClick = async () => {
    if (busy) return;
    const ok = window.confirm(
      "Désactiver Noa ? L'interface redeviendra sérieuse.",
    );
    if (!ok) return;
    setBusy(true);
    try {
      await api.patch('/users/me', { noaEnabled: false });
      setUser({ ...user, noaEnabled: false });
    } catch {
      // On reste silencieux : si ça échoue, l'utilisateur peut désactiver
      // manuellement depuis /profile. Pas de toast humoristique ici.
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title="Mode Noa actif — désactiver dans /profile"
      aria-label="Mode Noa actif (cliquer pour désactiver)"
      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
    >
      <span aria-hidden="true" className="text-base leading-none">🎭</span>
    </button>
  );
}
