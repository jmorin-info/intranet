'use client';

/**
 * RssiDashboardSummary — résumé compact du tableau de bord RSSI
 * ------------------------------------------------------------
 * Composant autonome affiché dans l'onglet "Vue RSSI" du dashboard
 * principal. Il réutilise l'endpoint /rssi-dashboard/snapshot déjà
 * exposé par le backend et présente une grille compacte de KPI.
 *
 * Chaque card est cliquable et redirige vers la page détail
 * correspondante (incidents, documents, tickets, etc.).
 *
 * Compatible dark mode. Auto-contenu : aucune prop obligatoire.
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardContent, Skeleton, Button } from '@omnitech/ui';
import { SystemHealthCompact } from '@/components/widgets/system-health-compact';
import { LdapPendingWidget } from '@/components/widgets/ldap-pending-widget';
import { SmsiIndicatorsWidget } from '@/components/widgets/smsi-indicators-widget';
import {
  ShieldAlert,
  FileText,
  Ticket,
  Rss,
  ScrollText,
  KeyRound,
  ListChecks,
  Activity,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

/** Forme renvoyée par GET /rssi-dashboard/snapshot */
interface RssiSnapshot {
  generatedAt: string;
  incidents: { open: number; critical: number; thisMonth: number };
  documents: { inReview: number; approvedLast30d: number; dueForReview: number };
  tickets: { open: number; avgResolutionHours: number };
  veille: { alertsLast7d: number; critical: number };
  chartes: { active: number; pendingSignatures: number };
  users: { active: number; mfaEnabled: number; mfaCoveragePct: number };
  accessReviews: { pending: number; overdue: number };
  audit: { eventsLast24h: number; failedLoginsLast24h: number };
}

/* Threshold color helpers — consistent with RSSI dashboard page */
function thresholdColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function thresholdBarBg(pct: number): string {
  if (pct >= 80) return 'bg-emerald-500';
  if (pct >= 50) return 'bg-amber-400';
  return 'bg-red-400';
}

interface KpiCard {
  label: string;
  value: number | string;
  sub?: string;
  href: string;
  icon: React.ElementType;
  tone: 'navy' | 'red' | 'amber' | 'blue' | 'emerald' | 'violet';
  urgent?: boolean;
  /** Optional percentage for mini-bar visualization */
  barPct?: number;
}

/** Classes Tailwind par tonalité (cohérentes avec la charte SEAL) */
const toneStyles: Record<KpiCard['tone'], { bg: string; icon: string; ring: string }> = {
  navy: {
    bg: 'bg-navy/5 dark:bg-slate-800/60',
    icon: 'text-navy dark:text-blue-300',
    ring: 'ring-navy/10',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    icon: 'text-red-600 dark:text-red-400',
    ring: 'ring-red-200/50',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    icon: 'text-amber-600 dark:text-amber-400',
    ring: 'ring-amber-200/50',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    icon: 'text-blue-600 dark:text-blue-400',
    ring: 'ring-blue-200/50',
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    icon: 'text-emerald-600 dark:text-emerald-400',
    ring: 'ring-emerald-200/50',
  },
  violet: {
    bg: 'bg-violet-50 dark:bg-violet-900/20',
    icon: 'text-violet-600 dark:text-violet-400',
    ring: 'ring-violet-200/50',
  },
};

export function RssiDashboardSummary() {
  const [data, setData] = useState<RssiSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    api
      .get<RssiSnapshot>('/rssi-dashboard/snapshot')
      .then((r) => setData(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  /* Auto-refresh every 60s — consistent with RSSI dashboard page */
  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  // État d'erreur avec retry
  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
          <p className="text-sm text-taupe dark:text-slate-400 mb-3">
            Impossible de charger les indicateurs RSSI.
          </p>
          <Button size="sm" variant="secondary" onClick={load}>
            <RefreshCw className="h-4 w-4" /> Réessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Loading state — squelettes
  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="py-4">
                <Skeleton className="h-14 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Construction des cards à partir du snapshot
  const cards: KpiCard[] = [
    {
      label: 'Incidents ouverts',
      value: data.incidents.open,
      sub: `${data.incidents.critical} critiques`,
      href: '/incidents',
      icon: ShieldAlert,
      tone: data.incidents.critical > 0 ? 'red' : 'navy',
      urgent: data.incidents.critical > 0,
    },
    {
      label: 'Documents en revue',
      value: data.documents.inReview,
      sub: `${data.documents.dueForReview} à rafraîchir`,
      href: '/documents?status=IN_REVIEW',
      icon: FileText,
      tone: 'blue',
    },
    {
      label: 'Tickets ouverts',
      value: data.tickets.open,
      sub: `MTTR ${data.tickets.avgResolutionHours}h`,
      href: '/tickets',
      icon: Ticket,
      tone: 'amber',
    },
    {
      label: 'Alertes veille (7j)',
      value: data.veille.alertsLast7d,
      sub: `${data.veille.critical} critiques`,
      href: '/veille',
      icon: Rss,
      tone: data.veille.critical > 0 ? 'red' : 'emerald',
    },
    {
      label: 'Chartes à signer',
      value: data.chartes.pendingSignatures,
      sub: `${data.chartes.active} actives`,
      href: '/admin/chartes',
      icon: ScrollText,
      tone: 'violet',
    },
    {
      label: 'Couverture MFA',
      value: `${data.users.mfaCoveragePct}%`,
      sub: `${data.users.mfaEnabled}/${data.users.active} utilisateurs`,
      href: '/admin/users',
      icon: KeyRound,
      tone: data.users.mfaCoveragePct >= 80 ? 'emerald' : 'amber',
      barPct: data.users.mfaCoveragePct,
    },
    {
      label: 'Revues d\u2019acces',
      value: data.accessReviews.pending,
      sub: `${data.accessReviews.overdue} en retard`,
      href: '/admin/access-reviews',
      icon: ListChecks,
      tone: data.accessReviews.overdue > 0 ? 'red' : 'navy',
    },
    {
      label: 'Audit 24h',
      value: data.audit.eventsLast24h,
      sub: `${data.audit.failedLoginsLast24h} logins échoués`,
      href: '/admin/audit',
      icon: Activity,
      tone: data.audit.failedLoginsLast24h > 5 ? 'amber' : 'navy',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Entête + bouton vue détaillée */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-taupe dark:text-slate-500">
            Vue RSSI consolidée
          </p>
          <p className="text-xs text-taupe dark:text-slate-400 mt-0.5">
            Snapshot généré {new Date(data.generatedAt).toLocaleTimeString('fr-FR')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} title="Actualiser">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Link href="/admin/rssi-dashboard">
            <Button size="sm" variant="secondary">
              Vue détaillée <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Grille KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          const s = toneStyles[c.tone];
          return (
            <Link key={c.label} href={c.href}>
              <Card
                hoverable
                className={`h-full ${s.bg} ring-1 ${s.ring} hover:scale-[1.02] transition-all duration-200`}
              >
                <CardContent className="py-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="h-8 w-8 rounded-lg bg-white/70 dark:bg-slate-900/50 flex items-center justify-center">
                      <Icon className={`h-4 w-4 ${s.icon}`} />
                    </div>
                    <p className="text-[11px] text-taupe dark:text-slate-400 truncate">
                      {c.label}
                    </p>
                  </div>
                  <p
                    className={`text-2xl font-medium tabular-nums ${
                      c.barPct != null ? thresholdColor(c.barPct) : 'text-navy dark:text-white'
                    } ${c.urgent ? 'badge-pulse' : ''}`}
                  >
                    {c.value}
                  </p>
                  {c.barPct != null && (
                    <div className="h-1 rounded-full bg-gray-200 dark:bg-slate-700 mt-1.5 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${thresholdBarBg(c.barPct)}`} style={{ width: `${c.barPct}%` }} />
                    </div>
                  )}
                  {c.sub && (
                    <p className="text-[10px] text-taupe/80 dark:text-slate-500 mt-0.5">
                      {c.sub}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Widgets existants — réutilisés tels quels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SystemHealthCompact />
        <LdapPendingWidget />
      </div>

      <SmsiIndicatorsWidget />
    </div>
  );
}

export default RssiDashboardSummary;
