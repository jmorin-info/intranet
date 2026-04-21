'use client';

import React from 'react';
import { Crosshair, Target } from 'lucide-react';
import { useFocusModeStore } from '@/stores/focus-mode-store';
import { IconButton } from './icon-button';

/**
 * Toggle du mode Focus (concentration).
 *
 * Migré 2026-04-21 vers <IconButton> pour tooltip visuel + a11y cohérente
 * avec le reste des icon-only buttons du header.
 *
 * Iconographie : pictogrammes "cible" (Crosshair quand inactif, Target
 * quand actif) — plus explicites que l'ancien LayoutGrid.
 */
export function FocusModeToggle() {
  const { mode, toggle } = useFocusModeStore();
  const isFocus = mode === 'FOCUS';

  return (
    <span className="relative inline-flex">
      <IconButton
        icon={isFocus ? Target : Crosshair}
        tooltip={isFocus ? 'Quitter le mode focus' : 'Activer le mode focus (concentration)'}
        variant={isFocus ? 'primary' : 'ghost'}
        onClick={toggle}
        aria-pressed={isFocus}
        className={
          isFocus
            ? 'bg-seal-blue/10 text-seal-blue hover:bg-seal-blue/20 dark:bg-seal-orange/10 dark:text-seal-orange dark:hover:bg-seal-orange/20'
            : undefined
        }
      />
      {/* Pastille d'état "focus actif" */}
      {isFocus && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 h-2 w-2 rounded-full bg-seal-blue dark:bg-seal-orange ring-2 ring-white dark:ring-slate-900 animate-pulse pointer-events-none"
        />
      )}
    </span>
  );
}
