'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Activity, ArrowRight } from 'lucide-react';
import { useHealthStore } from '@/stores/health-store';

/**
 * Widget compact : santé système (admin).
 * Reads from centralized health store (polled every 30s).
 */
type ServiceKey = 'database' | 'redis' | 'smtp' | 'ldap' | 'storage' | 'clamav' | 'meilisearch' | 'ollama' | 'onlyoffice';
const SERVICES: ServiceKey[] = ['database', 'redis', 'smtp', 'ldap', 'storage', 'clamav', 'meilisearch', 'ollama', 'onlyoffice'];

function isServiceUp(val: any): boolean {
  if (typeof val === 'string') return val === 'up' || val === 'degraded';
  if (val && typeof val === 'object') {
    if (typeof val.status === 'string') return val.status === 'up' || val.status === 'degraded';
  }
  return false;
}

export function SystemHealthCompact() {
  const { status, data, startPolling } = useHealthStore();

  // Start shared polling (30s) — only one instance runs globally
  useEffect(() => {
    const stop = startPolling(30_000);
    return stop;
  }, [startPolling]);

  const services = (data as any)?.services;
  const globalStatus = (data as any)?.status;

  const statusColor =
    globalStatus === 'ok'
      ? 'bg-emerald-500'
      : globalStatus === 'degraded'
        ? 'bg-amber-500'
        : globalStatus === 'down'
          ? 'bg-red-500'
          : 'bg-gray-400';

  const upCount = services
    ? SERVICES.reduce((acc, key) => acc + (isServiceUp(services[key]) ? 1 : 0), 0)
    : 0;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-seal-navy dark:text-white">Santé système</h3>
        </div>
        <Link
          href="/admin/system-health"
          className="text-[11px] text-seal-gray-500 dark:text-slate-400 hover:text-primary flex items-center gap-1"
        >
          Voir détails <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {status === 'error' ? (
        <p className="text-xs text-seal-gray-500 dark:text-slate-500">Statut indisponible</p>
      ) : !data ? (
        <p className="text-xs text-seal-gray-500 dark:text-slate-500">Chargement…</p>
      ) : (
        <div className="flex items-center gap-3">
          <span
            className={`inline-block h-3 w-3 rounded-full ${statusColor} shadow ring-2 ring-white dark:ring-slate-900`}
            aria-label={`Statut : ${globalStatus}`}
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-seal-navy dark:text-white tabular-nums">
              {upCount}/{SERVICES.length} services UP
            </p>
            <p className="text-[10px] uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
              {globalStatus === 'ok' ? 'Opérationnel' : globalStatus === 'degraded' ? 'Dégradé' : 'Incident'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
