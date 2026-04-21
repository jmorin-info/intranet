'use client';

/**
 * Dashboard monitoring système — style Nextcloud.
 *
 * Trois sections :
 *   1. Santé système     : CPU, RAM, disque, uptime
 *   2. Utilisation       : requêtes API / heure, uploads, users actifs
 *   3. Stockage          : par utilisateur, trié par Go utilisés
 *
 * Poll auto toutes les 30 secondes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/page-header';
import { AdminGroupTabs } from '@/components/layout/admin-group-tabs';
import { Card, CardContent, CardHeader, EmptyState, Skeleton } from '@omnitech/ui';
import {
  Activity,
  Cpu,
  HardDrive,
  MemoryStick,
  Clock,
  TrendingUp,
  Database,
  Users,
  RefreshCw,
} from 'lucide-react';

// -----------------------------------------------------------------------------
// Types — must match backend contracts
// -----------------------------------------------------------------------------

interface SystemResources {
  cpu: { count: number; loadAvg: [number, number, number]; model: string };
  memory: { totalMb: number; freeMb: number; usedMb: number; usagePct: number };
  disk: { totalGb: number; freeGb: number; usedGb: number; usagePct: number };
  uptime: { secondsTotal: number; bootTime: string };
}

interface HourlyBucket {
  hour: string;
  count: number;
}

interface IntranetUsage {
  apiRequests24h: number;
  activeUsers24h: number;
  documentsUploaded24h: number;
  mediaUploaded24h: number;
  hourlyRequests: HourlyBucket[];
}

interface StoragePerUserRow {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string | null;
  documentsBytes: number;
  mediaBytes: number;
  totalBytes: number;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 o';
  const k = 1024;
  const sizes = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d} j ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

function gaugeColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function gaugeText(pct: number): string {
  if (pct >= 90) return 'text-red-600 dark:text-red-400';
  if (pct >= 70) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
}

/** CPU load as a percentage: load avg / cpu cores. */
function loadPct(load: number, cores: number): number {
  if (!cores) return 0;
  return Math.min(100, Math.round((load / cores) * 100));
}

function formatHourLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function initials(firstName: string, lastName: string): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

function ProgressBar({ pct, colorClass }: { pct: number; colorClass: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="w-full h-2 rounded-full bg-seal-gray-100 dark:bg-slate-800 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function RamDonut({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - clamped / 100);
  const colorHex =
    clamped >= 90 ? '#dc2626' : clamped >= 70 ? '#f59e0b' : '#10b981';
  return (
    <div className="relative h-24 w-24">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle
          cx="40"
          cy="40"
          r={r}
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
          className="text-seal-gray-100 dark:text-slate-800"
        />
        <circle
          cx="40"
          cy="40"
          r={r}
          stroke={colorHex}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-base font-semibold text-seal-navy dark:text-white">
          {clamped.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

function BarChart({ data }: { data: HourlyBucket[] }) {
  const max = Math.max(1, ...data.map((b) => b.count));
  return (
    <div className="w-full">
      <div className="flex items-end gap-1 h-40 px-1">
        {data.map((b) => {
          const h = Math.max(2, (b.count / max) * 100);
          return (
            <div key={b.hour} className="relative flex-1 group">
              <div
                className="w-full rounded-t bg-seal-blue hover:bg-seal-blue/80 transition-colors"
                style={{ height: `${h}%` }}
                aria-label={`${formatHourLabel(b.hour)} : ${b.count} requetes`}
              />
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <div className="bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap">
                  {formatHourLabel(b.hour)} : {b.count}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-seal-gray-500 dark:text-slate-500 mt-1 px-1">
        <span>{data[0] ? formatHourLabel(data[0].hour) : ''}</span>
        <span>
          {data.length > 0 && data[data.length - 1]
            ? formatHourLabel(data[data.length - 1]!.hour)
            : ''}
        </span>
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border border-seal-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div
        className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${accent}1a`, color: accent }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xl font-semibold text-seal-navy dark:text-white">{value}</p>
        <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main page
// -----------------------------------------------------------------------------

export default function SystemMonitoringPage() {
  const [resources, setResources] = useState<SystemResources | null>(null);
  const [usage, setUsage] = useState<IntranetUsage | null>(null);
  const [storage, setStorage] = useState<StoragePerUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [resR, useR, stoR] = await Promise.allSettled([
        api.get<SystemResources>('/system-monitoring/resources'),
        api.get<IntranetUsage>('/system-monitoring/intranet-usage'),
        api.get<StoragePerUserRow[]>('/system-monitoring/storage-per-user', {
          params: { limit: 200 },
        }),
      ]);
      if (resR.status === 'fulfilled') setResources(resR.value.data);
      if (useR.status === 'fulfilled') setUsage(useR.value.data);
      if (stoR.status === 'fulfilled') setStorage(stoR.value.data);
      if (
        resR.status === 'rejected' &&
        useR.status === 'rejected' &&
        stoR.status === 'rejected'
      ) {
        setError('Impossible de charger les données de monitoring.');
      } else {
        setError(null);
      }
      setLastUpdate(new Date());
    } catch (e) {
      setError((e as Error).message || 'Erreur inconnue');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30000);
    return () => clearInterval(id);
  }, [load]);

  const maxTotalBytes = useMemo(
    () => (storage[0]?.totalBytes ?? 0),
    [storage],
  );

  const pagedStorage = useMemo(
    () => storage.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [storage, page],
  );
  const totalPages = Math.max(1, Math.ceil(storage.length / PAGE_SIZE));

  if (loading && !resources && !usage) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Monitoring système"
          subtitle="CPU, RAM, disque, utilisation intranet, stockage par utilisateur."
          icon={Activity}
          hub="admin"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <AdminGroupTabs group="audit" />

      <PageHeader
        title="Monitoring système"
        subtitle="Santé de la VM, utilisation de l'intranet et répartition du stockage."
        icon={Activity}
        hub="admin"
        actions={
          <div className="flex items-center gap-2 text-xs text-seal-gray-500 dark:text-slate-400">
            {refreshing && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
            {lastUpdate && (
              <span>
                MAJ : {lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Section 1 — Santé système */}
      <section aria-labelledby="system-health-title">
        <h2
          id="system-health-title"
          className="text-sm font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-400 mb-3"
        >
          Santé système
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* CPU */}
          <Card>
            <CardHeader className="flex-row items-center gap-2 pb-2">
              <div className="h-8 w-8 rounded-lg bg-seal-blue/10 text-seal-blue flex items-center justify-center">
                <Cpu className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">CPU</p>
                <p className="text-sm font-semibold text-seal-navy dark:text-white">
                  {resources ? `${resources.cpu.count} cœurs` : '—'}
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {resources ? (
                <>
                  {(['1m', '5m', '15m'] as const).map((label, i) => {
                    const load = resources.cpu.loadAvg[i] ?? 0;
                    const pct = loadPct(load, resources.cpu.count);
                    return (
                      <div key={label}>
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="text-seal-gray-500 dark:text-slate-400">
                            Load {label}
                          </span>
                          <span className={`font-medium ${gaugeText(pct)}`}>
                            {load.toFixed(2)} ({pct}%)
                          </span>
                        </div>
                        <ProgressBar pct={pct} colorClass={gaugeColor(pct)} />
                      </div>
                    );
                  })}
                  <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 pt-1 line-clamp-1">
                    {resources.cpu.model}
                  </p>
                </>
              ) : (
                <Skeleton className="h-20" />
              )}
            </CardContent>
          </Card>

          {/* RAM */}
          <Card>
            <CardHeader className="flex-row items-center gap-2 pb-2">
              <div className="h-8 w-8 rounded-lg bg-seal-green/10 text-seal-green flex items-center justify-center">
                <MemoryStick className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">Mémoire RAM</p>
                <p className="text-sm font-semibold text-seal-navy dark:text-white">
                  {resources
                    ? `${(resources.memory.totalMb / 1024).toFixed(1)} Go totaux`
                    : '—'}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {resources ? (
                <div className="flex items-center gap-4">
                  <RamDonut pct={resources.memory.usagePct} />
                  <div className="flex-1 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-seal-gray-500 dark:text-slate-400">Utilisée</span>
                      <span className="font-medium">
                        {(resources.memory.usedMb / 1024).toFixed(1)} Go
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-seal-gray-500 dark:text-slate-400">Libre</span>
                      <span className="font-medium">
                        {(resources.memory.freeMb / 1024).toFixed(1)} Go
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <Skeleton className="h-24" />
              )}
            </CardContent>
          </Card>

          {/* Disque */}
          <Card>
            <CardHeader className="flex-row items-center gap-2 pb-2">
              <div className="h-8 w-8 rounded-lg bg-seal-orange/10 text-seal-orange flex items-center justify-center">
                <HardDrive className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">Disque</p>
                <p className="text-sm font-semibold text-seal-navy dark:text-white">
                  {resources ? `${resources.disk.totalGb} Go` : '—'}
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {resources ? (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-seal-gray-500 dark:text-slate-400">
                      Utilisé : {resources.disk.usedGb} Go
                    </span>
                    <span className={`font-semibold ${gaugeText(resources.disk.usagePct)}`}>
                      {resources.disk.usagePct}%
                    </span>
                  </div>
                  <ProgressBar
                    pct={resources.disk.usagePct}
                    colorClass={gaugeColor(resources.disk.usagePct)}
                  />
                  <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">
                    {resources.disk.freeGb} Go libres
                  </p>
                </>
              ) : (
                <Skeleton className="h-20" />
              )}
            </CardContent>
          </Card>

          {/* Uptime */}
          <Card>
            <CardHeader className="flex-row items-center gap-2 pb-2">
              <div className="h-8 w-8 rounded-lg bg-seal-bordeaux/10 text-seal-bordeaux flex items-center justify-center">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">Uptime</p>
                <p className="text-sm font-semibold text-seal-navy dark:text-white">
                  {resources ? formatUptime(resources.uptime.secondsTotal) : '—'}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              {resources ? (
                <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">
                  Démarrage :{' '}
                  {new Date(resources.uptime.bootTime).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              ) : (
                <Skeleton className="h-10" />
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Section 2 — Utilisation intranet */}
      <section aria-labelledby="intranet-usage-title">
        <h2
          id="intranet-usage-title"
          className="text-sm font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-400 mb-3"
        >
          Utilisation intranet (24h)
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <KpiTile
            label="Requêtes API"
            value={usage?.apiRequests24h.toLocaleString('fr-FR') ?? '—'}
            icon={TrendingUp}
            accent="#296DC1"
          />
          <KpiTile
            label="Utilisateurs actifs"
            value={usage?.activeUsers24h.toLocaleString('fr-FR') ?? '—'}
            icon={Users}
            accent="#006233"
          />
          <KpiTile
            label="Documents uploadés"
            value={usage?.documentsUploaded24h.toLocaleString('fr-FR') ?? '—'}
            icon={Database}
            accent="#F9964A"
          />
          <KpiTile
            label="Médias uploadés"
            value={usage?.mediaUploaded24h.toLocaleString('fr-FR') ?? '—'}
            icon={Database}
            accent="#892034"
          />
        </div>
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
              Requêtes API par heure
            </h3>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400">
              Dernières 24 heures — glissant.
            </p>
          </CardHeader>
          <CardContent>
            {usage && usage.hourlyRequests.length > 0 ? (
              <BarChart data={usage.hourlyRequests} />
            ) : (
              <EmptyState
                type="general"
                title="Aucune donnée"
                description="Pas d'activité enregistrée sur les dernières 24 heures."
              />
            )}
          </CardContent>
        </Card>
      </section>

      {/* Section 3 — Stockage par utilisateur */}
      <section aria-labelledby="storage-title">
        <h2
          id="storage-title"
          className="text-sm font-semibold uppercase tracking-wider text-seal-gray-500 dark:text-slate-400 mb-3"
        >
          Stockage par utilisateur
        </h2>
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
                Top {storage.length} utilisateurs
              </h3>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                Documents + médias, trié par taille totale décroissante.
              </p>
            </div>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400">
              Total affiché :{' '}
              <span className="font-semibold text-seal-navy dark:text-white">
                {formatBytes(storage.reduce((s, r) => s + r.totalBytes, 0))}
              </span>
            </p>
          </CardHeader>
          <CardContent className="px-0">
            {storage.length === 0 ? (
              <EmptyState
                type="general"
                title="Aucun stockage"
                description="Aucun fichier uploadé pour le moment."
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-seal-gray-100 dark:border-slate-800 text-left text-[11px] uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
                        <th className="px-4 py-2 font-medium">Utilisateur</th>
                        <th className="px-4 py-2 font-medium">Département</th>
                        <th className="px-4 py-2 font-medium text-right">Documents</th>
                        <th className="px-4 py-2 font-medium text-right">Médias</th>
                        <th className="px-4 py-2 font-medium">Total</th>
                        <th className="px-4 py-2 font-medium w-20" />
                      </tr>
                    </thead>
                    <tbody>
                      {pagedStorage.map((row) => {
                        const pct =
                          maxTotalBytes > 0
                            ? Math.max(2, (row.totalBytes / maxTotalBytes) * 100)
                            : 0;
                        return (
                          <tr
                            key={row.userId}
                            className="border-b border-seal-gray-100 dark:border-slate-800 hover:bg-seal-gray-100/50 dark:hover:bg-slate-800/50 transition-colors"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-full bg-seal-blue/10 text-seal-blue flex items-center justify-center text-xs font-semibold flex-shrink-0">
                                  {initials(row.firstName, row.lastName)}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-seal-navy dark:text-white truncate">
                                    {row.firstName} {row.lastName}
                                  </p>
                                  <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 truncate">
                                    {row.email}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-xs text-seal-gray-500 dark:text-slate-400">
                              {row.department ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-xs tabular-nums">
                              {formatBytes(row.documentsBytes)}
                            </td>
                            <td className="px-4 py-3 text-right text-xs tabular-nums">
                              {formatBytes(row.mediaBytes)}
                            </td>
                            <td className="px-4 py-3 min-w-[180px]">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 rounded-full bg-seal-gray-100 dark:bg-slate-800 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-seal-blue"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-xs font-semibold text-seal-navy dark:text-white tabular-nums whitespace-nowrap">
                                  {formatBytes(row.totalBytes)}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link
                                href={`/admin/users/${row.userId}`}
                                className="text-xs font-medium text-seal-blue hover:underline"
                              >
                                Détail
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-seal-gray-100 dark:border-slate-800 text-xs text-seal-gray-500 dark:text-slate-400">
                    <span>
                      Page {page + 1} / {totalPages}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        className="px-3 py-1 rounded border border-seal-gray-100 dark:border-slate-700 disabled:opacity-40 hover:bg-seal-gray-100/50 dark:hover:bg-slate-800"
                        disabled={page === 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                      >
                        Précédent
                      </button>
                      <button
                        className="px-3 py-1 rounded border border-seal-gray-100 dark:border-slate-700 disabled:opacity-40 hover:bg-seal-gray-100/50 dark:hover:bg-slate-800"
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      >
                        Suivant
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
