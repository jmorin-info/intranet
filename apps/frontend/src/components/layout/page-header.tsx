"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

type HubAccent =
  | "monEspace"
  | "work"
  | "security"
  | "admin"
  | "rssi"
  | "neutral";

const ACCENTS: Record<HubAccent, string> = {
  monEspace: "#F68D2E",
  work: "#296DC1",
  security: "#892034",
  admin: "#F9964A",
  rssi: "#837274",
  neutral: "#F68D2E",
};

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  /** Hub de rattachement — détermine la couleur d'accent du cartouche. */
  hub?: HubAccent;
  /** Actions à droite du titre (boutons, filtres). */
  actions?: React.ReactNode;
  /** Contenu supplémentaire sous le titre (tabs, filtres persistants). */
  meta?: React.ReactNode;
  className?: string;
}

/**
 * En-tête de page uniforme — à utiliser sur toute page de contenu pour garantir
 * une harmonie visuelle avec les landings hub et la charte SEAL.
 *
 * Layout:  [icône cartouche]  [titre + sous-titre]    [actions]
 *          [meta / filtres / tabs sur toute la largeur]
 */
export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  hub = "neutral",
  actions,
  meta,
  className,
}: PageHeaderProps) {
  const accent = ACCENTS[hub];
  return (
    <header className={cn("mb-6", className)}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl shadow-card flex-shrink-0"
              style={{ backgroundColor: `${accent}1a`, color: accent }}
              aria-hidden="true"
            >
              <Icon className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-semibold text-seal-navy dark:text-white truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs md:text-sm text-seal-gray-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div id="page-actions" className="flex items-center gap-2 flex-wrap">
            {actions}
          </div>
        )}
      </div>
      {meta && <div className="mt-4">{meta}</div>}
    </header>
  );
}
