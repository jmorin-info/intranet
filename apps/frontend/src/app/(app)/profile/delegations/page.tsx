'use client';

/**
 * Page utilisateur — Gestion des délégations d'approbation (item #27).
 *
 * Permet à chaque utilisateur de :
 *  - Lister ses délégations sortantes (émises) — actives + historique
 *  - Lister les délégations qu'il a REÇUES (collègues l'ayant désigné)
 *  - Créer une nouvelle délégation manuelle (calendar picker + select user)
 *  - Révoquer une délégation active
 *
 * UI : charte SEAL (PANTONE), responsive, formulaire accessible (labels
 * explicites, error states).
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Badge,
  EmptyState,
  Skeleton,
  Dialog,
} from '@omnitech/ui';
import {
  ArrowLeft,
  CalendarRange,
  Plus,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';

interface UserMini {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle?: string | null;
}

interface Delegation {
  id: string;
  fromUserId: string;
  toUserId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  scope: 'GLOBAL' | 'SCOPED';
  categories: string[];
  auto: boolean;
  isActive: boolean;
  revokedAt: string | null;
  createdAt: string;
  toUser?: UserMini;
  fromUser?: UserMini;
}

const DOC_CATEGORIES = [
  'POLICY',
  'PROCEDURE',
  'PLAN',
  'RECORD',
  'FORM',
  'GUIDE',
  'REPORT',
  'CONTRACT',
  'OTHER',
];

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getStatus(d: Delegation): {
  label: string;
  variant: 'success' | 'warning' | 'error' | 'info';
} {
  if (d.revokedAt) return { label: 'Révoquée', variant: 'error' };
  if (!d.isActive) return { label: 'Expirée', variant: 'info' };
  const now = new Date();
  const start = new Date(d.startDate);
  const end = new Date(d.endDate);
  if (now < start) return { label: 'Programmée', variant: 'warning' };
  if (now > end) return { label: 'Expirée', variant: 'info' };
  return { label: 'Active', variant: 'success' };
}

export default function DelegationsPage() {
  const [given, setGiven] = useState<Delegation[]>([]);
  const [received, setReceived] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [users, setUsers] = useState<UserMini[]>([]);
  const [form, setForm] = useState({
    toUserId: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 7 * 24 * 3600_000).toISOString().slice(0, 10),
    reason: '',
    scope: 'GLOBAL' as 'GLOBAL' | 'SCOPED',
    categories: [] as string[],
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, r] = await Promise.all([
        api.get<Delegation[]>('/users/me/delegations'),
        api.get<Delegation[]>('/users/me/delegations/received'),
      ]);
      setGiven(g.data);
      setReceived(r.data);
    } catch (err: unknown) {
      toast.error('Impossible de charger les délégations');
      logger.error(err, { page: 'profile/delegations', context: 'load' });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const { data } = await api.get<{ items: UserMini[] }>('/users/directory');
      setUsers(data.items ?? []);
    } catch {
      // best effort — l'utilisateur peut quand même saisir un id
    }
  }, []);

  useEffect(() => {
    void load();
    void loadUsers();
  }, [load, loadUsers]);

  const handleCreate = async () => {
    if (!form.toUserId) {
      toast.error('Sélectionnez un délégataire');
      return;
    }
    if (!form.startDate || !form.endDate) {
      toast.error('Renseignez les dates de début et de fin');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/users/me/delegations', {
        toUserId: form.toUserId,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason.trim() || undefined,
        scope: form.scope,
        categories: form.scope === 'SCOPED' ? form.categories : [],
      });
      toast.success('Délégation créée');
      setCreateOpen(false);
      setForm({
        toUserId: '',
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date(Date.now() + 7 * 24 * 3600_000).toISOString().slice(0, 10),
        reason: '',
        scope: 'GLOBAL',
        categories: [],
      });
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      toast.error(msg ?? 'Erreur de création');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Révoquer cette délégation ?')) return;
    try {
      await api.delete(`/users/me/delegations/${id}`);
      toast.success('Délégation révoquée');
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      toast.error(msg ?? 'Erreur de révocation');
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      <Link
        href="/profile"
        className="inline-flex items-center text-sm text-seal-blue dark:text-blue-300 hover:underline mb-3"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Retour au profil
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-seal-orange dark:text-orange-300" />
            Mes délégations d'approbation
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Confiez vos approbations à un collègue pendant vos absences (vacances,
            mission, congés). Les délégations sont auditées (ISO 27001 A.5.1).
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setCreateOpen(true)}
          className="gap-1"
        >
          <Plus className="w-4 h-4" />
          Nouvelle délégation
        </Button>
      </div>

      {/* Reçues */}
      <Card className="mb-6">
        <CardHeader>
          <h2 className="font-semibold flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-seal-blue dark:text-blue-300" />
            Délégations que vous représentez
            <span className="text-xs text-gray-500 dark:text-slate-400 font-normal">
              ({received.length} active(s))
            </span>
          </h2>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : received.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Aucune délégation reçue"
              description="Aucun collègue ne vous a désigné comme délégataire actuellement."
            />
          ) : (
            <ul className="space-y-2">
              {received.map((d) => {
                const status = getStatus(d);
                return (
                  <li
                    key={d.id}
                    className="flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 text-sm"
                  >
                    <div className="flex-1">
                      <div className="font-medium">
                        {d.fromUser?.firstName} {d.fromUser?.lastName}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-slate-400">
                        {formatDate(d.startDate)} → {formatDate(d.endDate)}
                        {d.reason && ` · ${d.reason}`}
                        {d.auto && (
                          <Badge variant="warning" className="ml-2 text-xs">
                            Auto
                          </Badge>
                        )}
                      </div>
                    </div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Émises */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold flex items-center gap-2">
            <CalendarRange className="w-4 h-4 text-seal-orange dark:text-orange-300" />
            Délégations que vous émettez
            <span className="text-xs text-gray-500 dark:text-slate-400 font-normal">
              ({given.filter((d) => getStatus(d).variant === 'success').length} active(s) /
              {given.length} au total)
            </span>
          </h2>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : given.length === 0 ? (
            <EmptyState
              icon={UserCheck}
              title="Aucune délégation émise"
              description="Cliquez sur Nouvelle délégation pour confier vos approbations à un collègue."
            />
          ) : (
            <ul className="space-y-2">
              {given.map((d) => {
                const status = getStatus(d);
                const canRevoke = status.variant === 'success' || status.variant === 'warning';
                return (
                  <li
                    key={d.id}
                    className="flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 text-sm"
                  >
                    <div className="flex-1">
                      <div className="font-medium">
                        → {d.toUser?.firstName} {d.toUser?.lastName}{' '}
                        <span className="text-xs text-gray-500 dark:text-slate-400 font-normal">
                          ({d.toUser?.email})
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-slate-400">
                        {formatDate(d.startDate)} → {formatDate(d.endDate)}
                        {d.reason && ` · ${d.reason}`}
                        {d.scope === 'SCOPED' && d.categories.length > 0 && (
                          <span className="ml-2">
                            · Catégories : {d.categories.join(', ')}
                          </span>
                        )}
                        {d.auto && (
                          <Badge variant="warning" className="ml-2 text-xs">
                            Auto
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={status.variant}>{status.label}</Badge>
                      {canRevoke && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevoke(d.id)}
                          aria-label={`Révoquer la délégation vers ${d.toUser?.firstName} ${d.toUser?.lastName}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nouvelle délégation"
      >
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Délégataire <span className="text-red-500">*</span>
            </span>
            <select
              value={form.toUserId}
              onChange={(e) => setForm({ ...form, toUserId: e.target.value })}
              className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
              required
            >
              <option value="">— Sélectionner un collègue —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName} ({u.email})
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Du <span className="text-red-500">*</span>
              </span>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Au <span className="text-red-500">*</span>
              </span>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                required
              />
            </label>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Motif (optionnel)
            </span>
            <input
              type="text"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              maxLength={500}
              placeholder="Ex : Vacances 1 semaine"
              className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
            />
          </label>

          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-2">
              Étendue
            </span>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={form.scope === 'GLOBAL'}
                  onChange={() => setForm({ ...form, scope: 'GLOBAL', categories: [] })}
                />
                <span>
                  <strong>Globale</strong> — toutes mes approbations sont déléguées
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={form.scope === 'SCOPED'}
                  onChange={() => setForm({ ...form, scope: 'SCOPED' })}
                />
                <span>
                  <strong>Limitée</strong> — uniquement certaines catégories de documents
                </span>
              </label>
            </div>

            {form.scope === 'SCOPED' && (
              <div className="mt-2 grid grid-cols-3 gap-1 pl-6">
                {DOC_CATEGORIES.map((cat) => (
                  <label key={cat} className="text-xs flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={form.categories.includes(cat)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          categories: e.target.checked
                            ? [...form.categories, cat]
                            : form.categories.filter((c) => c !== cat),
                        })
                      }
                    />
                    {cat}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={submitting}
            >
              Annuler
            </Button>
            <Button variant="primary" onClick={handleCreate} disabled={submitting}>
              {submitting ? 'Création…' : 'Créer la délégation'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
