'use client';

/**
 * Composant `<NoaLoading>` — affiche un libellé "loading" / "empty state"
 * éventuellement réécrit par Noa. Si Noa n'est pas active sur la route
 * courante, on retombe sur `fallback` (par défaut "Chargement…").
 *
 * On re-pioche le message une seule fois par mount (useState lazy-init) —
 * on ne change pas le texte à chaque render, ça serait épileptique.
 */

import React, { useState } from 'react';
import { noa } from './index';
import type { NoaCategory } from './messages';

export interface NoaLoadingProps {
  /** Catégorie de message. Par défaut 'loading'. */
  category?: NoaCategory;
  /** Texte par défaut affiché quand Noa n'est pas active. */
  fallback?: string;
  /** Classes Tailwind additionnelles. */
  className?: string;
}

export function NoaLoading({
  category = 'loading',
  fallback = 'Chargement…',
  className,
}: NoaLoadingProps) {
  const [text] = useState(() => noa(fallback, category));
  return (
    <p
      className={
        className ?? 'text-sm text-seal-gray-500 dark:text-slate-400'
      }
      role="status"
      aria-live="polite"
    >
      {text}
    </p>
  );
}
