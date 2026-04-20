'use client';

/**
 * <SkeletonPage />
 * =================
 *
 * Skeleton d'une page complète : header + N sections.
 * Utilise une animation shimmer CSS pure (pas de lib externe) via
 * un dégradé en background animé.
 *
 * @example
 *   <SkeletonPage sections={4} />
 */

import React from 'react';

export interface SkeletonPageProps {
  /** Nombre de sections skeleton à afficher. Default: 3. */
  sections?: number;
  /** Afficher le header skeleton. Default: true. */
  showHeader?: boolean;
  /** Classes supplémentaires sur le conteneur racine. */
  className?: string;
}

/**
 * Bloc shimmer réutilisable : applique un gradient animé via une
 * keyframe inline injectée une seule fois.
 */
function Bar({
  className = '',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={
        'relative overflow-hidden rounded-md bg-neutral-200/70 dark:bg-neutral-800/70 ' +
        className
      }
      style={style}
    >
      <div className="omnitech-skeleton-shimmer absolute inset-0" />
    </div>
  );
}

/** Injecte les keyframes shimmer une seule fois dans le document. */
function ShimmerStyles() {
  return (
    <style jsx global>{`
      @keyframes omnitech-shimmer {
        0% {
          transform: translateX(-100%);
        }
        100% {
          transform: translateX(100%);
        }
      }
      .omnitech-skeleton-shimmer {
        background-image: linear-gradient(
          90deg,
          transparent 0%,
          rgba(255, 255, 255, 0.45) 50%,
          transparent 100%
        );
        animation: omnitech-shimmer 1.6s ease-in-out infinite;
      }
      .dark .omnitech-skeleton-shimmer {
        background-image: linear-gradient(
          90deg,
          transparent 0%,
          rgba(255, 255, 255, 0.08) 50%,
          transparent 100%
        );
      }
      @media (prefers-reduced-motion: reduce) {
        .omnitech-skeleton-shimmer {
          animation: none;
        }
      }
    `}</style>
  );
}

export function SkeletonPage({
  sections = 3,
  showHeader = true,
  className = '',
}: SkeletonPageProps): React.ReactElement {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Chargement de la page"
      className={'space-y-6 ' + className}
    >
      <ShimmerStyles />

      {showHeader && (
        <div className="space-y-3">
          {/* breadcrumbs */}
          <Bar className="h-3 w-40" />
          {/* titre */}
          <Bar className="h-8 w-1/2" />
          {/* sous-titre */}
          <Bar className="h-4 w-1/3" />
        </div>
      )}

      {Array.from({ length: Math.max(1, sections) }).map((_, i) => (
        <section
          key={i}
          className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white/60 dark:bg-neutral-900/40 p-4 space-y-3"
        >
          <Bar className="h-5 w-1/4" />
          <div className="space-y-2">
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-11/12" />
            <Bar className="h-4 w-9/12" />
          </div>
          <div className="flex gap-2 pt-1">
            <Bar className="h-8 w-24" />
            <Bar className="h-8 w-20" />
          </div>
        </section>
      ))}

      <span className="sr-only">Contenu en cours de chargement…</span>
    </div>
  );
}

export default SkeletonPage;
