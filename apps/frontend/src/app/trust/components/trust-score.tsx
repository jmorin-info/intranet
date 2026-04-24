'use client';

import { useEffect, useState } from 'react';
import {
  Activity,
  KeyRound,
  Lock,
  ShieldAlert,
  AlertTriangle,
} from 'lucide-react';

const API = (process.env.NEXT_PUBLIC_API_URL || '/api').replace(
  /\/api\/?$/,
  '/api/v1',
);

type BadgeStatus = 'OK' | 'PARTIAL' | 'UNKNOWN';

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

const BADGE_ICONS: Record<string, typeof KeyRound> = {
  identities: KeyRound,
  continuity: Activity,
  crypto: Lock,
  audit: ShieldAlert,
};

const BADGE_COLORS: Record<BadgeStatus, { dot: string; bg: string; ring: string; label: string }> = {
  OK: {
    dot: 'bg-[#006233]',
    bg: 'bg-[#006233]/8',
    ring: 'ring-[#006233]/25',
    label: 'Conforme',
  },
  PARTIAL: {
    dot: 'bg-[#f9964a]',
    bg: 'bg-[#f9964a]/8',
    ring: 'ring-[#f9964a]/25',
    label: 'Partiel',
  },
  UNKNOWN: {
    dot: 'bg-[#837274]',
    bg: 'bg-[#837274]/8',
    ring: 'ring-[#837274]/25',
    label: 'Non calculé',
  },
};

/**
 * Appel /trust/score (public, sans auth). Affiche :
 *  - le score global /100 si calculé
 *  - un fallback "Score indisponible" si le service renvoie 503 ou null
 *  - 4 badges domaines qualitatifs (sans signaux sensibles)
 */
export function TrustScore() {
  const [data, setData] = useState<PublicScore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/trust/score`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((json: PublicScore) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setError('unavailable');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
            className="mt-1 font-display text-2xl font-bold text-[#004469] sm:text-3xl dark:text-white"
          >
            Score cyber public
          </h2>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {/* Colonne score global */}
        <div className="relative overflow-hidden rounded-2xl border border-[#004469]/10 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
                  <div className="font-display text-6xl font-bold text-[#004469] dark:text-white">
                    {data?.score}
                  </div>
                  <div className="pb-2 text-lg text-[#837274] dark:text-slate-400">
                    / {data?.scale ?? 100}
                  </div>
                </div>
                <p className="mt-3 text-sm text-[#837274] dark:text-slate-400">
                  Mis à jour le{' '}
                  {data?.publishedAt
                    ? new Date(data.publishedAt).toLocaleDateString('fr-FR')
                    : '—'}
                </p>
              </>
            )}
          </div>
        </div>

        {/* Grille badges domaines */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(data?.badges ?? PLACEHOLDER_BADGES).map((badge) => {
            const Icon = BADGE_ICONS[badge.key] ?? ShieldAlert;
            const colors = BADGE_COLORS[badge.status] ?? BADGE_COLORS.UNKNOWN;
            return (
              <div
                key={badge.key}
                className={`group relative overflow-hidden rounded-2xl border border-[#004469]/10 ${colors.bg} p-4 ring-1 ${colors.ring} transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800`}
              >
                <div className="flex items-center justify-between">
                  <Icon
                    className="h-5 w-5 text-[#004469] dark:text-slate-200"
                    aria-hidden="true"
                  />
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${colors.dot}`}
                    aria-hidden="true"
                  />
                </div>
                <div className="mt-5 font-display text-lg font-bold text-[#004469] dark:text-white">
                  {badge.label}
                </div>
                <div className="mt-1 text-xs text-[#837274] dark:text-slate-400">
                  {badge.caption}
                </div>
                <div className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-[#004469]/70 dark:text-slate-300">
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

const PLACEHOLDER_BADGES: PublicBadge[] = [
  { key: 'identities', label: 'Identités', status: 'UNKNOWN', caption: 'MFA & contrôle d’accès' },
  { key: 'continuity', label: 'Continuité', status: 'UNKNOWN', caption: 'Sauvegardes testées' },
  { key: 'crypto', label: 'Crypto', status: 'UNKNOWN', caption: 'TLS 1.2+ / HSTS' },
  { key: 'audit', label: 'Audit', status: 'UNKNOWN', caption: 'Traçabilité 24/7' },
];
