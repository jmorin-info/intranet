'use client';

import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Pastille compteur pour items de sidebar.
 *
 * - Affichée quand count > 0
 * - "9+" quand count >= 10 (ou "99+" en mode compact)
 * - Animation pulse 2s à l'arrivée puis stable
 * - Variants couleur : orange (info/standard) ou bordeaux (urgence)
 *
 * Use-case typique :
 *   <SidebarBadge count={unreadNotifications} />
 *   <SidebarBadge count={criticalAlerts} variant="bordeaux" />
 *
 * Accessible : inclut aria-label qui annonce le nombre complet ("3 non lus").
 */

interface SidebarBadgeProps {
  count: number;
  variant?: 'orange' | 'bordeaux' | 'emerald';
  /** Mode "compact" : affiche "9+" au lieu de "99+" (pour pastilles très petites). */
  compact?: boolean;
  /** Libellé a11y (ex: "non lus", "en attente"). */
  label?: string;
  /** Position absolute dans un wrapper relative — si true, affiche en coin haut-droit. */
  absolute?: boolean;
  className?: string;
}

const VARIANT_STYLES: Record<NonNullable<SidebarBadgeProps['variant']>, string> = {
  orange: 'bg-[#F9964A] text-[#004469] ring-[#F9964A]/30',
  bordeaux: 'bg-[#892034] text-white ring-[#892034]/30',
  emerald: 'bg-emerald-500 text-white ring-emerald-500/30',
};

export function SidebarBadge({
  count,
  variant = 'orange',
  compact = false,
  label,
  absolute = false,
  className,
}: SidebarBadgeProps) {
  if (count <= 0) return null;
  const cap = compact ? 9 : 99;
  const display = count > cap ? `${cap}+` : String(count);

  return (
    <span
      aria-label={`${count}${label ? ' ' + label : ''}`}
      className={cn(
        'flex items-center justify-center rounded-full font-semibold ring-2',
        'animate-[sidebar-badge-pulse_2s_ease-out_1] shadow-sm',
        compact
          ? 'h-4 min-w-[16px] px-1 text-[9px]'
          : 'h-5 min-w-[20px] px-1.5 text-[10px]',
        absolute && 'absolute -top-1 -right-1',
        VARIANT_STYLES[variant],
        className,
      )}
    >
      {display}
    </span>
  );
}

// Keyframes injectées globalement au premier mount (une fois)
if (typeof document !== 'undefined') {
  const STYLE_ID = 'sidebar-badge-pulse-keyframes';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @keyframes sidebar-badge-pulse {
        0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 currentColor; opacity: 1; }
        50%      { transform: scale(1.15); box-shadow: 0 0 0 6px transparent; opacity: 0.9; }
      }
    `;
    document.head.appendChild(style);
  }
}
