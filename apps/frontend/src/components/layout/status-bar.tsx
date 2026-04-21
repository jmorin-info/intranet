'use client';

/**
 * Global Status Bar — macOS-menubar-inspired indicator cluster.
 *
 * Displays vital system state (critical incidents, unread notifications,
 * overall health, LDAP pending approvals, workflows awaiting the current
 * user's decision). Each "statuslet" is a compact icon with an optional
 * badge; clicking opens a single popover with details.
 *
 * Integration: rendered inside <Header /> just before the user avatar.
 * It has no fixed positioning of its own — it lays inline in the header's
 * right-side controls cluster.
 *
 * Polling: 30 s per statuslet. If an endpoint returns 401/403/404 the
 * corresponding statuslet is disabled silently (e.g. a regular collaborator
 * never sees the LDAP pending indicator).
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ShieldAlert,
  Bell,
  Activity,
  UserPlus,
  Workflow,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import { formatRelativeTime } from '@/lib/utils';

const POLL_INTERVAL_MS = 60_000;

type HealthStatus = 'ok' | 'degraded' | 'down' | 'unknown';

interface IncidentLite {
  id: string;
  title: string;
  severity?: string;
  status?: string;
  createdAt?: string;
}

/**
 * Forme renvoyee par GET /approval-workflows/pending/me : en realite une
 * liste d'ApprovalStepInstance (pas un workflow template). La vraie
 * destination de clic est le document concerne (w.instance.documentId),
 * pas /admin/workflows/:id qui attendrait un template existant.
 */
interface WorkflowLite {
  id: string;
  title?: string;
  name?: string;
  createdAt?: string;
  instance?: {
    documentId?: string;
    workflow?: { id: string; name?: string };
  };
}

interface HealthServiceLite {
  name: string;
  status: string;
}

/* --------------------------------------------------------------------- */
/*  Helpers                                                              */
/* --------------------------------------------------------------------- */

/** Silent-fetch a JSON endpoint. Returns null on 401/403/404 or error. */
async function silentGet<T>(url: string, params?: Record<string, any>): Promise<T | null> {
  try {
    const res = await api.get(url, { params });
    return res.data as T;
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 401 || status === 403 || status === 404) {
      // Mark as permanently disabled: caller handles via return value.
      const e: any = new Error('disabled');
      e.disabled = true;
      throw e;
    }
    return null;
  }
}

/** Shallow equality for primitive-ish arrays used in diffing. */
function arraysEqualById<T extends { id: string }>(a: T[], b: T[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i]?.id !== b[i]?.id) return false;
  return true;
}

/* --------------------------------------------------------------------- */
/*  Popover wrapper                                                      */
/* --------------------------------------------------------------------- */

interface StatusBarPopoverProps {
  title: string;
  count?: number;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

function StatusBarPopover({ title, count, footer, children }: StatusBarPopoverProps) {
  return (
    <div
      role="dialog"
      aria-label={title}
      className={
        'statusbar-pop-in absolute right-0 top-full mt-2 w-[320px] max-w-[calc(100vw-1.5rem)] ' +
        'rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl z-50 overflow-hidden'
      }
    >
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-slate-800">
        <h3 className="text-[13px] font-semibold text-seal-navy dark:text-white truncate">{title}</h3>
        {typeof count === 'number' && (
          <span className="text-[11px] font-semibold text-seal-gray-500 dark:text-slate-400 tabular-nums">
            {count}
          </span>
        )}
      </div>
      <div className="max-h-[300px] overflow-y-auto">{children}</div>
      {footer && (
        <div className="px-4 py-2 border-t border-gray-100 dark:border-slate-800 bg-gray-50/60 dark:bg-slate-900/60">
          {footer}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- */
/*  Single statuslet button                                              */
/* --------------------------------------------------------------------- */

interface StatusletProps {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  badgeTone?: 'red' | 'amber' | 'blue';
  dot?: 'green' | 'orange' | 'red' | null;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  pinged?: boolean;
  hideOnMobile?: boolean;
  children: React.ReactNode;
}

function Statuslet({
  id,
  label,
  icon,
  badge,
  badgeTone = 'red',
  dot,
  openId,
  setOpenId,
  pinged,
  hideOnMobile,
  children,
}: StatusletProps) {
  const open = openId === id;
  const hasBadge = typeof badge === 'number' && badge > 0;
  const toneClass =
    badgeTone === 'amber'
      ? 'bg-amber-500 text-white'
      : badgeTone === 'blue'
      ? 'bg-seal-blue text-white'
      : 'bg-red-500 text-white';

  return (
    <div className={`relative ${hideOnMobile ? 'hidden sm:block' : ''}`}>
      <button
        type="button"
        onClick={() => setOpenId(open ? null : id)}
        title={label}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={
          'inline-flex h-9 w-9 items-center justify-center rounded-lg relative ' +
          'text-seal-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 ' +
          'hover:text-seal-blue dark:hover:text-seal-orange transition-colors ' +
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ' +
          'focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ' +
          (open ? 'bg-gray-100 dark:bg-slate-800 text-seal-blue dark:text-seal-orange' : '')
        }
      >
        <span className="relative flex items-center justify-center">
          {icon}
          {dot && (
            <span
              className={
                'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-white dark:ring-slate-950 ' +
                (dot === 'green'
                  ? 'bg-emerald-500'
                  : dot === 'orange'
                  ? 'bg-amber-500'
                  : 'bg-red-500 animate-pulse')
              }
            />
          )}
        </span>
        {hasBadge && (
          <span
            className={
              'absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full ' +
              'text-[9px] font-bold flex items-center justify-center ' +
              toneClass +
              ' ring-2 ring-white dark:ring-slate-950 ' +
              (pinged ? 'statusbar-ping' : '')
            }
          >
            {badge! > 99 ? '99+' : badge}
          </span>
        )}
      </button>
      {open && children}
    </div>
  );
}

/* --------------------------------------------------------------------- */
/*  StatusBar                                                            */
/* --------------------------------------------------------------------- */

export function StatusBar() {
  const user = useAuthStore((s) => s.user);
  const unreadNotifCount = useNotificationStore((s) => s.unreadCount);
  const notificationsInStore = useNotificationStore((s) => s.notifications);
  const router = useRouter();

  const isAdmin = user ? isRoleAtLeast(user.role, UserRole.ADMIN) : false;
  const isReviewer = user ? isRoleAtLeast(user.role, UserRole.REVIEWER) : false;

  const [openId, setOpenId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Permanently-disabled flags (set once we get 401/403/404 for an endpoint)
  const [disabled, setDisabled] = useState({
    incidents: false,
    health: false,
    ldap: !isAdmin,
    workflows: !isReviewer,
  });

  // --- Data state ----------------------------------------------------
  const [incidents, setIncidents] = useState<IncidentLite[]>([]);
  const [health, setHealth] = useState<HealthStatus>('unknown');
  const [healthServices, setHealthServices] = useState<HealthServiceLite[]>([]);
  const [ldapPending, setLdapPending] = useState<number>(0);
  const [workflows, setWorkflows] = useState<WorkflowLite[]>([]);

  // --- Ping animation tracking (badge value increased) ---------------
  const prevCounts = useRef({ incidents: 0, ldap: 0, workflows: 0, notif: 0 });
  const [pings, setPings] = useState({
    incidents: false,
    ldap: false,
    workflows: false,
    notif: false,
  });

  const triggerPing = useCallback((key: keyof typeof pings) => {
    setPings((p) => ({ ...p, [key]: true }));
    setTimeout(() => setPings((p) => ({ ...p, [key]: false })), 1500);
  }, []);

  /* ---------- Fetchers ---------- */

  const fetchIncidents = useCallback(async () => {
    if (disabled.incidents) return;
    try {
      const data = await silentGet<any>('/incidents', {
        severity: 'CRITICAL',
        status: 'OPEN',
        limit: 5,
      });
      if (!data) return;
      const list: IncidentLite[] = Array.isArray(data) ? data : data.items || data.data || [];
      setIncidents((prev) => (arraysEqualById(prev, list) ? prev : list));
      if (list.length > prevCounts.current.incidents) triggerPing('incidents');
      prevCounts.current.incidents = list.length;
    } catch (e: any) {
      if (e?.disabled) setDisabled((d) => ({ ...d, incidents: true }));
    }
  }, [disabled.incidents, triggerPing]);

  const fetchHealth = useCallback(async () => {
    if (disabled.health) return;
    try {
      const data = await silentGet<any>('/health');
      if (!data) return;
      const rawStatus = (data.status || data.state || 'ok').toString().toLowerCase();
      const next: HealthStatus =
        rawStatus === 'ok' || rawStatus === 'up' || rawStatus === 'healthy'
          ? 'ok'
          : rawStatus === 'degraded' || rawStatus === 'warn' || rawStatus === 'warning'
          ? 'degraded'
          : 'down';
      const services: HealthServiceLite[] = Array.isArray(data.services)
        ? data.services
        : data.checks
        ? Object.entries(data.checks).map(([name, v]: [string, any]) => ({
            name,
            status: (v?.status || v?.state || (v === true ? 'ok' : 'down')).toString(),
          }))
        : [];
      setHealth((prev) => (prev === next ? prev : next));
      setHealthServices(services);
    } catch (e: any) {
      if (e?.disabled) setDisabled((d) => ({ ...d, health: true }));
    }
  }, [disabled.health]);

  const fetchLdap = useCallback(async () => {
    if (disabled.ldap) return;
    try {
      const data = await silentGet<any>('/ldap/pending/count');
      if (!data) return;
      const next: number =
        typeof data === 'number'
          ? data
          : typeof data.count === 'number'
          ? data.count
          : typeof data.total === 'number'
          ? data.total
          : 0;
      setLdapPending((prev) => (prev === next ? prev : next));
      if (next > prevCounts.current.ldap) triggerPing('ldap');
      prevCounts.current.ldap = next;
    } catch (e: any) {
      if (e?.disabled) setDisabled((d) => ({ ...d, ldap: true }));
    }
  }, [disabled.ldap, triggerPing]);

  const fetchWorkflows = useCallback(async () => {
    if (disabled.workflows) return;
    try {
      const data = await silentGet<any>('/approval-workflows/pending/me');
      if (!data) return;
      const list: WorkflowLite[] = Array.isArray(data) ? data : data.items || data.data || [];
      setWorkflows((prev) => (arraysEqualById(prev, list) ? prev : list));
      if (list.length > prevCounts.current.workflows) triggerPing('workflows');
      prevCounts.current.workflows = list.length;
    } catch (e: any) {
      if (e?.disabled) setDisabled((d) => ({ ...d, workflows: true }));
    }
  }, [disabled.workflows, triggerPing]);

  /* ---------- Polling ---------- */

  useEffect(() => {
    if (!user) return;
    // initial fetch
    fetchIncidents();
    fetchHealth();
    fetchLdap();
    fetchWorkflows();

    const int = setInterval(() => {
      fetchIncidents();
      fetchHealth();
      fetchLdap();
      fetchWorkflows();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(int);
  }, [user, fetchIncidents, fetchHealth, fetchLdap, fetchWorkflows]);

  /* ---------- Notification ping (store-driven) ---------- */
  useEffect(() => {
    if (unreadNotifCount > prevCounts.current.notif) triggerPing('notif');
    prevCounts.current.notif = unreadNotifCount;
  }, [unreadNotifCount, triggerPing]);

  /* ---------- Close on click-outside / escape ---------- */
  useEffect(() => {
    if (!openId) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openId]);

  /* ---------- Derived notification list for popover ---------- */
  const recentUnread = useMemo(
    () => notificationsInStore.filter((n) => !n.isRead).slice(0, 5),
    [notificationsInStore],
  );

  if (!user) return null;

  /* ---------- Render ---------- */
  return (
    <>
      <div
        ref={rootRef}
        className={
          'flex items-center gap-0.5 pr-1 mr-1 border-r border-gray-200 dark:border-slate-700/70'
        }
        role="toolbar"
        aria-label="Barre d'état système"
      >
        {/* 1 — Critical incidents -------------------------------------- */}
        {!disabled.incidents && (
          <Statuslet
            id="incidents"
            label={`Incidents critiques (${incidents.length})`}
            icon={<ShieldAlert className="h-4 w-4" />}
            badge={incidents.length}
            badgeTone="red"
            openId={openId}
            setOpenId={setOpenId}
            pinged={pings.incidents}
          >
            <StatusBarPopover
              title="Incidents critiques"
              count={incidents.length}
              footer={
                <Link
                  href="/incidents?severity=CRITICAL&status=DETECTED"
                  onClick={() => setOpenId(null)}
                  className="text-[12px] font-semibold text-seal-blue dark:text-seal-orange hover:underline inline-flex items-center gap-1"
                >
                  Voir tous les incidents
                  <ExternalLink className="h-3 w-3" />
                </Link>
              }
            >
              {incidents.length === 0 ? (
                <p className="text-xs text-seal-gray-500 dark:text-slate-400 text-center py-6">
                  Aucun incident critique ouvert.
                </p>
              ) : (
                <ul className="divide-y divide-gray-50 dark:divide-slate-800">
                  {incidents.map((inc) => (
                    <li key={inc.id}>
                      <Link
                        href={`/incidents/${inc.id}`}
                        onClick={() => setOpenId(null)}
                        className="flex items-start gap-2 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-semibold text-seal-navy dark:text-white line-clamp-1">
                            {inc.title}
                          </p>
                          {inc.createdAt && (
                            <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-0.5">
                              {formatRelativeTime(inc.createdAt)}
                            </p>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </StatusBarPopover>
          </Statuslet>
        )}

        {/* 2 — Notifications : retiré du StatusBar (doublon avec le Bell du Header) */}

        {/* 3 — System health ------------------------------------------- */}
        {!disabled.health && (
          <Statuslet
            id="health"
            label={`Santé système : ${
              health === 'ok' ? 'OK' : health === 'degraded' ? 'Dégradé' : health === 'down' ? 'Incident' : 'Inconnu'
            }`}
            icon={<Activity className="h-4 w-4" />}
            dot={
              health === 'ok'
                ? 'green'
                : health === 'degraded'
                ? 'orange'
                : health === 'down'
                ? 'red'
                : null
            }
            openId={openId}
            setOpenId={setOpenId}
            hideOnMobile
          >
            <StatusBarPopover title="Santé système">
              <div className="px-4 py-3">
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className={
                      'h-2.5 w-2.5 rounded-full ' +
                      (health === 'ok'
                        ? 'bg-emerald-500'
                        : health === 'degraded'
                        ? 'bg-amber-500'
                        : health === 'down'
                        ? 'bg-red-500'
                        : 'bg-gray-400')
                    }
                  />
                  <span className="text-[12px] font-semibold text-seal-navy dark:text-white">
                    {health === 'ok'
                      ? 'Tous les services opérationnels'
                      : health === 'degraded'
                      ? 'Fonctionnement dégradé'
                      : health === 'down'
                      ? 'Incident en cours'
                      : 'Statut inconnu'}
                  </span>
                </div>
                {healthServices.length > 0 && (
                  <ul className="space-y-1.5">
                    {healthServices.map((s) => {
                      const ok = ['ok', 'up', 'healthy', 'true'].includes(s.status.toLowerCase());
                      return (
                        <li
                          key={s.name}
                          className="flex items-center justify-between text-[11px]"
                        >
                          <span className="text-seal-gray-500 dark:text-slate-400 truncate">{s.name}</span>
                          <span
                            className={
                              'font-semibold uppercase tracking-wide ' +
                              (ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')
                            }
                          >
                            {ok ? 'OK' : s.status}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </StatusBarPopover>
          </Statuslet>
        )}

        {/* 4 — LDAP pending (ADMIN+) ----------------------------------- */}
        {!disabled.ldap && (
          <Statuslet
            id="ldap"
            label={`Comptes LDAP en attente (${ldapPending})`}
            icon={<UserPlus className="h-4 w-4" />}
            badge={ldapPending}
            badgeTone="blue"
            openId={openId}
            setOpenId={setOpenId}
            pinged={pings.ldap}
            hideOnMobile
          >
            <StatusBarPopover
              title="LDAP — comptes en attente"
              count={ldapPending}
              footer={
                <Link
                  href="/admin/ldap-pending"
                  onClick={() => setOpenId(null)}
                  className="text-[12px] font-semibold text-seal-blue dark:text-seal-orange hover:underline inline-flex items-center gap-1"
                >
                  Gérer les demandes
                  <ExternalLink className="h-3 w-3" />
                </Link>
              }
            >
              <div className="px-4 py-4 text-center">
                {ldapPending === 0 ? (
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                    Aucune demande en attente.
                  </p>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-seal-blue dark:text-seal-orange tabular-nums">
                      {ldapPending}
                    </p>
                    <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 mt-1">
                      demande{ldapPending > 1 ? 's' : ''} à traiter
                    </p>
                  </>
                )}
              </div>
            </StatusBarPopover>
          </Statuslet>
        )}

        {/* 5 — Workflows pending my decision (REVIEWER+) --------------- */}
        {!disabled.workflows && workflows.length > 0 && (
          <Statuslet
            id="workflows"
            label={`Workflows en attente (${workflows.length})`}
            icon={<Workflow className="h-4 w-4" />}
            badge={workflows.length}
            badgeTone="amber"
            openId={openId}
            setOpenId={setOpenId}
            pinged={pings.workflows}
            hideOnMobile
          >
            <StatusBarPopover
              title="Workflows à valider"
              count={workflows.length}
              footer={
                <Link
                  href="/documents/pending"
                  onClick={() => setOpenId(null)}
                  className="text-[12px] font-semibold text-seal-blue dark:text-seal-orange hover:underline inline-flex items-center gap-1"
                >
                  Voir tous
                  <ExternalLink className="h-3 w-3" />
                </Link>
              }
            >
              {workflows.length === 0 ? (
                <p className="text-xs text-seal-gray-500 dark:text-slate-400 text-center py-6">
                  Aucun workflow en attente de votre décision.
                </p>
              ) : (
                <ul className="divide-y divide-gray-50 dark:divide-slate-800">
                  {workflows.map((w) => (
                    <li key={w.id}>
                      <Link
                        href={
                          w.instance?.documentId
                            ? `/documents/${w.instance.documentId}#workflow`
                            : w.instance?.workflow?.id
                              ? `/admin/workflows/${w.instance.workflow.id}`
                              : '/admin/workflows'
                        }
                        onClick={() => setOpenId(null)}
                        className="flex items-start gap-2 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Workflow className="h-3.5 w-3.5 text-seal-blue dark:text-seal-orange flex-shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-semibold text-seal-navy dark:text-white line-clamp-1">
                            {w.title || w.name || 'Workflow'}
                          </p>
                          {w.createdAt && (
                            <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-0.5">
                              {formatRelativeTime(w.createdAt)}
                            </p>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </StatusBarPopover>
          </Statuslet>
        )}
      </div>

      {/* Local animations (scoped via global class names) */}
      <style jsx global>{`
        @keyframes statusbar-pop-in {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .statusbar-pop-in {
          animation: statusbar-pop-in 160ms ease-out;
        }
        @keyframes statusbar-ping {
          0% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6);
          }
          70% {
            box-shadow: 0 0 0 8px rgba(239, 68, 68, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
          }
        }
        .statusbar-ping {
          animation: statusbar-ping 1.2s ease-out 1;
        }
      `}</style>
    </>
  );
}

export default StatusBar;
