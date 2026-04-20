'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, Button } from '@omnitech/ui';
import { Lightbulb, ChevronRight, Check, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import {
  STATIC_TIPS,
  TIP_CATEGORY_LABELS,
  TIP_CATEGORY_ACCENTS,
  type StaticTip,
  type StaticTipCategory,
} from '@/lib/static-tips';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BackendTip {
  id: string;
  title: string;
  body: string;
  icon?: string;
  context?: string;
  priority?: number;
}

interface DisplayTip {
  id: string;
  title: string;
  body: string;
  link?: string;
  category?: StaticTipCategory;
}

/* ------------------------------------------------------------------ */
/*  localStorage helpers                                               */
/* ------------------------------------------------------------------ */

const SEEN_KEY = 'tip_of_day_seen';
const INDEX_KEY = 'tip_of_day_index';

function getSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore */
  }
  return new Set();
}

function persistSeen(ids: Set<string>) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* ignore quota errors */
  }
}

function getStoredIndex(): number {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (raw) return Math.max(0, parseInt(raw, 10) || 0);
  } catch {
    /* ignore */
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/*  Mapping helpers                                                    */
/* ------------------------------------------------------------------ */

function staticToDisplay(t: StaticTip): DisplayTip {
  return { id: t.id, title: t.title, body: t.body, link: t.link, category: t.category };
}

function backendToDisplay(t: BackendTip): DisplayTip {
  return { id: t.id, title: t.title, body: t.body };
}

/* ------------------------------------------------------------------ */
/*  Widget                                                             */
/* ------------------------------------------------------------------ */

export function TipOfTheDay() {
  const [tips, setTips] = useState<DisplayTip[]>([]);
  const [index, setIndex] = useState(0);
  const [seen, setSeen] = useState<Set<string>>(() =>
    typeof window === 'undefined' ? new Set() : getSeen(),
  );

  // Fetch backend tips (general context). Fallback on static list on failure.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data } = await api.get<BackendTip[]>('/tips', {
          params: { context: 'general' },
        });
        if (cancelled) return;
        if (Array.isArray(data) && data.length > 0) {
          setTips(data.map(backendToDisplay));
          return;
        }
      } catch {
        /* silent fallback */
      }
      if (!cancelled) {
        setTips(STATIC_TIPS.map(staticToDisplay));
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Initialise index once we have tips, favoring an unseen tip.
  useEffect(() => {
    if (tips.length === 0) return;
    const stored = getStoredIndex() % tips.length;
    let start = stored;
    // Try to land on an unseen tip if possible
    for (let i = 0; i < tips.length; i += 1) {
      const candidate = (stored + i) % tips.length;
      const t = tips[candidate];
      if (t && !seen.has(t.id)) {
        start = candidate;
        break;
      }
    }
    setIndex(start);
    try {
      localStorage.setItem(INDEX_KEY, String(start));
    } catch {
      /* ignore */
    }
    // We intentionally ignore `seen` in deps: we only want to compute a start
    // index on first load of the tip list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tips]);

  const current = tips[index];

  const next = useCallback(() => {
    if (tips.length === 0) return;
    const n = (index + 1) % tips.length;
    setIndex(n);
    try {
      localStorage.setItem(INDEX_KEY, String(n));
    } catch {
      /* ignore */
    }
  }, [index, tips.length]);

  const markSeen = useCallback(() => {
    if (!current) return;
    const updated = new Set(seen);
    updated.add(current.id);
    setSeen(updated);
    persistSeen(updated);
    next();
  }, [current, next, seen]);

  const isSeen = useMemo(
    () => (current ? seen.has(current.id) : false),
    [current, seen],
  );

  if (!current) {
    return null;
  }

  return (
    <Card id="tip-of-the-day" className="overflow-hidden">
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'rgba(249,150,74,0.12)', color: '#F9964A' }}
            aria-hidden="true"
          >
            <Lightbulb className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
                Astuce du jour
              </h3>
              {current.category && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                  style={{ backgroundColor: TIP_CATEGORY_ACCENTS[current.category] ?? '#888' }}
                >
                  {TIP_CATEGORY_LABELS[current.category] ?? current.category}
                </span>
              )}
              <span className="text-[10px] font-medium uppercase tracking-widest text-seal-gray-500 dark:text-slate-500">
                {index + 1}/{tips.length}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium text-seal-navy/90 dark:text-slate-200">
              {current.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-seal-gray-500 dark:text-slate-400 line-clamp-3">
              {current.body}
            </p>
            {current.link && (
              <Link
                href={current.link}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
              >
                {current.link.startsWith('/wiki') ? 'En savoir plus' : 'Ouvrir'}{' '}
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={next}
                className="gap-1"
                aria-label="Afficher l'astuce suivante"
              >
                Suivante <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={markSeen}
                className="gap-1"
                disabled={isSeen}
                aria-label="Marquer comme vue"
              >
                <Check className="h-3.5 w-3.5" />
                {isSeen ? 'Vue' : 'Marquer comme vue'}
              </Button>
              <Link
                href="/tips"
                className="ml-auto text-[11px] font-semibold text-seal-gray-500 hover:text-primary dark:text-slate-400"
              >
                Voir toutes les astuces
              </Link>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
