import React from 'react';
import { cn } from './utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

/**
 * Brique de chargement de base.
 * Note : l'attribut `role="status"` + `aria-busy` est posé sur les conteneurs
 * de haut niveau (`SkeletonCard`, `SkeletonTable`, `SkeletonList`) pour éviter
 * de polluer l'arbre d'accessibilité avec un statut par brique.
 */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded bg-gray-200 dark:bg-slate-800', className)}
      {...props}
    />
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Chargement"
      className={cn(
        'rounded-card border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-card',
        className,
      )}
    >
      <div className="space-y-3">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}

interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export function SkeletonTable({ rows = 5, columns = 4, className }: SkeletonTableProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Chargement du tableau"
      className={cn(
        'rounded-card border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden',
        className,
      )}
    >
      <div className="border-b border-gray-100 dark:border-slate-700 px-4 sm:px-6 py-3 grid gap-4"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={`h-${i}`} className="h-3 w-2/3" />
        ))}
      </div>
      <div className="divide-y divide-gray-100 dark:divide-slate-700">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={`r-${r}`}
            className="px-4 sm:px-6 py-3 grid gap-4"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton key={`c-${r}-${c}`} className="h-3 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

interface SkeletonListProps {
  items?: number;
  className?: string;
}

export function SkeletonList({ items = 3, className }: SkeletonListProps) {
  return (
    <ul
      role="status"
      aria-busy="true"
      aria-label="Chargement de la liste"
      className={cn('space-y-3', className)}
    >
      {Array.from({ length: items }).map((_, i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-card border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
        >
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}
