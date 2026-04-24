'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  Button,
  SearchInput,
  EmptyState,
} from '@omnitech/ui';
import {
  Lightbulb,
  ArrowRight,
  Star,
  Sparkles,
  CheckCheck,
  ShieldCheck,
  Folder,
  Users,
  FileCheck,
  Bot,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import {
  STATIC_TIPS,
  TIP_CATEGORY_ACCENTS,
  TIP_CATEGORY_LABELS,
  TIP_DIFFICULTY_LABELS,
  TIP_GROUP_ACCENTS,
  TIP_GROUP_LABELS,
  TIP_GROUP_OF_CATEGORY,
  getRandomTip,
  getRecentTips,
  type StaticTip,
  type TipDifficulty,
  type TipGroup,
} from '@/lib/static-tips';

/* ------------------------------------------------------------------ */
/*  Filtres & constantes                                                */
/* ------------------------------------------------------------------ */

const GROUP_FILTERS: ('all' | TipGroup)[] = [
  'all',
  'productivite',
  'securite',
  'documents',
  'collaboration',
  'conformite',
  'ia',
];

const GROUP_ICONS: Record<TipGroup, LucideIcon> = {
  productivite: Zap,
  securite: ShieldCheck,
  documents: Folder,
  collaboration: Users,
  conformite: FileCheck,
  ia: Bot,
};

const DIFFICULTY_FILTERS: (TipDifficulty | 'all')[] = [
  'all',
  'basic',
  'intermediate',
  'advanced',
];

const DIFFICULTY_ACCENTS: Record<TipDifficulty, string> = {
  basic: '#059669',
  intermediate: '#F9964A',
  advanced: '#892034',
};

const READ_STORAGE_KEY = 'tipsRead';

/* ------------------------------------------------------------------ */
/*  localStorage helpers                                               */
/* ------------------------------------------------------------------ */

function loadReadIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(READ_STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore */
  }
  return new Set();
}

function persistReadIds(ids: Set<string>) {
  try {
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* ignore quota errors */
  }
}

/* ------------------------------------------------------------------ */
/*  Filtrage                                                            */
/* ------------------------------------------------------------------ */

function filterTips(
  tips: StaticTip[],
  group: TipGroup | 'all',
  difficulty: TipDifficulty | 'all',
  query: string,
): StaticTip[] {
  const q = query.trim().toLowerCase();
  return tips.filter((t) => {
    if (group !== 'all' && TIP_GROUP_OF_CATEGORY[t.category] !== group)
      return false;
    if (difficulty !== 'all' && t.difficulty !== difficulty) return false;
    if (!q) return true;
    return (
      t.title.toLowerCase().includes(q) ||
      t.body.toLowerCase().includes(q) ||
      TIP_CATEGORY_LABELS[t.category].toLowerCase().includes(q) ||
      (t.iso?.toLowerCase().includes(q) ?? false)
    );
  });
}

/* ------------------------------------------------------------------ */
/*  Carte tip réutilisable                                              */
/* ------------------------------------------------------------------ */

function TipCard({
  tip,
  idx,
  isRead,
  onToggleRead,
  highlightNew,
}: {
  tip: StaticTip;
  idx: number;
  isRead: boolean;
  onToggleRead: (id: string) => void;
  highlightNew?: boolean;
}) {
  const accent = TIP_CATEGORY_ACCENTS[tip.category];
  const href = tip.actionHref ?? tip.link;
  const actionLabel =
    tip.actionLabel ?? (href?.startsWith('/wiki') ? 'En savoir plus' : 'Ouvrir');
  const diffAccent = DIFFICULTY_ACCENTS[tip.difficulty];

  return (
    <Card
      hoverable
      className={`stagger-item group relative h-full animate-fade-in-up transition-transform duration-150 hover:-translate-y-0.5 ${
        isRead ? 'opacity-75' : ''
      }`}
      style={{ animationDelay: `${Math.min(idx, 10) * 40}ms`, animationFillMode: 'both' }}
    >
      {highlightNew && (
        <span className="absolute -top-2 -right-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-md">
          <Sparkles className="h-3 w-3" /> Nouveau
        </span>
      )}
      <CardContent className="py-5">
        <div className="flex items-start gap-3">
          <span
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${accent}1a`, color: accent }}
            aria-hidden="true"
          >
            <Lightbulb className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  backgroundColor: `${accent}14`,
                  color: accent,
                  borderColor: `${accent}40`,
                }}
              >
                {TIP_CATEGORY_LABELS[tip.category]}
              </span>
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  backgroundColor: `${diffAccent}14`,
                  color: diffAccent,
                }}
              >
                {TIP_DIFFICULTY_LABELS[tip.difficulty]}
              </span>
              {tip.iso && (
                <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  ISO {tip.iso}
                </span>
              )}
            </div>

            <h3 className="mt-2 text-sm font-semibold text-seal-navy dark:text-white">
              {tip.title}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-seal-gray-500 dark:text-slate-400">
              {tip.body}
            </p>

            <div className="mt-3 flex items-center justify-between gap-2">
              {href ? (
                <Link
                  href={href}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                >
                  {actionLabel} <ArrowRight className="h-3 w-3" />
                </Link>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => onToggleRead(tip.id)}
                className={`rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  isRead
                    ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30'
                    : 'text-seal-gray-500 hover:bg-gray-100 hover:text-seal-navy dark:hover:bg-slate-700 dark:hover:text-white'
                }`}
                aria-label={isRead ? 'Marquer comme non lue' : 'Marquer comme lue'}
                aria-pressed={isRead}
              >
                <CheckCheck className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                                */
/* ------------------------------------------------------------------ */

export default function TipsPage() {
  const [group, setGroup] = useState<TipGroup | 'all'>('all');
  const [difficulty, setDifficulty] = useState<TipDifficulty | 'all'>('all');
  const [query, setQuery] = useState('');
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());

  // Load read state on mount (client only).
  useEffect(() => {
    setReadIds(loadReadIds());
  }, []);

  const visible = useMemo(
    () => filterTips(STATIC_TIPS, group, difficulty, query),
    [group, difficulty, query],
  );

  const tipOfTheDay = useMemo(() => getRandomTip(), []);
  const recentTips = useMemo(() => getRecentTips(5), []);
  const recentIds = useMemo(
    () => new Set(recentTips.map((t) => t.id)),
    [recentTips],
  );

  const totalCount = STATIC_TIPS.length;
  const readCount = readIds.size;

  const toggleRead = useCallback((id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      persistReadIds(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    const next = new Set(STATIC_TIPS.map((t) => t.id));
    setReadIds(next);
    persistReadIds(next);
  }, []);

  const resetFilters = useCallback(() => {
    setQuery('');
    setGroup('all');
    setDifficulty('all');
  }, []);

  const hasActiveFilters = group !== 'all' || difficulty !== 'all' || query !== '';

  return (
    <div className="mx-auto max-w-6xl pb-10">
      <PageHeader
        title="Astuces & raccourcis"
        subtitle="Maîtrisez votre intranet en 30 minutes — productivité, sécurité, collaboration."
        icon={Lightbulb}
        hub="monEspace"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={markAllRead}
            disabled={readCount === totalCount}
            className="gap-1"
            aria-label="Marquer toutes les astuces comme lues"
          >
            <CheckCheck className="h-4 w-4" />
            Tout marquer lu
          </Button>
        }
      />

      {/* Stats */}
      <div className="mb-5 flex flex-wrap items-center gap-4 text-xs text-seal-gray-500 dark:text-slate-400">
        <span>
          <strong className="text-seal-navy dark:text-white">{totalCount}</strong>{' '}
          astuces au total
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <strong className="text-primary">{readCount}</strong>{' '}
          consultée{readCount > 1 ? 's' : ''}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          <strong className="text-seal-navy dark:text-white">{totalCount - readCount}</strong>{' '}
          à découvrir
        </span>
      </div>

      {/* Barre filtres sticky */}
      <div className="sticky top-0 z-30 -mx-2 mb-6 rounded-xl border border-seal-navy/10 bg-white/90 px-2 py-3 shadow-sm backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/90">
        <div className="flex flex-col gap-3">
          {/* Groupe */}
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filtrer par catégorie">
            {GROUP_FILTERS.map((g) => {
              const active = group === g;
              const label = g === 'all' ? 'Toutes' : TIP_GROUP_LABELS[g];
              const Icon = g === 'all' ? Sparkles : GROUP_ICONS[g];
              const accent = g === 'all' ? '#F9964A' : TIP_GROUP_ACCENTS[g];
              return (
                <button
                  key={g}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setGroup(g)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    active
                      ? 'text-white shadow-sm'
                      : 'bg-gray-100 text-seal-gray-500 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300'
                  }`}
                  style={active ? { backgroundColor: accent } : undefined}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>

          {/* Difficulty + recherche */}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filtrer par niveau">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-seal-gray-500">
                Niveau
              </span>
              {DIFFICULTY_FILTERS.map((d) => {
                const active = difficulty === d;
                const label = d === 'all' ? 'Tous' : TIP_DIFFICULTY_LABELS[d];
                return (
                  <button
                    key={d}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setDifficulty(d)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      active
                        ? 'bg-seal-navy text-white'
                        : 'bg-gray-100 text-seal-gray-500 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="ml-1 text-[11px] text-seal-gray-500 underline hover:text-primary"
                >
                  Réinitialiser
                </button>
              )}
            </div>
            <div className="w-full md:w-72">
              <SearchInput
                value={query}
                onChange={(v) => setQuery(v)}
                placeholder="Rechercher une astuce, ISO..."
              />
            </div>
          </div>
        </div>
      </div>

      {/* Astuce du jour (mise en avant) */}
      <Card className="mb-6 animate-fade-in-up stagger-item overflow-hidden border-primary/30 bg-gradient-to-br from-[#F9964A1a] via-[#F9964A0a] to-transparent dark:from-[#F9964A30] dark:via-[#F9964A14]">
        <CardContent className="py-5">
          <div className="flex items-start gap-4">
            <span
              className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
              style={{
                background: 'linear-gradient(135deg, #F9964A 0%, #FFC08A 100%)',
              }}
              aria-hidden="true"
            >
              <Star className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">
                  Astuce du jour
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{
                    backgroundColor: `${TIP_CATEGORY_ACCENTS[tipOfTheDay.category]}14`,
                    color: TIP_CATEGORY_ACCENTS[tipOfTheDay.category],
                    borderColor: `${TIP_CATEGORY_ACCENTS[tipOfTheDay.category]}40`,
                  }}
                >
                  {TIP_CATEGORY_LABELS[tipOfTheDay.category]}
                </span>
              </div>
              <h3 className="mt-1 text-base font-semibold text-seal-navy dark:text-white">
                {tipOfTheDay.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-seal-gray-500 dark:text-slate-400">
                {tipOfTheDay.body}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Nouveautés (uniquement si aucun filtre actif) */}
      {!hasActiveFilters && recentTips.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-primary">
              Nouveautés
            </h2>
            <span className="text-[11px] text-seal-gray-500">
              Les {recentTips.length} dernières astuces publiées
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recentTips.map((tip, idx) => (
              <TipCard
                key={tip.id}
                tip={tip}
                idx={idx}
                isRead={readIds.has(tip.id)}
                onToggleRead={toggleRead}
                highlightNew
              />
            ))}
          </div>
        </section>
      )}

      {/* Liste filtrée */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-seal-navy dark:text-white">
            {hasActiveFilters ? 'Résultats' : 'Toutes les astuces'}
          </h2>
          <span className="text-[11px] text-seal-gray-500">
            {visible.length} astuce{visible.length > 1 ? 's' : ''}
          </span>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            type="search"
            title="Aucune astuce trouvée"
            description="Aucune astuce ne correspond à votre recherche. Essayez un autre terme ou réinitialisez les filtres."
            action={
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Réinitialiser les filtres
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((tip, idx) => (
              <TipCard
                key={tip.id}
                tip={tip}
                idx={idx}
                isRead={readIds.has(tip.id)}
                onToggleRead={toggleRead}
                highlightNew={recentIds.has(tip.id) && !hasActiveFilters ? false : false}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
