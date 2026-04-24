'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, Button } from '@omnitech/ui';
import {
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  Check,
  ArrowRight,
  EyeOff,
  Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  STATIC_TIPS,
  TIP_CATEGORY_LABELS,
  TIP_CATEGORY_ACCENTS,
  TIP_DIFFICULTY_LABELS,
  type StaticTip,
  type StaticTipCategory,
  type TipDifficulty,
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
  actionLabel?: string;
  actionHref?: string;
  category?: StaticTipCategory;
  difficulty?: TipDifficulty;
  iso?: string;
}

/* ------------------------------------------------------------------ */
/*  localStorage helpers                                               */
/* ------------------------------------------------------------------ */

const SEEN_KEY = 'tip_of_day_seen';
const INDEX_KEY = 'tip_of_day_index';
const DISMISSED_KEY = 'tipDismissedDate';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

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
  return {
    id: t.id,
    title: t.title,
    body: t.body,
    link: t.actionHref ?? t.link,
    actionLabel: t.actionLabel,
    actionHref: t.actionHref,
    category: t.category,
    difficulty: t.difficulty,
    iso: t.iso,
  };
}

function backendToDisplay(t: BackendTip): DisplayTip {
  return { id: t.id, title: t.title, body: t.body };
}

/* ------------------------------------------------------------------ */
/*  Badges                                                             */
/* ------------------------------------------------------------------ */

const DIFFICULTY_COLORS: Record<TipDifficulty, string> = {
  basic: '#059669',
  intermediate: '#F9964A',
  advanced: '#892034',
};

function CategoryBadge({ category }: { category: StaticTipCategory }) {
  const accent = TIP_CATEGORY_ACCENTS[category] ?? '#888';
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: `${accent}1a`,
        color: accent,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: `${accent}40`,
      }}
    >
      {TIP_CATEGORY_LABELS[category]}
    </span>
  );
}

function DifficultyBadge({ level }: { level: TipDifficulty }) {
  const accent = DIFFICULTY_COLORS[level];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{
        backgroundColor: `${accent}1a`,
        color: accent,
      }}
    >
      {TIP_DIFFICULTY_LABELS[level]}
    </span>
  );
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
  const [dismissedToday, setDismissedToday] = useState(false);
  const [fadeIn, setFadeIn] = useState(true);

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

  // Check daily dismiss on mount.
  useEffect(() => {
    try {
      const d = localStorage.getItem(DISMISSED_KEY);
      if (d === todayKey()) setDismissedToday(true);
    } catch {
      /* ignore */
    }
  }, []);

  // Initialise index once we have tips, favoring an unseen tip.
  useEffect(() => {
    if (tips.length === 0) return;
    const stored = getStoredIndex() % tips.length;
    let start = stored;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tips]);

  const current = tips[index];

  const changeIndex = useCallback(
    (n: number) => {
      setFadeIn(false);
      window.setTimeout(() => {
        setIndex(n);
        try {
          localStorage.setItem(INDEX_KEY, String(n));
        } catch {
          /* ignore */
        }
        setFadeIn(true);
      }, 120);
    },
    [],
  );

  const next = useCallback(() => {
    if (tips.length === 0) return;
    changeIndex((index + 1) % tips.length);
  }, [index, tips.length, changeIndex]);

  const prev = useCallback(() => {
    if (tips.length === 0) return;
    changeIndex((index - 1 + tips.length) % tips.length);
  }, [index, tips.length, changeIndex]);

  const markSeen = useCallback(() => {
    if (!current) return;
    const updated = new Set(seen);
    updated.add(current.id);
    setSeen(updated);
    persistSeen(updated);
    next();
  }, [current, next, seen]);

  const dismissToday = useCallback(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, todayKey());
    } catch {
      /* ignore */
    }
    setDismissedToday(true);
  }, []);

  const isSeen = useMemo(
    () => (current ? seen.has(current.id) : false),
    [current, seen],
  );

  if (!current || dismissedToday) {
    return null;
  }

  const href = current.actionHref ?? current.link;
  const actionLabel =
    current.actionLabel ??
    (href?.startsWith('/wiki') ? 'En savoir plus' : 'Ouvrir');

  return (
    <Card
      id="tip-of-the-day"
      className="overflow-hidden border-primary/20 bg-gradient-to-br from-[#F9964A14] via-[#F9964A08] to-transparent dark:from-[#F9964A20] dark:via-[#F9964A10] dark:to-transparent"
    >
      <CardContent className="py-5">
        <div className="flex items-start gap-4">
          {/* Icône grand format à gauche */}
          <span
            className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl shadow-sm"
            style={{
              background: 'linear-gradient(135deg, #F9964A 0%, #FFC08A 100%)',
              color: 'white',
            }}
            aria-hidden="true"
          >
            <Lightbulb className="h-7 w-7" />
            <Sparkles className="absolute -top-1 -right-1 h-3.5 w-3.5 text-yellow-200" />
          </span>

          {/* Titre + contenu à droite */}
          <div
            className={`min-w-0 flex-1 transition-opacity duration-150 ${
              fadeIn ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-primary">
                Astuce du jour
              </h3>
              <span className="text-[10px] font-medium uppercase tracking-widest text-seal-gray-500 dark:text-slate-500">
                {index + 1}/{tips.length}
              </span>
            </div>

            <p className="mt-1.5 text-base font-semibold text-seal-navy dark:text-white">
              {current.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-seal-gray-500 dark:text-slate-400 line-clamp-3">
              {current.body}
            </p>

            {/* Footer : badges + CTA */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {current.category && <CategoryBadge category={current.category} />}
              {current.difficulty && <DifficultyBadge level={current.difficulty} />}
              {current.iso && (
                <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  ISO {current.iso}
                </span>
              )}
              {href && (
                <Link
                  href={href}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                >
                  {actionLabel} <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>

            {/* Actions */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={prev}
                className="gap-1"
                disabled={tips.length <= 1}
                aria-label="Afficher l'astuce précédente"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Précédente
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={next}
                className="gap-1"
                disabled={tips.length <= 1}
                aria-label="Astuce suivante"
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
                {isSeen ? 'Vue' : 'Vu'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={dismissToday}
                className="gap-1 text-seal-gray-500"
                aria-label="Ne plus afficher aujourd'hui"
              >
                <EyeOff className="h-3.5 w-3.5" />
                Masquer aujourd&apos;hui
              </Button>
              <Link
                href="/tips"
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-primary/30 bg-white/60 px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary hover:text-white dark:bg-slate-900/60"
              >
                Voir tous les tips <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
