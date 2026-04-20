'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';
import { Card, CardContent, CardHeader, Badge, Button, Skeleton } from '@omnitech/ui';
import { SmsiIndicatorsWidget } from '@/components/widgets/smsi-indicators-widget';
import {
  ShieldCheck, AlertTriangle, Ticket, Rss,
  Clock, BarChart3, Download,
  Users, ScrollText, Newspaper, PenLine, Activity,
  ShieldAlert, KeyRound, ListChecks, AlertOctagon, Info, Bell, Printer,
  RefreshCw, Flame,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

/* ── Helper: threshold color for percentage KPIs ── */
function thresholdColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 50) return 'text-amber-600';
  return 'text-red-600';
}

function thresholdBg(pct: number): string {
  if (pct >= 80) return 'bg-emerald-500';
  if (pct >= 50) return 'bg-amber-400';
  return 'bg-red-400';
}

/* ── Severity style map (SEAL palette) ── */
const SEV_DEFAULT = { bg: 'bg-[#70916a]/15', text: 'text-[#70916a]', label: 'Faible' } as const;
const SEVERITY_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  CRITICAL: { bg: 'bg-[#cc0000]/10', text: 'text-[#cc0000]', label: 'Critique' },
  HIGH: { bg: 'bg-[#892034]/10', text: 'text-[#892034]', label: 'Haute' },
  MEDIUM: { bg: 'bg-[#c68200]/10', text: 'text-[#c68200]', label: 'Moyenne' },
  LOW: SEV_DEFAULT,
};

function getSev(severity: string) {
  return SEVERITY_STYLE[severity] ?? SEV_DEFAULT;
}

interface RSSIData {
  compliance: { total: number; covered: number; coveragePercent: number; byDomain: Record<string, { total: number; covered: number }> };
  stats: { totalDocuments: number; approvedDocuments: number; pendingReview: number; pendingApproval: number; overdueRevision: number };
  veille: { total: number; unprocessed: number; processed: number };
  tickets: { open: number; inProgress: number; resolved: number };
  alerts: number;
  externalAccess: { total: number; dueReview: number };
  chartes: { total: number; signedCount: number; unsignedCount: number };
  latestBulletin: { title: string; createdAt: string; itemCount: number } | null;
}

interface IncidentRow {
  id: string;
  reference: string;
  title: string;
  severity: string;
  status: string;
  category: string;
  detectedAt: string;
}

interface VeilleItem {
  id: string;
  title: string;
  severity: string;
  source: string;
  publishedAt: string;
  createdAt: string;
}

const AUTO_REFRESH_MS = 60_000;

export default function RSSIDashboardPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<RSSIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [docStats, setDocStats] = useState<any>(null);
  const [ticketAnalytics, setTicketAnalytics] = useState<any>(null);
  const [uptime, setUptime] = useState<number | null>(null);
  const [deptBreakdown, setDeptBreakdown] = useState<Array<{ id: string; name: string; code: string; _count: { users: number; userMemberships: number } }>>([]);
  const [complianceOverdue, setComplianceOverdue] = useState<number>(0);
  const [mfaAdoption, setMfaAdoption] = useState<number | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<Array<{ id: string; title: string; severity: string; createdAt: string; isActive: boolean }>>([]);
  const [recentIncidents, setRecentIncidents] = useState<IncidentRow[]>([]);
  const [recentVeille, setRecentVeille] = useState<VeilleItem[]>([]);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(() => {
    Promise.all([
      api.get('/iso-analyzer/compliance-summary').catch(() => ({ data: { total: 0, covered: 0, coveragePercent: 0, byDomain: {} } })),
      api.get('/reports/dashboard-stats').catch(() => ({ data: { totalDocuments: 0, approvedDocuments: 0, pendingReview: 0, pendingApproval: 0, overdueRevision: 0 } })),
      api.get('/veille/stats').catch(() => ({ data: { total: 0, unprocessed: 0, processed: 0, bySeverity: {} } })),
      api.get('/tickets/stats').catch(() => ({ data: { open: 0, inProgress: 0, resolved: 0 } })),
      api.get('/alerts').catch(() => ({ data: [] })),
      api.get('/external-access', { params: { isActive: 'true', limit: 1 } }).catch(() => ({ data: { data: [], meta: { total: 0 } } })),
      api.get('/external-access/due-review').catch(() => ({ data: [] })),
      api.get('/chartes').catch(() => ({ data: [] })),
      api.get('/veille/bulletins', { params: { limit: 1 } }).catch(() => ({ data: { data: [], meta: { total: 0 } } })),
    ]).then(([comp, stats, veille, tickets, alerts, extAccess, dueReview, chartes, bulletins]) => {
      const chartesData = Array.isArray(chartes.data) ? chartes.data : (chartes.data?.data || []);
      const bulletinList = Array.isArray(bulletins.data) ? bulletins.data : (bulletins.data?.data || []);
      const dueReviewList = Array.isArray(dueReview.data) ? dueReview.data : [];
      const veilleData = veille.data || { total: 0, unprocessed: 0, processed: 0 };

      // Extract mfaAdoption from the same stats call (avoids second /reports/dashboard-stats request)
      if (stats.data?.mfaAdoption != null) setMfaAdoption(stats.data.mfaAdoption);

      setData({
        compliance: comp.data ?? { total: 0, covered: 0, coveragePercent: 0, byDomain: {} },
        stats: stats.data ?? { totalDocuments: 0, approvedDocuments: 0, pendingReview: 0, pendingApproval: 0, overdueRevision: 0 },
        veille: veilleData,
        tickets: tickets.data ?? { open: 0, inProgress: 0, resolved: 0 },
        alerts: Array.isArray(alerts.data) ? alerts.data.length : 0,
        externalAccess: {
          total: extAccess.data?.meta?.total ?? 0,
          dueReview: dueReviewList?.length ?? 0,
        },
        chartes: {
          total: chartesData?.length ?? 0,
          signedCount: chartesData?.filter((c: Record<string, unknown>) => c.isSigned || c.signedAt)?.length ?? 0,
          unsignedCount: chartesData?.filter((c: Record<string, unknown>) => !c.isSigned && !c.signedAt)?.length ?? 0,
        },
        latestBulletin: bulletinList?.length > 0
          ? {
              title: bulletinList[0]?.title ?? '',
              createdAt: bulletinList[0]?.createdAt ?? '',
              itemCount: bulletinList[0]?.itemCount || bulletinList[0]?._count?.items || 0,
            }
          : null,
      });
      setLastRefresh(new Date());
    }).catch(() => {}).finally(() => setLoading(false));

    api.get('/documents/statistics').then(r => setDocStats(r.data)).catch(() => {});
    api.get('/tickets/analytics').then(r => setTicketAnalytics(r.data)).catch(() => {});
    api.get('/departments').then(({ data: d }) => setDeptBreakdown(Array.isArray(d) ? d : (d?.data || []))).catch(() => {});
    api.get('/health/metrics').then(({ data: d }) => {
      const match = typeof d === 'string' ? d.match(/process_uptime_seconds (\d+)/) : null;
      if (match?.[1]) setUptime(parseInt(match[1]));
    }).catch(() => {});
    api.get('/compliance-tasks/overdue').then(({ data: d }) => {
      setComplianceOverdue(Array.isArray(d) ? d.length : (d?.count ?? 0));
    }).catch(() => {});
    // mfaAdoption is now extracted from the Promise.all stats call above
    api.get('/alerts', { params: { limit: 5, isActive: 'true' } }).then(({ data: d }) => {
      const list = Array.isArray(d) ? d : (d?.data || []);
      setRecentAlerts(list.slice(0, 5));
    }).catch(() => {});

    // Recent incidents (5)
    api.get('/incidents', { params: { limit: 5, sortBy: 'detectedAt', sortOrder: 'desc' } }).then(({ data: d }) => {
      const list = Array.isArray(d) ? d : (d?.data || []);
      setRecentIncidents(list.slice(0, 5));
    }).catch(() => {});

    // Recent veille items (5)
    api.get('/veille', { params: { limit: 5, sortBy: 'createdAt', sortOrder: 'desc' } }).then(({ data: d }) => {
      const list = Array.isArray(d) ? d : (d?.data || []);
      setRecentVeille(list.slice(0, 5));
    }).catch(() => {});
  }, []);

  /* Auto-refresh every 60s */
  useEffect(() => {
    loadData();
    intervalRef.current = setInterval(loadData, AUTO_REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [loadData]);

  if (loading) return <div className="space-y-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>;
  if (!data) return null;

  /* Chartes coverage percent */
  const chartesCoveragePct = data.chartes.total > 0 ? Math.round((data.chartes.signedCount / data.chartes.total) * 100) : 0;
  /* Tickets resolved percent */
  const ticketsTotal = data.tickets.open + data.tickets.inProgress + data.tickets.resolved;
  const ticketsResolvedPct = ticketsTotal > 0 ? Math.round((data.tickets.resolved / ticketsTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      <style jsx global>{`
        @media print {
          nav, aside, header, .no-print, button { display: none !important; }
          body { background: white !important; }
          main { padding: 0 !important; margin: 0 !important; }
          .print-break { page-break-after: always; }
          * { color-adjust: exact !important; -webkit-print-color-adjust: exact !important; }
        }
      `}</style>
      <div className="hidden print:block mb-6">
        <h2 className="text-2xl font-medium">OMNITECH Security — Tableau de bord RSSI</h2>
        <p className="text-sm text-gray-500">Généré le {new Date().toLocaleDateString('fr-FR')}</p>
      </div>
      <div className="flex items-center justify-between animate-fade-in-up stagger-item">
        <div>
          <h1 className="text-2xl font-medium text-navy dark:text-white">Tableau de bord RSSI</h1>
          <p className="text-sm text-taupe dark:text-slate-400 mt-1">
            Vue centralisée de la sécurité — ISO 27001 · NIS2 · ANSSI · PSSI
          </p>
          <p className="text-[10px] text-taupe/60 dark:text-slate-500 mt-0.5">
            Maj auto 60s — derniere : {lastRefresh.toLocaleTimeString('fr-FR')}
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button variant="secondary" size="sm" onClick={loadData} title="Actualiser">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimer / PDF
          </Button>
          <Link href="/admin/reports">
            <Button variant="secondary" size="sm"><Download className="h-4 w-4" /> Rapport SMSI</Button>
          </Link>
        </div>
      </div>

      {/* Compliance overview with ring chart */}
      <Card accent className="animate-fade-in-up stagger-item">
        <CardContent>
          <div className="flex items-center gap-6">
            {/* SVG Ring / Donut chart */}
            {(() => {
              const pct = data.compliance.coveragePercent;
              const radius = 38;
              const circumference = 2 * Math.PI * radius;
              const offset = circumference - (pct / 100) * circumference;
              const ringColor = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
              return (
                <div className="relative flex-shrink-0">
                  <svg width="96" height="96" viewBox="0 0 96 96" className="rotate-[-90deg]">
                    <circle
                      cx="48" cy="48" r={radius}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="10"
                      className="text-gray-200 dark:text-slate-700"
                    />
                    <circle
                      cx="48" cy="48" r={radius}
                      fill="none"
                      stroke={ringColor}
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeDasharray={circumference}
                      strokeDashoffset={offset}
                      style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
                    <span className="text-xl font-medium text-navy dark:text-white leading-none">{pct}%</span>
                    <ShieldCheck className="h-3.5 w-3.5 mt-0.5" style={{ color: ringColor }} />
                  </div>
                </div>
              );
            })()}
            <div className="flex-1">
              <h2 className="text-lg font-medium text-navy dark:text-white">Conformité ISO 27001</h2>
              <p className="text-sm text-taupe dark:text-slate-400 mt-0.5">
                {data.compliance.covered}/{data.compliance.total} contrôles couverts
              </p>
              <div className="h-2.5 rounded-full bg-gray-200 dark:bg-slate-700 mt-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    data.compliance.coveragePercent >= 80 ? 'bg-emerald-500' :
                    data.compliance.coveragePercent >= 50 ? 'bg-amber-400' : 'bg-red-400'
                  }`}
                  style={{ width: `${data.compliance.coveragePercent}%` }}
                />
              </div>
              <div className="flex gap-4 mt-2 text-xs text-taupe dark:text-slate-400">
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />≥ 80% Conforme</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-400" />50–79% Partiel</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-400" />&lt; 50% Critique</span>
              </div>
            </div>
            <div className="text-right">
              <Link href="/admin/compliance" className="text-xs text-primary hover:underline">Détail →</Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {uptime !== null && (
        <Card><CardContent className="py-3 flex items-center gap-3">
          <Activity className="h-5 w-5 text-emerald-500" />
          <div>
            <p className="text-xs text-taupe dark:text-slate-400">Uptime serveur</p>
            <p className="text-sm font-medium text-navy dark:text-white">
              {Math.floor(uptime / 86400)}j {Math.floor((uptime % 86400) / 3600)}h {Math.floor((uptime % 3600) / 60)}m
            </p>
          </div>
        </CardContent></Card>
      )}

      {/* Consolidated SMSI KPI widget (ISO 27001) */}
      <div className="animate-fade-in-up stagger-item">
        <SmsiIndicatorsWidget />
      </div>

      {/* KPI summary with threshold colors and mini-bars */}
      <div className="animate-fade-in-up stagger-item grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Conformite % */}
        <Card className="h-full">
          <CardContent className="py-4">
            <p className="text-xs text-taupe dark:text-slate-400 mb-1">Conformité %</p>
            <p className={`text-2xl font-medium tabular-nums ${thresholdColor(data.compliance.coveragePercent)}`}>{data.compliance.coveragePercent}%</p>
            <div className="h-1.5 rounded-full bg-gray-200 dark:bg-slate-700 mt-2 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${thresholdBg(data.compliance.coveragePercent)}`} style={{ width: `${data.compliance.coveragePercent}%` }} />
            </div>
          </CardContent>
        </Card>
        {/* Incidents actifs */}
        <Link href="/incidents">
          <Card hoverable className="h-full">
            <CardContent className="py-4">
              <p className="text-xs text-taupe dark:text-slate-400 mb-1">Incidents actifs</p>
              <p className="text-2xl font-medium text-navy dark:text-white tabular-nums">{recentIncidents.filter(i => i.status !== 'CLOSED').length}</p>
              <p className="text-[10px] text-red-500 mt-1">{recentIncidents.filter(i => i.severity === 'CRITICAL').length} critiques</p>
            </CardContent>
          </Card>
        </Link>
        {/* Tickets ouverts */}
        <Link href="/tickets">
          <Card hoverable className="h-full">
            <CardContent className="py-4">
              <p className="text-xs text-taupe dark:text-slate-400 mb-1">Tickets ouverts</p>
              <p className="text-2xl font-medium text-navy dark:text-white tabular-nums">{data.tickets.open + data.tickets.inProgress}</p>
              <div className="h-1.5 rounded-full bg-gray-200 dark:bg-slate-700 mt-2 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${thresholdBg(ticketsResolvedPct)}`} style={{ width: `${ticketsResolvedPct}%` }} />
              </div>
              <p className="text-[10px] text-taupe dark:text-slate-500 mt-0.5">{ticketsResolvedPct}% resolus</p>
            </CardContent>
          </Card>
        </Link>
        {/* MFA coverage */}
        <Link href="/admin/users">
          <Card hoverable className="h-full">
            <CardContent className="py-4">
              <p className="text-xs text-taupe dark:text-slate-400 mb-1">MFA coverage</p>
              <p className={`text-2xl font-medium tabular-nums ${mfaAdoption != null ? thresholdColor(mfaAdoption) : 'text-navy dark:text-white'}`}>{mfaAdoption != null ? `${mfaAdoption}%` : '\u2014'}</p>
              {mfaAdoption != null && (
                <div className="h-1.5 rounded-full bg-gray-200 dark:bg-slate-700 mt-2 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${thresholdBg(mfaAdoption)}`} style={{ width: `${mfaAdoption}%` }} />
                </div>
              )}
            </CardContent>
          </Card>
        </Link>
        {/* Chartes pending */}
        <Link href="/chartes">
          <Card hoverable className="h-full">
            <CardContent className="py-4">
              <p className="text-xs text-taupe dark:text-slate-400 mb-1">Chartes pending</p>
              <p className={`text-2xl font-medium tabular-nums ${data.chartes.unsignedCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{data.chartes.unsignedCount}</p>
              <div className="h-1.5 rounded-full bg-gray-200 dark:bg-slate-700 mt-2 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${thresholdBg(chartesCoveragePct)}`} style={{ width: `${chartesCoveragePct}%` }} />
              </div>
              <p className="text-[10px] text-taupe dark:text-slate-500 mt-0.5">{chartesCoveragePct}% signees</p>
            </CardContent>
          </Card>
        </Link>
        {/* Docs en retard */}
        <Link href="/documents">
          <Card hoverable className="h-full">
            <CardContent className="py-4">
              <p className="text-xs text-taupe dark:text-slate-400 mb-1">Docs en retard</p>
              <p className={`text-2xl font-medium tabular-nums ${data.stats.overdueRevision > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{data.stats.overdueRevision}</p>
              <p className="text-[10px] text-taupe dark:text-slate-500 mt-1">{data.stats.pendingReview} en revue</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Key metrics */}
      <div className="animate-fade-in-up stagger-item grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Documents en retard', value: data.stats.overdueRevision, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/30', href: '/documents' },
          { label: 'En attente de revue', value: data.stats.pendingReview, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/30', href: '/documents/pending' },
          { label: 'Alertes veille non traitées', value: data.veille.unprocessed, icon: Rss, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/30', href: '/veille' },
          { label: 'Tickets ouverts', value: data.tickets.open + data.tickets.inProgress, icon: Ticket, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/30', href: '/tickets' },
        ].map(m => (
          <Link key={m.label} href={m.href}>
            <Card hoverable className="h-full">
              <CardContent className="py-4">
                <div className={`h-10 w-10 rounded-xl ${m.bg} flex items-center justify-center mb-2`}>
                  <m.icon className={`h-5 w-5 ${m.color}`} />
                </div>
                <p className="text-2xl font-medium text-navy dark:text-white">{m.value}</p>
                <p className="text-xs text-taupe dark:text-slate-400">{m.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Additional RSSI metrics */}
      <div className="animate-fade-in-up stagger-item grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Veille unprocessed */}
        <Link href="/veille">
          <Card hoverable className="h-full">
            <CardContent className="py-4">
              <div className="h-10 w-10 rounded-xl bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center mb-2">
                <ShieldAlert className="h-5 w-5 text-orange-600" />
              </div>
              <p className="text-2xl font-medium text-navy dark:text-white">{data.veille.unprocessed}</p>
              <p className="text-xs text-taupe dark:text-slate-400">Alertes veille non traitées</p>
            </CardContent>
          </Card>
        </Link>

        {/* Compliance tasks overdue */}
        <Link href="/admin/compliance">
          <Card hoverable className="h-full">
            <CardContent className="py-4">
              <div className="h-10 w-10 rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center mb-2">
                <ListChecks className="h-5 w-5 text-red-600" />
              </div>
              <p className="text-2xl font-medium text-navy dark:text-white">{complianceOverdue}</p>
              <p className="text-xs text-taupe dark:text-slate-400">Tâches conformité en retard</p>
            </CardContent>
          </Card>
        </Link>

        {/* MFA adoption rate */}
        <Link href="/admin/users">
          <Card hoverable className="h-full">
            <CardContent className="py-4">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center mb-2">
                <KeyRound className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="text-2xl font-medium text-navy dark:text-white">{mfaAdoption != null ? `${mfaAdoption}%` : '—'}</p>
              <p className="text-xs text-taupe dark:text-slate-400">Taux adoption MFA</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Security operations cards */}
      <div className="animate-fade-in-up stagger-item grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* External access */}
        <Link href="/admin/external-access">
          <Card hoverable className="h-full">
            <CardContent className="py-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                  <Users className="h-5 w-5 text-indigo-600" />
                </div>
                <h3 className="text-sm font-medium text-navy dark:text-white">Accès prestataires</h3>
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-2xl font-medium text-navy dark:text-white">{data.externalAccess.total}</p>
                  <p className="text-xs text-taupe dark:text-slate-400">accès actifs</p>
                </div>
                {data.externalAccess.dueReview > 0 && (
                  <div>
                    <p className="text-2xl font-medium text-amber-600">{data.externalAccess.dueReview}</p>
                    <p className="text-xs text-amber-600">à revoir</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Chartes */}
        <Link href="/chartes">
          <Card hoverable className="h-full">
            <CardContent className="py-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                  <ScrollText className="h-5 w-5 text-emerald-600" />
                </div>
                <h3 className="text-sm font-medium text-navy dark:text-white">Chartes</h3>
              </div>
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-2xl font-medium text-navy dark:text-white">{data.chartes.total}</p>
                  <p className="text-xs text-taupe dark:text-slate-400">chartes publiées</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Bulletin cyber */}
        <Link href="/veille">
          <Card hoverable className="h-full">
            <CardContent className="py-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-sky-50 dark:bg-sky-900/30 flex items-center justify-center">
                  <Newspaper className="h-5 w-5 text-sky-600" />
                </div>
                <h3 className="text-sm font-medium text-navy dark:text-white">Bulletin cyber</h3>
              </div>
              {data.latestBulletin ? (
                <div>
                  <p className="text-sm font-medium text-navy dark:text-white truncate">{data.latestBulletin.title}</p>
                  <p className="text-xs text-taupe dark:text-slate-400 mt-1">
                    {new Date(data.latestBulletin.createdAt).toLocaleDateString('fr-FR')}
                    {data.latestBulletin.itemCount > 0 && ` — ${data.latestBulletin.itemCount} éléments`}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-taupe dark:text-slate-400">Aucun bulletin généré</p>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Derniers incidents & Alertes veille */}
      <div className="animate-fade-in-up stagger-item grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Derniers incidents */}
        <Card>
          <CardHeader>
            <h2 className="font-medium text-navy dark:text-white flex items-center gap-2">
              <Flame className="h-5 w-5 text-red-500" /> Derniers incidents
            </h2>
          </CardHeader>
          <CardContent>
            {recentIncidents.length === 0 ? (
              <p className="text-sm text-taupe dark:text-slate-400">Aucun incident recent.</p>
            ) : (
              <div className="space-y-2">
                {recentIncidents.map((inc) => {
                  const sev = getSev(inc.severity);
                  return (
                    <Link key={inc.id} href={`/incidents/${inc.id}`}>
                      <div className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${sev.bg} hover:opacity-80 transition-opacity`}>
                        <ShieldAlert className={`h-4 w-4 flex-shrink-0 ${sev.text}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-navy dark:text-white truncate">{inc.title}</p>
                          <p className="text-[10px] text-taupe dark:text-slate-500">{inc.reference} · {inc.category}</p>
                        </div>
                        <Badge variant={inc.severity === 'CRITICAL' ? 'error' : inc.severity === 'HIGH' ? 'warning' : 'info'} className="text-[10px] flex-shrink-0">
                          {sev.label}
                        </Badge>
                        <span className="text-xs text-taupe dark:text-slate-400 whitespace-nowrap">{formatRelativeTime(inc.detectedAt)}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
            <Link href="/incidents" className="mt-3 inline-block text-xs text-primary hover:underline">
              Voir tous les incidents →
            </Link>
          </CardContent>
        </Card>

        {/* Alertes veille */}
        <Card>
          <CardHeader>
            <h2 className="font-medium text-navy dark:text-white flex items-center gap-2">
              <Rss className="h-5 w-5 text-blue-500" /> Alertes veille
            </h2>
          </CardHeader>
          <CardContent>
            {recentVeille.length === 0 ? (
              <p className="text-sm text-taupe dark:text-slate-400">Aucune alerte veille recente.</p>
            ) : (
              <div className="space-y-2">
                {recentVeille.map((v) => {
                  const sev = getSev(v.severity);
                  return (
                    <div key={v.id} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${sev.bg}`}>
                      <Rss className={`h-4 w-4 flex-shrink-0 ${sev.text}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-navy dark:text-white truncate">{v.title}</p>
                        <p className="text-[10px] text-taupe dark:text-slate-500">{v.source}</p>
                      </div>
                      <Badge variant={v.severity === 'CRITICAL' ? 'error' : v.severity === 'HIGH' ? 'warning' : 'info'} className="text-[10px] flex-shrink-0">
                        {sev.label}
                      </Badge>
                      <span className="text-xs text-taupe dark:text-slate-400 whitespace-nowrap">{formatRelativeTime(v.publishedAt || v.createdAt)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <Link href="/veille" className="mt-3 inline-block text-xs text-primary hover:underline">
              Voir toute la veille →
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Ticket analytics & Document classification */}
      <div className="animate-fade-in-up stagger-item grid grid-cols-1 md:grid-cols-2 gap-4">
        {ticketAnalytics && (
          <Card>
            <CardHeader><h2 className="font-medium text-navy dark:text-white">Analytique tickets</h2></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center">
                  <p className="text-3xl font-medium text-navy dark:text-white">{ticketAnalytics.total}</p>
                  <p className="text-xs text-taupe dark:text-slate-400">Total</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-medium text-primary">{ticketAnalytics.avgResolutionHours}h</p>
                  <p className="text-xs text-taupe dark:text-slate-400">Résolution moyenne</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 text-center">
                  <p className="text-lg font-medium text-amber-600">{ticketAnalytics.open}</p>
                  <p className="text-[10px] text-taupe dark:text-slate-400">Ouverts</p>
                </div>
                <div className="flex-1 text-center">
                  <p className="text-lg font-medium text-emerald-600">{ticketAnalytics.resolved}</p>
                  <p className="text-[10px] text-taupe dark:text-slate-400">Résolus</p>
                </div>
              </div>
              {ticketAnalytics.byCategory?.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-700 space-y-1.5">
                  <p className="text-xs font-medium text-taupe dark:text-slate-400 mb-2">Par catégorie</p>
                  {ticketAnalytics.byCategory.slice(0, 5).map((c: any) => (
                    <div key={c.category} className="flex items-center gap-2 text-xs">
                      <span className="w-20 text-taupe dark:text-slate-400 truncate">{c.category}</span>
                      <div className="flex-1 h-2 bg-gray-200 dark:bg-slate-700 rounded-full">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${(c.count / ticketAnalytics.total) * 100}%` }} />
                      </div>
                      <span className="text-navy dark:text-white font-medium w-6 text-right">{c.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {docStats && (
          <Card>
            <CardHeader><h2 className="font-medium text-navy dark:text-white">Classification documents</h2></CardHeader>
            <CardContent>
              <div className="text-center mb-4">
                <p className="text-3xl font-medium text-navy dark:text-white">{docStats.total}</p>
                <p className="text-xs text-taupe dark:text-slate-400">Documents total</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-taupe dark:text-slate-400">Par classification</p>
                {docStats.byClassification?.map((c: any) => {
                  const colors: Record<string, string> = { SECRET: 'bg-red-500', CONFIDENTIEL: 'bg-amber-500', INTERNE: 'bg-blue-500', PUBLIC: 'bg-emerald-500' };
                  return (
                    <div key={c.classification} className="flex items-center gap-2 text-xs">
                      <span className="w-24 text-taupe dark:text-slate-400 truncate">{c.classification}</span>
                      <div className="flex-1 h-2 bg-gray-200 dark:bg-slate-700 rounded-full">
                        <div className={`h-full ${colors[c.classification] || 'bg-gray-400'} rounded-full`} style={{ width: `${(c.count / docStats.total) * 100}%` }} />
                      </div>
                      <span className="text-navy dark:text-white font-medium w-6 text-right">{c.count}</span>
                    </div>
                  );
                })}
              </div>
              {docStats.byStatus?.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-700 space-y-1.5">
                  <p className="text-xs font-medium text-taupe dark:text-slate-400 mb-2">Par statut</p>
                  {docStats.byStatus.map((s: any) => (
                    <div key={s.status} className="flex items-center gap-2 text-xs">
                      <span className="w-24 text-taupe dark:text-slate-400 truncate">{s.status}</span>
                      <div className="flex-1 h-2 bg-gray-200 dark:bg-slate-700 rounded-full">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(s.count / docStats.total) * 100}%` }} />
                      </div>
                      <span className="text-navy dark:text-white font-medium w-6 text-right">{s.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Department breakdown */}
      {deptBreakdown.length > 0 && (
        <Card>
          <CardHeader><h2 className="font-medium text-navy dark:text-white flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Répartition par département</h2></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {deptBreakdown.map(dept => {
                const userCount = (dept._count?.users ?? 0) + (dept._count?.userMemberships ?? 0);
                const maxCount = Math.max(...deptBreakdown.map(d => (d._count?.users ?? 0) + (d._count?.userMemberships ?? 0)), 1);
                return (
                  <div key={dept.id} className="flex items-center gap-3 text-sm">
                    <span className="w-32 text-navy dark:text-white font-medium truncate">{dept.name}</span>
                    <div className="flex-1 h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(userCount / maxCount) * 100}%` }} />
                    </div>
                    <span className="text-taupe dark:text-slate-400 font-medium w-8 text-right">{userCount}</span>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-taupe dark:text-slate-400 mt-3">Total : {deptBreakdown.reduce((sum, d) => sum + (d._count?.users ?? 0) + (d._count?.userMemberships ?? 0), 0)} utilisateurs</p>
          </CardContent>
        </Card>
      )}

      {/* Domain coverage */}
      <Card className="animate-fade-in-up stagger-item">
        <CardHeader><h2 className="font-medium text-navy dark:text-white">Couverture par domaine</h2></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(data.compliance?.byDomain ?? {}).map(([domain, stats]) => {
              const pct = stats.total > 0 ? Math.round((stats.covered / stats.total) * 100) : 0;
              return (
                <div key={domain}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-navy dark:text-white font-medium">{domain}</span>
                    <span className="text-taupe">{stats.covered}/{stats.total} ({pct}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                    <div className={`h-full rounded-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent security alerts */}
      {recentAlerts.length > 0 && (
        <Card className="animate-fade-in-up stagger-item">
          <CardHeader>
            <h2 className="font-medium text-navy dark:text-white flex items-center gap-2">
              <Bell className="h-5 w-5 text-red-500" /> Alertes sécurité récentes
            </h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentAlerts.map((alert) => {
                const severityMap: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
                  P1: { icon: AlertOctagon, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20', label: 'Critique' },
                  P2: { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20', label: 'Important' },
                  P3: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20', label: 'Info' },
                };
                const cfg = (severityMap[alert.severity] ?? severityMap['P3'])!;
                const Icon = cfg.icon;
                return (
                  <div key={alert.id} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${cfg.bg}`}>
                    <Icon className={`h-4 w-4 flex-shrink-0 ${cfg.color}`} />
                    <p className="flex-1 text-sm font-medium text-navy dark:text-white truncate">{alert.title}</p>
                    <span className={`text-[10px] font-medium uppercase ${cfg.color}`}>{cfg.label}</span>
                    <span className="text-xs text-taupe dark:text-slate-400 whitespace-nowrap">{formatRelativeTime(alert.createdAt)}</span>
                  </div>
                );
              })}
            </div>
            <Link href="/alerts" className="mt-3 inline-block text-xs text-primary hover:underline">
              Voir toutes les alertes →
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Quick links */}
      <div className="animate-fade-in-up stagger-item grid grid-cols-2 md:grid-cols-5 gap-4 print:hidden">
        <Link href="/admin/compliance"><Card hoverable><CardContent className="text-center py-6"><ShieldCheck className="h-8 w-8 text-primary mx-auto mb-2" /><p className="text-sm font-medium text-navy dark:text-white">Analyse écarts</p></CardContent></Card></Link>
        <Link href="/veille"><Card hoverable><CardContent className="text-center py-6"><Rss className="h-8 w-8 text-primary mx-auto mb-2" /><p className="text-sm font-medium text-navy dark:text-white">Veille cyber</p></CardContent></Card></Link>
        <Link href="/admin/audit"><Card hoverable><CardContent className="text-center py-6"><BarChart3 className="h-8 w-8 text-primary mx-auto mb-2" /><p className="text-sm font-medium text-navy dark:text-white">Journal audit</p></CardContent></Card></Link>
        <Link href="/admin/signatures"><Card hoverable><CardContent className="text-center py-6"><PenLine className="h-8 w-8 text-primary mx-auto mb-2" /><p className="text-sm font-medium text-navy dark:text-white">Signatures</p></CardContent></Card></Link>
        <Link href="/alerts"><Card hoverable><CardContent className="text-center py-6"><AlertTriangle className="h-8 w-8 text-primary mx-auto mb-2" /><p className="text-sm font-medium text-navy dark:text-white">Alertes ({data.alerts})</p></CardContent></Card></Link>
      </div>
    </div>
  );
}
