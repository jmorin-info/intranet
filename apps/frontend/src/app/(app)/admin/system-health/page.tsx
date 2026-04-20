'use client';

/**
 * Vue temps réel de l'état de santé des services backend.
 * Ping toutes les 10 secondes.
 */
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AdminGroupTabs } from '@/components/layout/admin-group-tabs';
import { useTranslation } from '@/lib/i18n';
import {
  Activity,
  Database,
  Zap,
  Mail,
  HardDrive,
  Shield,
  FileText,
  Search,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
} from 'lucide-react';

interface Health {
  status: 'ok' | 'degraded' | 'down';
  version?: string;
  uptime?: number;
  counts?: { activeUsers?: number; documents?: number };
  services?: Record<string, ServiceHealthState>;
  timestamp?: string;
  memory?: { rss?: number; heapUsed?: number };
}

/**
 * Unified service health state — must match the backend contract
 * defined in health.controller.ts (ServiceHealthState).
 */
type ServiceHealthState = 'up' | 'down' | 'degraded' | 'not_configured' | 'unknown';

interface ServiceStatus {
  name: string;
  label: string;
  icon: React.ElementType;
  status: ServiceHealthState;
  detail?: string;
}

const SERVICE_MAP: Array<{ key: string; label: string; icon: React.ElementType }> = [
  { key: 'database', label: 'PostgreSQL', icon: Database },
  { key: 'redis', label: 'Redis', icon: Zap },
  { key: 'smtp', label: 'SMTP', icon: Mail },
  { key: 'ldap', label: 'LDAP / AD', icon: Shield },
  { key: 'storage', label: 'Stockage', icon: HardDrive },
  { key: 'clamav', label: 'ClamAV', icon: Shield },
  { key: 'meilisearch', label: 'Meilisearch', icon: Search },
  { key: 'ollama', label: 'RAG AI (Ollama)', icon: Sparkles },
  { key: 'onlyoffice', label: 'OnlyOffice', icon: FileText },
];

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}j ${h}h`;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} Go`;
  return `${mb.toFixed(0)} Mo`;
}

export default function SystemHealthPage() {
  const { t } = useTranslation();
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlyOfficeOk, setOnlyOfficeOk] = useState<boolean | null>(null);
  const [stirlingOk, setStirlingOk] = useState<boolean | null>(null);
  const [ragEnabled, setRagEnabled] = useState<boolean | null>(null);
  const [meilisearchOk, setMeilisearchOk] = useState<boolean | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/health');
      setHealth(data);
    } catch {
      setHealth({ status: 'down' });
    }
    try {
      const { data } = await api.get('/office/status');
      setOnlyOfficeOk(data?.enabled && data?.ok === true);
    } catch {
      setOnlyOfficeOk(null);
    }
    try {
      const { data } = await api.get('/stirling/status');
      setStirlingOk(data?.enabled && data?.ok === true);
    } catch {
      setStirlingOk(null);
    }
    try {
      const { data } = await api.get('/rag/stats');
      setRagEnabled(data?.enabled === true);
    } catch {
      setRagEnabled(null);
    }
    try {
      const { data } = await api.get('/search/v2/health');
      setMeilisearchOk(data?.ok === true);
    } catch {
      setMeilisearchOk(null);
    }
    setLastUpdate(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30000);
    return () => clearInterval(id);
  }, [load]);

  // Map unified health states from backend — all services now come from /health
  const VALID_STATES: ServiceHealthState[] = ['up', 'down', 'degraded', 'not_configured', 'unknown'];
  const services: ServiceStatus[] = SERVICE_MAP.map((s) => {
    const raw = health?.services?.[s.key] as string | undefined;
    const status: ServiceHealthState = raw && VALID_STATES.includes(raw as ServiceHealthState)
      ? (raw as ServiceHealthState)
      : 'unknown';
    return { name: s.key, label: s.label, icon: s.icon, status };
  });

  // Extra services not covered by /health endpoint — checked via dedicated endpoints
  const extraServices: ServiceStatus[] = [
    {
      name: 'stirling',
      label: 'Stirling PDF',
      icon: FileText,
      status: stirlingOk === true ? 'up' : stirlingOk === false ? 'down' : 'unknown',
    },
  ];

  const allServices = [...services, ...extraServices];
  const upCount = allServices.filter((s) => s.status === 'up' || s.status === 'degraded').length;
  // 'not_configured' is intentional, not a failure — only 'down' counts as a problem
  const downCount = allServices.filter((s) => s.status === 'down').length;

  if (loading && !health) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const globalStatus =
    downCount > 0 ? 'down' : health?.status === 'ok' ? 'up' : 'degraded';

  return (
    <div className="space-y-6">
      <AdminGroupTabs group="audit" />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-in-up">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            <h1 className="text-2xl text-seal-navy dark:text-white">Santé système</h1>
            <span
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] uppercase font-bold ${
                globalStatus === 'up'
                  ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                  : globalStatus === 'down'
                    ? 'bg-red-500/20 text-red-700 dark:text-red-300'
                    : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
              }`}
            >
              {globalStatus === 'up' && <CheckCircle2 className="h-3 w-3" />}
              {globalStatus === 'down' && <XCircle className="h-3 w-3" />}
              {globalStatus === 'degraded' && <Clock className="h-3 w-3" />}
              {globalStatus === 'up' ? 'Opérationnel' : globalStatus === 'down' ? 'Panne' : 'Dégradé'}
            </span>
          </div>
          <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
            {upCount}/{allServices.length} services UP · Rafraichi{' '}
            {lastUpdate ? lastUpdate.toLocaleTimeString('fr-FR') : '—'}
            {' · '}Auto-refresh toutes les 30 s
            {health?.uptime ? ` · Uptime : ${formatUptime(health.uptime)}` : ''}
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-xs font-medium text-seal-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800"
        >
          <RefreshCw className="h-3 w-3" />
          Rafraîchir
        </button>
      </div>

      {/* Runtime info */}
      {health?.status === 'ok' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-fade-in-up">
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-[10px] uppercase text-seal-gray-500 dark:text-slate-500 mb-1">Version</p>
            <p className="text-xl font-light text-seal-navy dark:text-white">{health.version || '—'}</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-[10px] uppercase text-seal-gray-500 dark:text-slate-500 mb-1">Uptime</p>
            <p className="text-xl font-light text-seal-navy dark:text-white">
              {health.uptime ? formatUptime(health.uptime) : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-[10px] uppercase text-seal-gray-500 dark:text-slate-500 mb-1">Mémoire RSS</p>
            <p className="text-xl font-light text-seal-navy dark:text-white">
              {health.memory?.rss ? formatBytes(health.memory.rss) : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-[10px] uppercase text-seal-gray-500 dark:text-slate-500 mb-1">Utilisateurs actifs</p>
            <p className="text-xl font-light text-seal-navy dark:text-white">
              {health.counts?.activeUsers ?? '—'}
            </p>
          </div>
        </div>
      )}

      {/* Services grid */}
      <div>
        <p className="text-[10px] uppercase tracking-widest text-seal-gray-500 dark:text-slate-500 mb-2">
          Dépendances backend
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {allServices.map((svc) => {
            const Icon = svc.icon;
            const toneBg = {
              up: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-900/40',
              down: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900/40',
              degraded: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-900/40',
              not_configured: 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700',
              unknown: 'bg-gray-50 dark:bg-slate-800 border-gray-200 dark:border-slate-700',
            }[svc.status];
            const toneDot = {
              up: 'bg-emerald-500',
              down: 'bg-red-500',
              degraded: 'bg-amber-500',
              not_configured: 'bg-gray-400',
              unknown: 'bg-gray-400',
            }[svc.status];

            return (
              <div
                key={svc.name}
                className={`rounded-xl border p-4 ${toneBg} transition stagger-item`}
              >
                <div className="flex items-center justify-between mb-3">
                  <Icon className="h-5 w-5 text-seal-gray-500 dark:text-slate-400" />
                  <span className="relative flex h-2 w-2">
                    {svc.status === 'up' && (
                      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                    )}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${toneDot}`} />
                  </span>
                </div>
                <p className="text-sm font-semibold text-seal-navy dark:text-white">{svc.label}</p>
                <p className="text-[10px] uppercase text-seal-gray-500 dark:text-slate-500 mt-0.5">
                  {svc.status === 'up'
                    ? 'Opérationnel'
                    : svc.status === 'down'
                      ? 'HORS LIGNE'
                      : svc.status === 'degraded'
                        ? 'Dégradé'
                        : svc.status === 'not_configured'
                          ? 'Non configuré'
                          : 'Inconnu'}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[10px] text-seal-gray-500/70 dark:text-slate-600 text-center">
        Accès réservé aux rôles ADMIN et SUPER_ADMIN · Auto-refresh toutes les 30 secondes
      </p>
    </div>
  );
}
