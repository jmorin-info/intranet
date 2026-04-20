'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Sunrise, Sun, Moon, ArrowRight, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@omnitech/ui';
import { useAuthStore } from '@/stores/auth-store';

interface BriefingItem {
  label: string;
  count: number;
  href: string;
}

interface MorningBriefingWidgetProps {
  items: BriefingItem[];
  loading?: boolean;
}

function useGreeting() {
  return useMemo(() => {
    const h = new Date().getHours();
    if (h < 6) return { label: 'Bonne nuit', Icon: Moon, gradient: 'from-indigo-500/15 via-purple-500/10 to-transparent' };
    if (h < 12) return { label: 'Bonjour', Icon: Sunrise, gradient: 'from-amber-400/15 via-orange-400/10 to-transparent' };
    if (h < 18) return { label: 'Bon après-midi', Icon: Sun, gradient: 'from-sky-400/15 via-primary/10 to-transparent' };
    return { label: 'Bonsoir', Icon: Moon, gradient: 'from-indigo-500/15 via-navy/10 to-transparent' };
  }, []);
}

function useTodayString() {
  const [label, setLabel] = useState('');
  useEffect(() => {
    setLabel(
      new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(new Date()),
    );
  }, []);
  return label;
}

export function MorningBriefingWidget({ items, loading }: MorningBriefingWidgetProps) {
  const user = useAuthStore(s => s.user);
  const greeting = useGreeting();
  const todayLabel = useTodayString();
  const { Icon } = greeting;

  const actionable = items.filter((i) => i.count > 0);
  const totalActions = actionable.reduce((sum, i) => sum + i.count, 0);

  const briefingLine = useMemo(() => {
    if (loading) return 'Je rassemble vos informations du jour…';
    if (totalActions === 0) return 'Aucune action en attente — profitez d\'une journée sereine.';
    if (totalActions === 1) return 'Vous avez 1 élément qui requiert votre attention.';
    return `Vous avez ${totalActions} éléments qui requièrent votre attention.`;
  }, [loading, totalActions]);

  return (
    <Card className={`relative overflow-hidden border-l-4 border-l-primary bg-gradient-to-br ${greeting.gradient} dark:from-slate-800/40 dark:via-slate-800/20`}>
      <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
      <CardContent className="relative py-4 px-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-white/70 dark:bg-slate-900/60 backdrop-blur-sm flex items-center justify-center shadow-sm">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-widest text-taupe dark:text-slate-500">
                {todayLabel || 'Briefing du jour'}
              </p>
              <h2 className="text-base font-medium text-navy dark:text-white truncate">
                {greeting.label}
                {user?.firstName ? <span className="text-primary">, {user.firstName}</span> : null}
              </h2>
              <p className="text-xs text-taupe dark:text-slate-400 mt-0.5">{briefingLine}</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1 rounded-full bg-primary/10 dark:bg-primary/20 px-2.5 py-1 text-[10px] font-semibold text-primary">
            <Sparkles className="h-3 w-3" />
            Briefing IA
          </div>
        </div>

        {actionable.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {actionable.slice(0, 5).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group inline-flex items-center gap-1.5 rounded-full bg-white/80 dark:bg-slate-900/60 px-2.5 py-1 text-[11px] font-medium text-navy dark:text-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition"
              >
                <span className="tabular-nums text-primary">{item.count}</span>
                <span className="truncate max-w-[140px]">{item.label}</span>
                <ArrowRight className="h-3 w-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MorningBriefingWidget;
