'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import {
  BREADCRUMBS_LABELS,
  DYNAMIC_LABEL_LOOKUPS,
  humanizeSegment,
  isDynamicSegment,
} from '@/config/breadcrumbs-labels';

interface BreadcrumbItem {
  label: string;
  href: string;
  isLast: boolean;
}

const MAX_VISIBLE_ON_MOBILE = 3;

/**
 * Résolution synchrone des labels pour un pathname donné.
 * Les segments dynamiques reçoivent "Chargement…" initialement ; la résolution
 * async est gérée dans le composant React via useEffect + API.
 */
function buildItems(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean);
  const items: BreadcrumbItem[] = [];
  let accHref = '';

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]!;
    accHref += `/${seg}`;

    let label: string;
    if (isDynamicSegment(seg)) {
      label = 'Chargement…';
    } else {
      const config = BREADCRUMBS_LABELS[seg];
      label = config?.label ?? humanizeSegment(seg);
    }

    items.push({ label, href: accHref, isLast: i === segments.length - 1 });
  }
  return items;
}

/**
 * Breadcrumbs globaux auto-générés depuis l'URL. Affichés dans le layout
 * (app). Masqués sur la racine /dashboard et sur les pages auth.
 *
 * Fonctionnalités :
 *   - Auto-gen depuis usePathname
 *   - Mapping slug → label FR (voir config/breadcrumbs-labels.ts)
 *   - Lookup async des titres dynamiques (UUID, slugs d'entité) via API
 *   - Accueil en tête avec icône Home
 *   - Dernier item = texte non-cliquable
 *   - Responsive : tronqué avec "..." au milieu sur mobile si > N niveaux
 *   - ARIA nav + aria-current="page" pour l'item actif
 */
export function Breadcrumbs() {
  const pathname = usePathname() ?? '/';
  const [dynamicLabels, setDynamicLabels] = useState<Record<string, string>>({});

  const items = useMemo(() => buildItems(pathname), [pathname]);

  // Lookup async pour les segments dynamiques (ex: /documents/<uuid>/…)
  useEffect(() => {
    let cancelled = false;
    const segments = pathname.split('/').filter(Boolean);

    segments.forEach((seg, idx) => {
      if (!isDynamicSegment(seg)) return;
      const prevSeg = segments[idx - 1];
      if (!prevSeg) return;
      const lookup = DYNAMIC_LABEL_LOOKUPS[prevSeg];
      if (lookup) {
        lookup(seg)
          .then((label) => {
            if (!cancelled && label) {
              setDynamicLabels((prev) => ({ ...prev, [seg]: label }));
            }
          })
          .catch(() => { /* silent fallback */ });
        return;
      }
      // Fallback pragmatique : tenter de resolve via des endpoints communs
      // pour enrichir le UX sans ajouter de config manuelle.
      const guess: { prev: string; endpoint: string; field: 'title' | 'name' | 'reference' | 'slug' }[] = [
        { prev: 'documents', endpoint: `/documents/${seg}`, field: 'title' },
        { prev: 'tickets', endpoint: `/tickets/${seg}`, field: 'reference' },
        { prev: 'incidents', endpoint: `/incidents/${seg}`, field: 'reference' },
        { prev: 'news', endpoint: `/news/${seg}`, field: 'title' },
        { prev: 'wiki', endpoint: `/wiki/${seg}`, field: 'title' },
        { prev: 'runbooks', endpoint: `/runbooks/${seg}`, field: 'title' },
        { prev: 'procedures', endpoint: `/procedures/${seg}`, field: 'title' },
        { prev: 'albums', endpoint: `/media/albums/${seg}`, field: 'title' },
        { prev: 'workflows', endpoint: `/approval-workflows/${seg}`, field: 'name' },
      ];
      const match = guess.find((g) => g.prev === prevSeg);
      if (!match) return;

      api.get<Record<string, unknown>>(match.endpoint)
        .then(({ data }) => {
          if (cancelled) return;
          const raw = data?.[match.field];
          const label = typeof raw === 'string' ? raw : null;
          if (label) setDynamicLabels((prev) => ({ ...prev, [seg]: label }));
        })
        .catch(() => { /* silent */ });
    });

    return () => { cancelled = true; };
  }, [pathname]);

  // Applique les labels dynamiques résolus
  const resolvedItems = useMemo(() => {
    return items.map((item) => {
      const last = item.href.split('/').filter(Boolean).pop();
      if (last && dynamicLabels[last]) {
        return { ...item, label: dynamicLabels[last] };
      }
      return item;
    });
  }, [items, dynamicLabels]);

  if (resolvedItems.length === 0) return null;

  // Responsive : sur mobile, tronque au milieu si plus de MAX_VISIBLE_ON_MOBILE niveaux.
  const needsTruncation = resolvedItems.length > MAX_VISIBLE_ON_MOBILE;

  return (
    <nav
      aria-label="Fil d'Ariane"
      className="flex items-center gap-1 text-xs text-seal-gray-500 dark:text-slate-400 min-w-0 py-2"
    >
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 hover:text-seal-blue dark:hover:text-blue-400 transition-colors flex-shrink-0"
      >
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only sm:not-sr-only">Accueil</span>
      </Link>

      {resolvedItems.map((item, idx) => {
        // Tronquage mobile : on ne garde que le 1er item puis "…" puis les 2 derniers
        const hideOnMobile = needsTruncation && idx > 0 && idx < resolvedItems.length - 2;

        if (hideOnMobile) {
          // Rend un seul "…" pour tous les items cachés
          if (idx === 1) {
            return (
              <React.Fragment key="ellipsis">
                <ChevronRight className="h-3 w-3 flex-shrink-0 text-seal-gray-400 sm:hidden" aria-hidden="true" />
                <span className="sm:hidden text-seal-gray-400" aria-hidden="true">…</span>
                <ChevronRight className="h-3 w-3 flex-shrink-0 text-seal-gray-400 hidden sm:inline" aria-hidden="true" />
                <Link
                  href={item.href}
                  className="hidden sm:inline hover:text-seal-blue dark:hover:text-blue-400 transition-colors truncate max-w-[200px]"
                >
                  {item.label}
                </Link>
              </React.Fragment>
            );
          }
          return (
            <React.Fragment key={item.href}>
              <ChevronRight className="h-3 w-3 flex-shrink-0 text-seal-gray-400 hidden sm:inline" aria-hidden="true" />
              <Link
                href={item.href}
                className="hidden sm:inline hover:text-seal-blue dark:hover:text-blue-400 transition-colors truncate max-w-[200px]"
              >
                {item.label}
              </Link>
            </React.Fragment>
          );
        }

        return (
          <React.Fragment key={item.href}>
            <ChevronRight className="h-3 w-3 flex-shrink-0 text-seal-gray-400" aria-hidden="true" />
            {item.isLast ? (
              <span
                className="font-medium text-seal-navy dark:text-white truncate max-w-[240px]"
                aria-current="page"
                title={item.label}
              >
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="hover:text-seal-blue dark:hover:text-blue-400 transition-colors truncate max-w-[200px]"
                title={item.label}
              >
                {item.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
