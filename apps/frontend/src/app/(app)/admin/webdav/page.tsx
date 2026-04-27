'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  Button,
  Badge,
  Skeleton,
  Input,
} from '@omnitech/ui';
import { HardDrive, Search, RefreshCw, Power, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { useAuthStore } from '@/stores/auth-store';
import { logger } from '@/lib/logger';

interface WebdavStats {
  featureEnabled: boolean;
  eligibleUsers: number;
  activeTokens: number;
  lastActivityAt: string | null;
}

interface WebdavUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  webdavEnabled: boolean;
  isActive: boolean;
  _count: { webdavTokens: number };
}

interface WebdavUsersResponse {
  items: WebdavUser[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const ROLE_BADGE: Record<string, 'success' | 'warning' | 'info' | 'navy'> = {
  SUPER_ADMIN: 'warning',
  ADMIN: 'info',
  DIRECTION: 'info',
  MANAGER: 'navy',
  REVIEWER: 'navy',
  COLLABORATEUR: 'success',
  PRESTATAIRE: 'navy',
};

export default function AdminWebdavPage() {
  const t = useTranslations();
  const currentUser = useAuthStore((s) => s.user);
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  const [stats, setStats] = useState<WebdavStats | null>(null);
  const [users, setUsers] = useState<WebdavUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [togglingGlobal, setTogglingGlobal] = useState(false);
  const [togglingUser, setTogglingUser] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await api.get<WebdavStats>('/admin/webdav/stats');
      setStats(data);
    } catch (e) {
      logger.error('webdav.stats.failed', { error: String(e) });
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<WebdavUsersResponse>('/admin/webdav/users', {
        params: {
          search: search || undefined,
          only: filter,
          page,
          limit: 50,
        },
      });
      setUsers(data.items);
      setTotalPages(data.totalPages);
    } catch (e) {
      logger.error('webdav.users.failed', { error: String(e) });
      toast.error('Impossible de charger la liste des utilisateurs');
    } finally {
      setLoading(false);
    }
  }, [search, filter, page]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const handleToggleGlobal = async () => {
    if (!stats || !isSuperAdmin) return;
    const next = !stats.featureEnabled;
    if (
      !next &&
      !confirm(
        'Désactiver WebDAV au niveau global ? Tous les clients Obsidian connectés perdront immédiatement l\'accès (401). Les tokens restent valides — réactivable instantanément.',
      )
    ) {
      return;
    }
    setTogglingGlobal(true);
    try {
      await api.patch('/admin/webdav/global', { enabled: next });
      toast.success(
        next
          ? 'WebDAV activé globalement'
          : 'WebDAV désactivé globalement (kill switch actif)',
      );
      await fetchStats();
    } catch (e) {
      logger.error('webdav.toggle.global.failed', { error: String(e) });
      toast.error('Impossible de basculer la feature globale');
    } finally {
      setTogglingGlobal(false);
    }
  };

  const handleToggleUser = async (user: WebdavUser) => {
    const next = !user.webdavEnabled;
    setTogglingUser(user.id);
    try {
      await api.patch('/admin/webdav/user', { userId: user.id, enabled: next });
      toast.success(
        next
          ? `WebDAV activé pour ${user.email}`
          : `WebDAV désactivé pour ${user.email}`,
      );
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, webdavEnabled: next } : u)),
      );
      await fetchStats();
    } catch (e) {
      logger.error('webdav.toggle.user.failed', { error: String(e) });
      toast.error('Impossible de modifier la permission');
    } finally {
      setTogglingUser(null);
    }
  };

  const formatLastActivity = (iso: string | null): string => {
    if (!iso) return '—';
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "à l'instant";
    if (min < 60) return `il y a ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `il y a ${h} h`;
    const days = Math.floor(h / 24);
    return `il y a ${days} j`;
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-7xl">
      <PageHeader
        title="WebDAV / Obsidian"
        subtitle="Activation globale et permissions par utilisateur pour la sync Obsidian via le plugin Remotely Save."
        icon={HardDrive}
        hub="admin"
      />

      {/* Feature toggle global */}
      <Card className="seal-card">
        <CardContent className="p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[300px]">
              <h2 className="text-lg font-semibold text-seal-navy dark:text-white flex items-center gap-2">
                <Power className="h-5 w-5" />
                Feature globale
              </h2>
              <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1">
                Kill switch cluster-wide. Désactive immédiatement tous les
                accès WebDAV (mint de tokens + auth Basic des clients connectés).
                Les tokens existants ne sont pas révoqués — réactivable
                instantanément sans regénérer de tokens.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant={
                  stats?.featureEnabled === true
                    ? 'success'
                    : stats?.featureEnabled === false
                      ? 'warning'
                      : 'navy'
                }
              >
                {stats?.featureEnabled === true
                  ? 'Activé'
                  : stats?.featureEnabled === false
                    ? 'Désactivé'
                    : '…'}
              </Badge>
              {isSuperAdmin ? (
                <Button
                  onClick={handleToggleGlobal}
                  disabled={togglingGlobal || !stats}
                  variant={stats?.featureEnabled ? 'destructive' : 'primary'}
                >
                  {togglingGlobal
                    ? '…'
                    : stats?.featureEnabled
                      ? 'Désactiver'
                      : 'Activer'}
                </Button>
              ) : (
                <span className="text-xs text-seal-gray-500 dark:text-slate-400 italic">
                  SUPER_ADMIN requis
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Utilisateurs autorisés"
          value={stats?.eligibleUsers ?? '—'}
          loading={!stats}
        />
        <StatCard
          label="Tokens actifs"
          value={stats?.activeTokens ?? '—'}
          loading={!stats}
        />
        <StatCard
          label="Dernière activité"
          value={formatLastActivity(stats?.lastActivityAt ?? null)}
          loading={!stats}
        />
        <StatCard
          label="État global"
          value={
            stats?.featureEnabled === true
              ? 'OPÉRATIONNEL'
              : stats?.featureEnabled === false
                ? 'DÉSACTIVÉ'
                : '…'
          }
          variant={
            stats?.featureEnabled
              ? 'ok'
              : stats?.featureEnabled === false
                ? 'warn'
                : 'idle'
          }
          loading={!stats}
        />
      </div>

      {/* Avertissement si feature OFF */}
      {stats?.featureEnabled === false && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-900 dark:text-amber-100">
              Feature globalement désactivée
            </p>
            <p className="text-amber-800 dark:text-amber-200 mt-1">
              Aucun client Obsidian ne peut se connecter (401 Unauthorized) ni
              générer de nouveau token, même si les utilisateurs ont la permission
              individuelle. Réactive la feature globale ci-dessus pour permettre
              les sync.
            </p>
          </div>
        </div>
      )}

      {/* Liste users */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-lg font-semibold text-seal-navy dark:text-white">
              Permissions par utilisateur
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void fetchStats();
                void fetchUsers();
              }}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Rafraîchir
            </Button>
          </div>

          {/* Filtres */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-seal-gray-500" />
              <Input
                value={search}
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
                placeholder="Rechercher par email, prénom, nom…"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-1">
              {(['all', 'enabled', 'disabled'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    setPage(1);
                    setFilter(f);
                  }}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    filter === f
                      ? 'bg-seal-blue text-white'
                      : 'bg-gray-100 dark:bg-slate-800 text-seal-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {f === 'all' ? 'Tous' : f === 'enabled' ? 'Activés' : 'Désactivés'}
                </button>
              ))}
            </div>
          </div>

          {/* Liste */}
          <div className="rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-slate-800 text-left">
                <tr>
                  <th className="px-4 py-2 font-semibold text-seal-navy dark:text-white">
                    Utilisateur
                  </th>
                  <th className="px-4 py-2 font-semibold text-seal-navy dark:text-white">
                    Rôle
                  </th>
                  <th className="px-4 py-2 font-semibold text-seal-navy dark:text-white text-center">
                    Tokens
                  </th>
                  <th className="px-4 py-2 font-semibold text-seal-navy dark:text-white text-right">
                    WebDAV
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-slate-800">
                      <td className="px-4 py-3" colSpan={4}>
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-seal-gray-500 dark:text-slate-400"
                      colSpan={4}
                    >
                      Aucun utilisateur correspondant.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr
                      key={u.id}
                      className="border-t border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-seal-navy dark:text-white">
                          {u.firstName || u.lastName
                            ? `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim()
                            : u.email.split('@')[0]}
                        </div>
                        <div className="text-xs text-seal-gray-500 dark:text-slate-400">
                          {u.email}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge variant={ROLE_BADGE[u.role] ?? 'navy'}>
                          {u.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-center text-seal-gray-700 dark:text-slate-300">
                        {u._count?.webdavTokens ?? 0}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => void handleToggleUser(u)}
                          disabled={togglingUser === u.id || !u.isActive}
                          aria-label={`${u.webdavEnabled ? 'Désactiver' : 'Activer'} WebDAV pour ${u.email}`}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                            u.webdavEnabled
                              ? 'bg-seal-blue'
                              : 'bg-gray-300 dark:bg-slate-600'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              u.webdavEnabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination simple */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Précédent
              </Button>
              <span className="text-sm text-seal-gray-500 dark:text-slate-400">
                Page {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Suivant
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lien doc */}
      <div className="text-xs text-seal-gray-500 dark:text-slate-400">
        Référence : <code className="font-mono">docs/integrations/OBSIDIAN_SETUP.md</code>{' '}
        (guide end-user) · <code className="font-mono">docs/integrations/OBSIDIAN_SYNC.md</code>{' '}
        (spec technique).
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
  variant,
}: {
  label: string;
  value: React.ReactNode;
  loading?: boolean;
  variant?: 'ok' | 'warn' | 'idle';
}): React.ReactElement {
  const tone =
    variant === 'ok'
      ? 'text-green-700 dark:text-green-400'
      : variant === 'warn'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-seal-navy dark:text-white';
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-seal-gray-500 dark:text-slate-400 uppercase tracking-wider">
          {label}
        </div>
        {loading ? (
          <Skeleton className="h-7 w-20 mt-2" />
        ) : (
          <div className={`text-2xl font-semibold mt-1 ${tone}`}>{value}</div>
        )}
      </CardContent>
    </Card>
  );
}
