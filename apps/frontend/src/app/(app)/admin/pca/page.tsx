'use client';

/**
 * /admin/pca — Module PCA (Plan de Continuité d'Activité) interactif.
 *
 * Permet aux SUPER_ADMIN de :
 *  - Visualiser les KPIs de continuité (dernier drill, taux de succès 30j, etc.)
 *  - Déclencher des scénarios depuis le catalogue (backup-drill, restore
 *    dry-run, simulation panne service, vérification snapshot DB)
 *  - Consulter l'historique paginé des runs passés
 *  - Accéder aux runs planifiés (cron) et à la doc RESTORE.md
 *
 * ISO 27001:2022 — A.5.30 (ICT readiness for business continuity)
 *                  + A.8.13 / A.8.14 (backups / redondance)
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  FileText,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Terminal,
  TimerReset,
  Zap,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { RoleGuard } from '@/components/role-guard';
import { UserRole } from '@omnitech/shared';
import { Badge, Button, Card, CardContent, EmptyState } from '@omnitech/ui';

// ───────────────────────────────────────────────────────────────────────────
// Types alignés sur les DTO backend (apps/backend/src/pca/*)
// ───────────────────────────────────────────────────────────────────────────

type RunStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

interface Scenario {
  id: string;
  name: string;
  description: string;
  iso: string;
  duration: string;
  destructive: boolean;
  script: string | null;
  cron: string | null;
}

interface Kpis {
  lastRunAt: string | null;
  daysSinceLastRun: number | null;
  successRate30d: number | null;
  totalRuns: number;
  nextScheduled: { scenarioId: string; humanSchedule: string } | null;
}

interface ScheduledJob {
  scenarioId: string;
  cronExpression: string;
  humanSchedule: string;
}

interface RunRow {
  id: string;
  scenarioId: string;
  scenarioName: string;
  scenarioIso: string | null;
  status: RunStatus;
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  triggeredBy: string;
  triggeredByUser?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
}

interface RunsResponse {
  data: RunRow[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

const STATUS_CLASSES: Record<RunStatus, string> = {
  PENDING: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  RUNNING: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  SUCCESS: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  FAILED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  CANCELLED: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300',
};

const STATUS_LABELS: Record<RunStatus, string> = {
  PENDING: 'En attente',
  RUNNING: 'En cours',
  SUCCESS: 'Succès',
  FAILED: 'Échec',
  CANCELLED: 'Annulé',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)} s`;
  const min = Math.floor(sec / 60);
  return `${min} min ${Math.round(sec - min * 60)} s`;
}

// ───────────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────────

export default function PcaPage() {
  return (
    <RoleGuard minRole={UserRole.SUPER_ADMIN}>
      <PcaPageInner />
    </RoleGuard>
  );
}

function PcaPageInner() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [schedule, setSchedule] = useState<ScheduledJob[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [meta, setMeta] = useState<RunsResponse['meta']>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [launchingId, setLaunchingId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [scenRes, kpiRes, scheduleRes, runsRes] = await Promise.all([
        api.get<Scenario[]>('/pca/scenarios'),
        api.get<Kpis>('/pca/kpis'),
        api.get<ScheduledJob[]>('/pca/schedule'),
        api.get<RunsResponse>(`/pca/runs?page=${page}&limit=20`),
      ]);
      setScenarios(scenRes.data);
      setKpis(kpiRes.data);
      setSchedule(scheduleRes.data);
      setRuns(runsRes.data.data);
      setMeta(runsRes.data.meta);
    } catch {
      toast.error('Impossible de charger les données PCA');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleLaunch = async (scenario: Scenario) => {
    if (scenario.destructive) {
      const confirmed = window.confirm(
        `${scenario.name}\n\nCe scénario est destructeur.\nContinuer ?`,
      );
      if (!confirmed) return;
    }
    setLaunchingId(scenario.id);
    try {
      const headers: Record<string, string> = {};
      if (scenario.destructive) {
        headers['X-Confirm'] = 'I-understand-this-is-destructive';
      }
      const { data } = await api.post<{ runId: string; status: RunStatus }>(
        '/pca/runs',
        { scenarioId: scenario.id },
        { headers },
      );
      toast.success(`Run démarré : ${scenario.name}`);
      router.push(`/admin/pca/runs/${data.runId}`);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Impossible de démarrer le scénario');
    } finally {
      setLaunchingId(null);
    }
  };

  return (
    <div className="animate-fade-in-up space-y-6 p-6">
      <PageHeader
        title="PCA / Continuité"
        subtitle="Tests de continuité d'activité — ISO 27001 A.5.30"
        icon={ShieldCheck}
        hub="admin"
        actions={
          <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`}
            />
            Rafraîchir
          </Button>
        }
      />

      {/* ─── KPIs ──────────────────────────────────────────────────────── */}
      <section
        aria-label="Indicateurs clés"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KpiCard
          label="Dernier test"
          value={
            kpis?.daysSinceLastRun === null || kpis?.daysSinceLastRun === undefined
              ? '—'
              : kpis.daysSinceLastRun === 0
                ? "Aujourd'hui"
                : `Il y a ${kpis.daysSinceLastRun} j`
          }
          icon={TimerReset}
          hint={kpis?.lastRunAt ? formatDate(kpis.lastRunAt) : undefined}
        />
        <KpiCard
          label="Taux de succès (30j)"
          value={
            kpis?.successRate30d === null || kpis?.successRate30d === undefined
              ? '—'
              : `${kpis.successRate30d}%`
          }
          icon={CheckCircle2}
        />
        <KpiCard
          label="Tests exécutés"
          value={String(kpis?.totalRuns ?? 0)}
          icon={Activity}
        />
        <KpiCard
          label="Prochain test planifié"
          value={kpis?.nextScheduled?.humanSchedule || '—'}
          icon={CalendarClock}
          hint={kpis?.nextScheduled?.scenarioId}
        />
      </section>

      {/* ─── Catalogue ─────────────────────────────────────────────────── */}
      <section aria-label="Catalogue des scénarios">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-seal-navy dark:text-white" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-seal-navy dark:text-white">
            Scénarios disponibles
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {loading && scenarios.length === 0
            ? [1, 2, 3, 4].map((i) => (
                <div key={i} className="shimmer h-48 rounded-xl" />
              ))
            : scenarios.map((s) => (
                <ScenarioCard
                  key={s.id}
                  scenario={s}
                  launching={launchingId === s.id}
                  onLaunch={() => handleLaunch(s)}
                />
              ))}
        </div>
      </section>

      {/* ─── Historique ────────────────────────────────────────────────── */}
      <section aria-label="Historique des runs">
        <div className="mb-3 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-seal-navy dark:text-white" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-seal-navy dark:text-white">
            Historique des runs
          </h2>
        </div>
        <Card>
          <CardContent className="p-0">
            {loading && runs.length === 0 ? (
              <div className="space-y-3 p-6">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="shimmer h-10 rounded-lg bg-gray-100 dark:bg-slate-700"
                  />
                ))}
              </div>
            ) : runs.length === 0 ? (
              <EmptyState
                type="general"
                title="Aucun run enregistré"
                description="Lancez votre premier scénario pour voir son résultat apparaître ici."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wider text-gray-500 dark:border-slate-700 dark:text-slate-400">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Scénario</th>
                      <th className="px-4 py-3">Statut</th>
                      <th className="px-4 py-3">Durée</th>
                      <th className="px-4 py-3">Déclencheur</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r, idx) => (
                      <tr
                        key={r.id}
                        onClick={() => router.push(`/admin/pca/runs/${r.id}`)}
                        className="stagger-item animate-fade-in-up cursor-pointer border-b border-gray-50 transition hover:bg-gray-50 dark:border-slate-700/50 dark:hover:bg-slate-700/30"
                        style={{ animationDelay: `${idx * 40}ms` }}
                      >
                        <td className="px-4 py-3 text-gray-700 dark:text-slate-200">
                          {formatDate(r.startedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-medium text-seal-navy dark:text-white">
                              {r.scenarioName}
                            </span>
                            {r.scenarioIso && (
                              <span className="text-xs text-seal-gray-500 dark:text-slate-500">
                                {r.scenarioIso}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[r.status]}`}
                          >
                            {r.status === 'RUNNING' || r.status === 'PENDING' ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : null}
                            {STATUS_LABELS[r.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-slate-300">
                          {formatDuration(r.duration)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-slate-300">
                          {r.triggeredByUser
                            ? `${r.triggeredByUser.firstName} ${r.triggeredByUser.lastName}`
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/pca/runs/${r.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[#004469] hover:underline dark:text-blue-300"
                          >
                            Détail
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {meta.totalPages > 1 && (
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Précédent
            </Button>
            <span className="text-sm text-seal-gray-500 dark:text-slate-400">
              Page {meta.page} / {meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
            >
              Suivant
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        )}
      </section>

      {/* ─── Cron / doc ────────────────────────────────────────────────── */}
      <section aria-label="Planification et documentation" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-seal-navy dark:text-white">
              <CalendarClock className="h-4 w-4" />
              Runs planifiés (cron)
            </h3>
            {schedule.length === 0 ? (
              <p className="text-sm text-seal-gray-500 dark:text-slate-400">
                Aucun run planifié automatiquement pour le moment.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {schedule.map((s) => (
                  <li
                    key={s.scenarioId}
                    className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-slate-800/50"
                  >
                    <span className="font-medium text-seal-navy dark:text-white">
                      {s.scenarioId}
                    </span>
                    <span className="flex items-center gap-3 text-seal-gray-500 dark:text-slate-400">
                      <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs dark:bg-slate-900">
                        {s.cronExpression}
                      </code>
                      <span>{s.humanSchedule}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-seal-navy dark:text-white">
              <FileText className="h-4 w-4" />
              Documentation de reprise
            </h3>
            <p className="mb-3 text-sm text-seal-gray-500 dark:text-slate-400">
              Le runbook complet de restauration (pas-à-pas, contrôles, preuves
              ISO A.5.30) est disponible dans <code>RESTORE.md</code> à la racine
              du projet.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/backups">
                <Button variant="outline" size="sm">
                  <Database className="mr-2 h-4 w-4" />
                  Gestion des sauvegardes
                </Button>
              </Link>
              <Link href="/wiki">
                <Button variant="outline" size="sm">
                  <Terminal className="mr-2 h-4 w-4" />
                  Wiki / Runbooks
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Composants internes
// ───────────────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
}

function KpiCard({ label, value, icon: Icon, hint }: KpiCardProps) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#004469]/10 text-[#004469]">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
            {label}
          </p>
          <p className="mt-0.5 truncate text-lg font-semibold text-seal-navy dark:text-white">
            {value}
          </p>
          {hint && (
            <p className="truncate text-xs text-seal-gray-500 dark:text-slate-500">
              {hint}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface ScenarioCardProps {
  scenario: Scenario;
  launching: boolean;
  onLaunch: () => void;
}

function ScenarioCard({ scenario, launching, onLaunch }: ScenarioCardProps) {
  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-seal-navy dark:text-white">
            {scenario.name}
          </h3>
          {scenario.destructive && (
            <Badge variant="error" className="text-[10px]">
              Destructeur
            </Badge>
          )}
        </div>
        <p className="flex-1 text-sm text-seal-gray-500 dark:text-slate-400">
          {scenario.description}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="info" className="gap-1">
            <ShieldCheck className="h-3 w-3" />
            {scenario.iso}
          </Badge>
          <Badge variant="info" className="gap-1">
            <TimerReset className="h-3 w-3" />
            {scenario.duration}
          </Badge>
          {scenario.cron && (
            <Badge variant="info" className="gap-1">
              <CalendarClock className="h-3 w-3" />
              Cron
            </Badge>
          )}
        </div>
        <Button
          onClick={onLaunch}
          disabled={launching}
          size="sm"
          className="mt-2 w-full"
        >
          {launching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          Lancer le test
        </Button>
      </CardContent>
    </Card>
  );
}
