"use client";

import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  KeyRound,
  Lock,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import { useCmsBlocks, getBlockData } from "@/lib/cms-client";

const API = (process.env.NEXT_PUBLIC_API_URL || "/api").replace(
  /\/api\/?$/,
  "/api/v1",
);

type BadgeStatus = "OK" | "PARTIAL" | "UNKNOWN";

interface PublicBadge {
  key: string;
  label: string;
  status: BadgeStatus;
  caption: string;
}

interface PublicScore {
  score: number | null;
  reason?: string;
  scale: number;
  badges: PublicBadge[];
  publishedAt: string;
}

const BADGE_ICON_REGISTRY: Record<string, LucideIcon> = {
  identities: KeyRound,
  continuity: Activity,
  crypto: Lock,
  audit: ShieldAlert,
};

const BADGE_COLORS: Record<
  BadgeStatus,
  { dot: string; bg: string; ring: string; label: string }
> = {
  OK: {
    dot: "bg-[#006233]",
    bg: "bg-[#006233]/8",
    ring: "ring-[#006233]/25",
    label: "Conforme",
  },
  PARTIAL: {
    dot: "bg-[#f9964a]",
    bg: "bg-[#f9964a]/8",
    ring: "ring-[#f9964a]/25",
    label: "Partiel",
  },
  UNKNOWN: {
    dot: "bg-[#837274]",
    bg: "bg-[#837274]/8",
    ring: "ring-[#837274]/25",
    label: "Non calculé",
  },
};

/**
 * Fallback hardcodé : badges placeholder affichés tant que :
 *  - le bloc CMS `trust.score.badges` n'est pas encore arrivé (avant fetch)
 *  - le bloc CMS est absent ou mal formé
 *  - ET l'API `/trust/score` ne retourne pas ses propres badges (priorité absolue)
 */
const FALLBACK_BADGES: PublicBadge[] = [
  {
    key: "identities",
    label: "Identités",
    status: "UNKNOWN",
    caption: "MFA & contrôle d'accès",
  },
  {
    key: "continuity",
    label: "Continuité",
    status: "UNKNOWN",
    caption: "Sauvegardes testées",
  },
  {
    key: "crypto",
    label: "Crypto",
    status: "UNKNOWN",
    caption: "TLS 1.2+ / HSTS",
  },
  {
    key: "audit",
    label: "Audit",
    status: "UNKNOWN",
    caption: "Traçabilité 24/7",
  },
];

const VALID_STATUSES: Record<BadgeStatus, true> = {
  OK: true,
  PARTIAL: true,
  UNKNOWN: true,
};

function normalizeBadge(raw: unknown): PublicBadge | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key : null;
  const label = typeof o.label === "string" ? o.label : null;
  const caption = typeof o.caption === "string" ? o.caption : null;
  const status = typeof o.status === "string" ? o.status : null;
  if (!key || !label || !caption || !status) return null;
  if (!(status in VALID_STATUSES)) return null;
  return { key, label, caption, status: status as BadgeStatus };
}

/**
 * Section "Score cyber public" — score global + 4 badges domaines.
 *
 * Logique badges (priorité haute → basse) :
 *  1. Badges renvoyés par l'API `/trust/score` (production live)
 *  2. Bloc CMS `trust.score.badges` (édition admin)
 *  3. Fallback hardcodé (FALLBACK_BADGES)
 */
export function TrustScore() {
  const cmsBlocks = useCmsBlocks(["trust.score.badges"], "fr");
  const [data, setData] = useState<PublicScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/trust/score`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((json: PublicScore) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setError("unavailable");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cmsBadges = useMemo<PublicBadge[]>(() => {
    const raw = getBlockData<unknown[]>(cmsBlocks, "trust.score.badges", []);
    const fromCms = Array.isArray(raw)
      ? raw.map(normalizeBadge).filter((b): b is PublicBadge => b !== null)
      : [];
    return fromCms.length > 0 ? fromCms : FALLBACK_BADGES;
  }, [cmsBlocks]);

  const badges = data?.badges?.length ? data.badges : cmsBadges;

  const scoreUnavailable =
    error !== null || data?.score === null || data?.score === undefined;

  return (
    <section
      id="score"
      aria-labelledby="score-title"
      className="mt-16 scroll-mt-24"
    >
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#f9964a]">
            Indicateurs publics
          </p>
          <h2
            id="score-title"
            className="mt-1 font-display text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white"
          >
            Score cyber public
          </h2>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="relative overflow-hidden rounded-2xl border border-[#F68D2E]/10 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div
            aria-hidden="true"
            className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[#f9964a]/10 blur-2xl"
          />
          <div className="relative">
            <div className="text-sm font-medium text-[#837274] dark:text-slate-400">
              Score global
            </div>
            {loading ? (
              <div className="mt-3 h-16 w-28 animate-pulse rounded-lg bg-gray-200 dark:bg-slate-700" />
            ) : scoreUnavailable ? (
              <div className="mt-3">
                <div
                  role="status"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#837274]/10 px-3 py-2 text-sm font-medium text-[#837274] dark:bg-slate-800 dark:text-slate-300"
                >
                  <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  Score indisponible
                </div>
                <p className="mt-3 text-sm text-[#837274] dark:text-slate-400">
                  Le score consolidé est en cours de calibration. Les badges
                  qualitatifs ci-contre reflètent nos pratiques en production.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-3 flex items-end gap-2">
                  <div className="font-display text-6xl font-bold text-slate-900 dark:text-white">
                    {data?.score}
                  </div>
                  <div className="pb-2 text-lg text-[#837274] dark:text-slate-400">
                    / {data?.scale ?? 100}
                  </div>
                </div>
                <p className="mt-3 text-sm text-[#837274] dark:text-slate-400">
                  Mis à jour le{" "}
                  {data?.publishedAt
                    ? new Date(data.publishedAt).toLocaleDateString("fr-FR")
                    : "—"}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {badges.map((badge) => {
            const Icon = BADGE_ICON_REGISTRY[badge.key] ?? ShieldAlert;
            const colors = BADGE_COLORS[badge.status] ?? BADGE_COLORS.UNKNOWN;
            return (
              <div
                key={badge.key}
                className={`group relative overflow-hidden rounded-2xl border border-[#F68D2E]/10 ${colors.bg} p-4 ring-1 ${colors.ring} transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800`}
              >
                <div className="flex items-center justify-between">
                  <Icon
                    className="h-5 w-5 text-slate-900 dark:text-slate-200"
                    aria-hidden="true"
                  />
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${colors.dot}`}
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-5 font-display text-lg font-bold text-slate-900 dark:text-white">
                  {badge.label}
                </div>
                <div className="mt-1 text-xs text-[#837274] dark:text-slate-400">
                  {badge.caption}
                </div>
                <div className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-slate-900/70 dark:text-slate-300">
                  {colors.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export { normalizeBadge, FALLBACK_BADGES };
export type { PublicBadge, BadgeStatus };
