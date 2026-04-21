'use client';

import React, { useMemo, useState } from 'react';
import { Card, CardContent, Button, SearchInput, EmptyState } from '@omnitech/ui';
import { Lightbulb, ArrowRight, Star } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { useTranslation } from '@/lib/i18n';
import {
  STATIC_TIPS,
  TIP_CATEGORY_ACCENTS,
  TIP_CATEGORY_LABELS,
  type StaticTip,
  type StaticTipCategory,
} from '@/lib/static-tips';

/** Astuce du jour : sélection déterministe basée sur le jour de l'année. */
function getTipOfTheDay(tips: StaticTip[]): StaticTip {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  return tips[dayOfYear % tips.length]!;
}

const CATEGORIES: (StaticTipCategory | 'all')[] = [
  'all',
  'navigation',
  'productivity',
  'security',
  'admin',
  'email',
  'password',
  'vpn',
  'data',
  'rgpd',
];

function filterTips(
  tips: StaticTip[],
  category: StaticTipCategory | 'all',
  query: string,
): StaticTip[] {
  const q = query.trim().toLowerCase();
  return tips.filter((t) => {
    if (category !== 'all' && t.category !== category) return false;
    if (!q) return true;
    return (
      t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q)
    );
  });
}

export default function TipsPage() {
  const { t } = useTranslation();
  const [category, setCategory] = useState<StaticTipCategory | 'all'>('all');
  const [query, setQuery] = useState('');

  const visible = useMemo(
    () => filterTips(STATIC_TIPS, category, query),
    [category, query],
  );

  const tipOfTheDay = useMemo(() => getTipOfTheDay(STATIC_TIPS), []);
  const totalCount = STATIC_TIPS.length;
  const categoryCount = new Set(STATIC_TIPS.map((t) => t.category)).size;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Astuces et raccourcis"
        subtitle={`${totalCount} astuces disponibles dans ${categoryCount} catégories pour tirer le meilleur de l'intranet OMNITECH.`}
        icon={Lightbulb}
        hub="monEspace"
        meta={
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const active = category === c;
                const label =
                  c === 'all' ? 'Toutes' : TIP_CATEGORY_LABELS[c];
                return (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      active
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-gray-100 text-seal-gray-500 hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-300'
                    }`}
                    type="button"
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="w-full md:w-72">
              <SearchInput
                value={query}
                onChange={(v) => setQuery(v)}
                placeholder="Rechercher une astuce..."
              />
            </div>
          </div>
        }
      />

      {/* Astuce du jour */}
      <Card className="mb-6 animate-fade-in-up stagger-item border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="py-5">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Star className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
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

      {visible.length === 0 ? (
        <EmptyState
          type="search"
          title="Aucune astuce trouvée"
          description="Aucune astuce ne correspond à votre recherche. Essayez un autre terme ou réinitialisez les filtres."
          action={(
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery('');
                setCategory('all');
              }}
            >
              Réinitialiser les filtres
            </Button>
          )}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((tip, idx) => {
            const accent = TIP_CATEGORY_ACCENTS[tip.category];
            const body = (
              <Card hoverable className="stagger-item h-full animate-fade-in-up transition-transform duration-150 hover:-translate-y-0.5" style={{ animationDelay: `${idx * 50}ms`, animationFillMode: 'both' }}>
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
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{
                            backgroundColor: `${accent}14`,
                            color: accent,
                            borderColor: `${accent}40`,
                          }}
                        >
                          {TIP_CATEGORY_LABELS[tip.category]}
                        </span>
                      </div>
                      <h3 className="mt-2 text-sm font-semibold text-seal-navy dark:text-white">
                        {tip.title}
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-seal-gray-500 dark:text-slate-400">
                        {tip.body}
                      </p>
                      {tip.link && (
                        <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                          Ouvrir <ArrowRight className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
            return tip.link ? (
              <Link key={tip.id} href={tip.link} className="block">
                {body}
              </Link>
            ) : (
              <div key={tip.id}>{body}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
