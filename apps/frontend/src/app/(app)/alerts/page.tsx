'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import {
  Card, CardContent, CardHeader, Button, Badge, Dialog, Input, Textarea, Select, EmptyState,
} from '@omnitech/ui';
import { formatDateTime } from '@/lib/utils';
import {
  AlertTriangle, AlertOctagon, Info, Shield, Plus, CheckCircle2, Bell, Clock, EyeOff,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { useTranslation } from '@/lib/i18n';

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const past = new Date(dateStr).getTime();
  const diffMs = now - past;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Il y a ${days}j`;
  return formatDateTime(dateStr);
}

interface Alert {
  id: string;
  title: string;
  content: string;
  severity: string;
  isActive: boolean;
  isRead?: boolean;
  createdAt: string;
  expiresAt: string | null;
  author: { firstName: string; lastName: string };
  _count: { reads: number };
}

function expiresIn(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'Expirée';
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return `Expire dans ${Math.floor(diff / 60000)} min`;
  if (hours < 24) return `Expire dans ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Expire dans ${days}j`;
}

// Sévérités alignées sur la palette d'alarme SEAL System (PANTONE OMNITECH SECURITY)
// P1 = NEW alarme rouge / P2 = NORMAL bordeaux / P3 = ENDED vert atténué
const severityConfig: Record<string, { icon: React.ElementType; color: string; badge: string; label: string; cardStyle: string }> = {
  P1: { icon: AlertOctagon, color: 'text-red-600 dark:text-red-400', badge: 'error', label: 'Critique', cardStyle: 'border-l-4 border-l-[#cc0000] bg-red-50 dark:bg-red-900/20 shadow-sm rounded-xl' },
  P2: { icon: AlertTriangle, color: 'text-seal-bordeaux dark:text-red-300', badge: 'warning', label: 'Important', cardStyle: 'border-l-4 border-l-[#892034] bg-amber-50/80 dark:bg-amber-900/15 shadow-sm rounded-xl' },
  P3: { icon: Info, color: 'text-seal-blue dark:text-blue-400', badge: 'info', label: 'Information', cardStyle: 'border-l-4 border-l-[#296DC1] bg-blue-50/60 dark:bg-blue-900/10 shadow-sm rounded-xl' },
};

export default function AlertsPage() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', severity: 'P3' });
  const [creating, setCreating] = useState(false);
  const [severityFilter, setSeverityFilter] = useState('');
  const [hideExpired, setHideExpired] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');

  const canCreate = user && isRoleAtLeast(user.role, UserRole.ADMIN);
  const isAdmin = user && isRoleAtLeast(user.role, UserRole.ADMIN);

  const [serverStats, setServerStats] = useState<{ p1: number; p2: number; p3: number; read: number; total: number } | null>(null);
  const [readRateStats, setReadRateStats] = useState<{
    readRatePercent: number;
    totalActiveUsers: number;
    totalReaders: number;
    totalActive: number;
    latestCriticalAlert: { id: string; title: string } | null;
    nonReadersOfCritical: Array<{ id: string; firstName: string; lastName: string; email: string }>;
  } | null>(null);

  useEffect(() => {
    if (isAdmin) {
      api.get('/alerts/stats').then(r => {
        // If server stats are available, use them as the authoritative source
        if (r.data) {
          setServerStats(r.data);
          setReadRateStats(r.data);
        }
      }).catch(console.error);
    }
  }, [isAdmin]);

  const clientStats = useMemo(() => {
    const active = alerts.filter(a => a.isActive);
    return {
      p1: active.filter(a => a.severity === 'P1').length,
      p2: active.filter(a => a.severity === 'P2').length,
      p3: active.filter(a => a.severity === 'P3').length,
      read: alerts.filter(a => a.isRead).length,
      total: alerts.length,
    };
  }, [alerts]);

  const alertStats = serverStats || clientStats;

  const filteredAlerts = useMemo(() => {
    let result = alerts;
    if (severityFilter) result = result.filter(a => a.severity === severityFilter);
    if (hideExpired) {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      result = result.filter(a => {
        const createdTime = new Date(a.createdAt).getTime();
        const isExpiredByDate = a.expiresAt && new Date(a.expiresAt).getTime() < Date.now();
        const isOlderThan30Days = createdTime < thirtyDaysAgo;
        return !isExpiredByDate && !isOlderThan30Days;
      });
    }
    return result;
  }, [alerts, severityFilter, hideExpired]);

  useEffect(() => {
    api.get('/alerts').then(({ data }) => setAlerts(Array.isArray(data) ? data : data?.data || [])).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!form.title || !form.content) { toast.error('Titre et contenu requis'); return; }
    setCreating(true);
    try {
      await api.post('/alerts', { ...form, ...(expiresAt ? { expiresAt } : {}) });
      toast.success('Alerte publiée — tous les utilisateurs ont été notifiés');
      setShowCreate(false);
      setForm({ title: '', content: '', severity: 'P3' });
      setExpiresAt('');
      const { data } = await api.get('/alerts');
      setAlerts(Array.isArray(data) ? data : data?.data || []);
    } catch { toast.error('Erreur lors de la publication de l\'alerte'); }
    finally { setCreating(false); }
  };

  const handleRead = async (id: string) => {
    try {
      await api.post(`/alerts/${id}/read`);
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, isRead: true } : a));
      toast.success('Accusé de lecture enregistré');
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post('/alerts/mark-all-read');
      const { data } = await api.get('/alerts');
      setAlerts(Array.isArray(data) ? data : data?.data || []);
      toast.success('Toutes les alertes marquées comme lues');
    } catch { toast.error('Erreur'); }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title={t('nav.alerts')}
        subtitle="Communications de sécurité et maintenance"
        icon={Bell}
        hub="security"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleMarkAllRead}>
              <CheckCircle2 className="h-4 w-4" /> Marquer tout comme lu
            </Button>
            {canCreate && (
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" /> Nouvelle alerte
              </Button>
            )}
          </div>
        }
      />

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-[#cc0000] bg-red-50/50 dark:bg-red-900/10 shadow-sm rounded-xl"><CardContent className="py-3 px-4">
          <p className="text-2xl font-medium text-red-600 dark:text-red-400 tabular-nums">{alertStats.p1}</p>
          <p className="text-[11px] text-taupe dark:text-slate-400">Critiques (P1)</p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-[#892034] bg-amber-50/50 dark:bg-amber-900/10 shadow-sm rounded-xl"><CardContent className="py-3 px-4">
          <p className="text-2xl font-medium text-seal-bordeaux dark:text-red-300 tabular-nums">{alertStats.p2}</p>
          <p className="text-[11px] text-taupe dark:text-slate-400">Majeures (P2)</p>
        </CardContent></Card>
        <Card className="border-l-4 border-l-[#296DC1] bg-blue-50/50 dark:bg-blue-900/10 shadow-sm rounded-xl"><CardContent className="py-3 px-4">
          <p className="text-2xl font-medium text-seal-blue dark:text-blue-400 tabular-nums">{alertStats.p3}</p>
          <p className="text-[11px] text-taupe dark:text-slate-400">Mineures (P3)</p>
        </CardContent></Card>
        <Card className="shadow-sm rounded-xl"><CardContent className="py-3 px-4">
          <p className="text-2xl font-medium text-navy dark:text-white tabular-nums">{alertStats.read}/{alertStats.total}</p>
          <p className="text-[11px] text-taupe dark:text-slate-400">Lues</p>
        </CardContent></Card>
      </div>

      {/* Admin read rate panel */}
      {isAdmin && readRateStats && (
        <Card className="border-l-4 border-l-indigo-500">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-5 w-5 text-indigo-600" />
              <h3 className="font-semibold text-navy dark:text-white text-sm">Accusés de lecture - Vue admin</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-3">
              <div>
                <p className="text-lg font-medium text-navy dark:text-white">{readRateStats.totalActive}</p>
                <p className="text-[10px] text-taupe dark:text-slate-400">Alertes actives</p>
              </div>
              <div>
                <p className="text-lg font-medium text-navy dark:text-white">
                  {readRateStats.readRatePercent}%
                </p>
                <p className="text-[10px] text-taupe dark:text-slate-400">
                  Taux de lecture ({readRateStats.totalReaders}/{readRateStats.totalActiveUsers} utilisateurs)
                </p>
              </div>
              <div>
                <p className="text-lg font-medium text-navy dark:text-white">
                  {readRateStats.nonReadersOfCritical.length}
                </p>
                <p className="text-[10px] text-taupe dark:text-slate-400">
                  N&apos;ont pas lu la dernière P1
                </p>
              </div>
            </div>
            {readRateStats.latestCriticalAlert && readRateStats.nonReadersOfCritical.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-taupe dark:text-slate-400 hover:text-navy dark:hover:text-white transition-colors">
                  Utilisateurs n&apos;ayant pas lu &laquo; {readRateStats.latestCriticalAlert.title} &raquo; ({readRateStats.nonReadersOfCritical.length})
                </summary>
                <div className="mt-2 max-h-40 overflow-y-auto space-y-1 pl-2 border-l-2 border-red-200 dark:border-red-800">
                  {readRateStats.nonReadersOfCritical.map(u => (
                    <div key={u.id} className="flex items-center gap-2 text-[11px] text-gray-700 dark:text-slate-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400 flex-shrink-0" />
                      <span>{u.firstName} {u.lastName}</span>
                      <span className="text-taupe dark:text-slate-500">({u.email})</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
            {readRateStats.latestCriticalAlert && readRateStats.nonReadersOfCritical.length === 0 && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Tous les utilisateurs ont lu la dernière alerte critique
              </p>
            )}
            {!readRateStats.latestCriticalAlert && (
              <p className="text-xs text-taupe dark:text-slate-400">Aucune alerte P1 active</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Severity filter tabs */}
      <div className="flex gap-2 items-center flex-wrap">
        {[
          { value: '', label: 'Toutes' },
          { value: 'P1', label: 'P1 Critiques', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
          { value: 'P2', label: 'P2 Majeures', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
          { value: 'P3', label: 'P3 Mineures', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => setSeverityFilter(tab.value)}
            role="tab"
            aria-selected={severityFilter === tab.value}
            aria-label={`Filtrer par ${tab.label}`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-primary ${
              severityFilter === tab.value
                ? (tab.color || 'bg-navy text-white dark:bg-slate-600')
                : 'bg-gray-100 text-taupe dark:bg-slate-800 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="h-4 w-px bg-gray-300 dark:bg-slate-600 mx-1" />
        <button
          onClick={() => setHideExpired(!hideExpired)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
            hideExpired
              ? 'bg-navy text-white dark:bg-slate-600'
              : 'bg-gray-100 text-taupe dark:bg-slate-800 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
          }`}
        >
          <EyeOff className="h-3 w-3" />
          Masquer les alertes expirées
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />)}</div>
      ) : filteredAlerts.length === 0 ? (
        <EmptyState
          type="general"
          title={severityFilter ? `Aucune alerte ${severityFilter} active` : 'Aucune alerte active'}
          description={
            severityFilter
              ? `Aucune alerte de niveau ${severityFilter} en cours. La surveillance continue en arrière-plan. Retirez le filtre pour consulter les autres niveaux.`
              : "Aucune alerte active — la surveillance continue en arrière-plan. Les communications de sécurité et de maintenance publiées par le RSSI ou l'équipe IT apparaîtront ici en temps réel."
          }
          action={
            severityFilter ? (
              <Button variant="outline" onClick={() => setSeverityFilter('')}>
                Voir toutes les alertes
              </Button>
            ) : canCreate ? (
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" /> Nouvelle alerte
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert, idx) => {
            const cfg = severityConfig[alert.severity] || severityConfig.P3!;
            const Icon = cfg.icon;
            const isUnreadP1 = alert.severity === 'P1' && !alert.isRead;
            const expiry = expiresIn(alert.expiresAt);
            return (
              <Card key={alert.id} className={`stagger-item ${cfg.cardStyle} ${isUnreadP1 ? 'animate-pulse' : ''} ${!alert.isRead ? 'ring-1 ring-inset ring-primary/30' : ''}`} style={{ animationDelay: `${idx * 40}ms` }}>
                <CardContent>
                  <div className="flex items-start gap-4">
                    <div className={`mt-0.5 ${cfg.color} relative`}>
                      <Icon className="h-6 w-6" />
                      {!alert.isRead && (
                        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary border-2 border-white dark:border-slate-900" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={cfg.badge as 'error' | 'warning' | 'info'}>{cfg.label}</Badge>
                        <h3 className="font-semibold text-navy dark:text-white text-sm">{alert.title}</h3>
                        {!alert.isRead && (
                          <span className="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">Non lu</span>
                        )}
                        {alert.isRead && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                        {!alert.isActive && <Badge variant="draft">Inactive</Badge>}
                      </div>
                      <div className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap">{alert.content}</div>
                      <div className="flex items-center gap-4 mt-3 text-[10px] text-taupe dark:text-slate-400">
                        <span>{alert.author.firstName} {alert.author.lastName}</span>
                        <span title={formatDateTime(alert.createdAt)}>{timeAgo(alert.createdAt)}</span>
                        <span>{alert._count.reads} lecture{alert._count.reads !== 1 ? 's' : ''}</span>
                        {expiry && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {expiry}
                          </span>
                        )}
                      </div>
                    </div>
                    {!alert.isRead && (
                      <Button size="sm" variant="outline" onClick={() => handleRead(alert.id)}>
                        <CheckCircle2 className="h-3 w-3" /> Lu
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showCreate} onClose={() => setShowCreate(false)} title="Nouvelle alerte de sécurité">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-navy dark:text-white mb-1.5">Criticité</label>
            <div className="flex gap-2">
              {[
                { value: 'P1', label: 'P1 Critique', dot: 'bg-red-500' },
                { value: 'P2', label: 'P2 Important', dot: 'bg-amber-400' },
                { value: 'P3', label: 'P3 Info', dot: 'bg-blue-400' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, severity: opt.value })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${
                    form.severity === opt.value
                      ? 'border-navy bg-navy/5 dark:border-slate-400 dark:bg-slate-700 font-medium'
                      : 'border-gray-200 dark:border-slate-600 hover:border-gray-300'
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${opt.dot}`} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <Input label="Titre" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Maintenance serveur planifiée" />
          <Textarea label="Contenu" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Détails de l'alerte..." className="min-h-[120px]" />
          <Input label="Expiration (optionnel)" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>Annuler</Button>
            <Button onClick={handleCreate} loading={creating}>Publier l&apos;alerte</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
