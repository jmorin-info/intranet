'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@omnitech/ui';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface HubCard {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  badge?: number | string;
  hidden?: boolean;
}

interface HubLandingProps {
  title: string;
  subtitle: string;
  /** Accent SEAL (hex) pour le titre et les cards. */
  accent: string;
  variant: 'orange' | 'blue' | 'green' | 'bordeaux' | 'default';
  icon: LucideIcon;
  cards: HubCard[];
}

/**
 * Landing réutilisable pour les hubs: en-tête coloré + grille de cartes.
 * Chaque carte = raccourci cliquable vers une sous-section.
 */
export function HubLanding({ title, subtitle, accent, variant, icon: HeaderIcon, cards }: HubLandingProps) {
  const visible = cards.filter((c) => !c.hidden);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:py-10">
      <header className="mb-8 flex items-center gap-4">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-card"
          style={{ backgroundColor: `${accent}1a`, color: accent }}
        >
          <HeaderIcon className="h-7 w-7" />
        </span>
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-navy dark:text-white" style={{ color: 'var(--tw-text-opacity,1) ' }}>
            {title}
          </h1>
          <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">{subtitle}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href} className="block group">
              <Card variant={variant} hoverable className="h-full transition-transform duration-150 group-hover:-translate-y-0.5">
                <CardContent className="py-5">
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0"
                      style={{ backgroundColor: `${accent}14`, color: accent }}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-navy dark:text-white truncate">
                          {card.title}
                        </h3>
                        {card.badge !== undefined && card.badge !== 0 && (
                          <span
                            className={cn(
                              'flex items-center justify-center rounded-full px-1.5 text-[10px] font-semibold text-white min-w-[18px] h-[18px]',
                            )}
                            style={{ backgroundColor: accent }}
                          >
                            {card.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 dark:text-slate-400 mt-1 line-clamp-2">
                        {card.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
