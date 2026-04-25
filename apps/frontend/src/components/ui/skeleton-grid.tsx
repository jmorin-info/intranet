import React from 'react';
import { cn } from '@/lib/utils';
import { SkeletonCard } from '@omnitech/ui';

interface SkeletonGridProps {
  /** Nombre de cartes skeleton à rendre. Défaut: 6. */
  count?: number;
  /** Nombre de colonnes à utiliser sur md+ (1–4). Défaut: 3. */
  columns?: 1 | 2 | 3 | 4;
  className?: string;
}

const COLUMN_CLASSES: Record<1 | 2 | 3 | 4, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
};

/**
 * Grille unifiée de loading states : rend `count` SkeletonCard dans une grille
 * responsive. Sert à harmoniser les états de chargement à travers l'app.
 *
 * Annonce "Chargement…" aux lecteurs d'écran via role="status" + sr-only.
 */
export function SkeletonGrid({
  count = 6,
  columns = 3,
  className,
}: SkeletonGridProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn('grid gap-4', COLUMN_CLASSES[columns], className)}
    >
      <span className="sr-only">Chargement…</span>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
