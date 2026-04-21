'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Card, CardContent, CardHeader, Button, Badge, EmptyState, Textarea,
} from '@omnitech/ui';
import { MessageCircle, Check, X, Clock, Trash2, User as UserIcon } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/utils';

interface Testimonial {
  id: string;
  quote: string;
  department: string | null;
  role: string | null;
  isApproved: boolean;
  submittedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  submittedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  approvedBy: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
}

type FilterTab = 'pending' | 'approved' | 'rejected' | 'all';

const TABS: Array<{ id: FilterTab; label: string }> = [
  { id: 'pending', label: 'En attente' },
  { id: 'approved', label: 'Approuvés' },
  { id: 'rejected', label: 'Rejetés' },
  { id: 'all', label: 'Tous' },
];

export default function AdminTestimonialsPage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<FilterTab>('pending');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<Testimonial[]>('/testimonials');
      setTestimonials(data);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      toast.error(msg || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = testimonials.filter((t) => {
    if (tab === 'pending') return !t.isApproved && !t.rejectedAt;
    if (tab === 'approved') return t.isApproved;
    if (tab === 'rejected') return !!t.rejectedAt;
    return true;
  });

  const counts = {
    pending: testimonials.filter((t) => !t.isApproved && !t.rejectedAt).length,
    approved: testimonials.filter((t) => t.isApproved).length,
    rejected: testimonials.filter((t) => !!t.rejectedAt).length,
    all: testimonials.length,
  };

  const handleApprove = async (t: Testimonial) => {
    try {
      await api.patch(`/testimonials/${t.id}/approve`);
      toast.success('Témoignage approuvé — visible sur /welcome');
      load();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      toast.error(msg || 'Erreur');
    }
  };

  const handleReject = async (t: Testimonial) => {
    try {
      await api.patch(`/testimonials/${t.id}/reject`, {
        reason: rejectReason.trim() || undefined,
      });
      toast.success('Témoignage rejeté');
      setRejectingId(null);
      setRejectReason('');
      load();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      toast.error(msg || 'Erreur');
    }
  };

  const handleDelete = async (t: Testimonial) => {
    if (!confirm('Supprimer définitivement ce témoignage ?')) return;
    try {
      await api.delete(`/testimonials/${t.id}`);
      toast.success('Témoignage supprimé');
      load();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      toast.error(msg || 'Erreur');
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Modération des témoignages"
        subtitle="Relisez et approuvez les témoignages soumis par les collaborateurs avant affichage sur le portail public /welcome."
        icon={MessageCircle}
        hub="admin"
      />

      {/* Tabs filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              tab === t.id
                ? 'bg-seal-orange text-white'
                : 'bg-white dark:bg-slate-800 text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700'
            }`}
          >
            {t.label}
            <span className={`ml-2 text-[10px] ${tab === t.id ? 'text-white/80' : 'text-seal-gray-500'}`}>
              {counts[t.id]}
            </span>
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          {loading ? (
            <div className="text-center text-sm text-seal-gray-500 py-8">Chargement…</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Aucun témoignage"
              description={
                tab === 'pending'
                  ? 'Aucun témoignage en attente de modération.'
                  : tab === 'approved'
                  ? 'Aucun témoignage approuvé pour l\'instant.'
                  : tab === 'rejected'
                  ? 'Aucun témoignage rejeté.'
                  : 'Aucun témoignage soumis pour l\'instant.'
              }
            />
          ) : (
            filtered.map((t) => (
              <div
                key={t.id}
                className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4"
              >
                <blockquote className="text-sm italic text-seal-navy dark:text-white leading-relaxed">
                  «&nbsp;{t.quote}&nbsp;»
                </blockquote>
                <div className="mt-2 flex items-center gap-2 text-xs text-seal-gray-500 dark:text-slate-400">
                  {t.department && (
                    <span className="font-semibold">— {t.department}</span>
                  )}
                  {t.role && (
                    <Badge variant="info" className="text-[9px]">{t.role}</Badge>
                  )}
                  {t.isApproved && (
                    <Badge variant="success" className="text-[9px]">Approuvé</Badge>
                  )}
                  {t.rejectedAt && (
                    <Badge variant="error" className="text-[9px]">Rejeté</Badge>
                  )}
                  {!t.isApproved && !t.rejectedAt && (
                    <Badge variant="warning" className="text-[9px]">En attente</Badge>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-3 text-[11px] text-seal-gray-500 dark:text-slate-400">
                  {t.submittedBy ? (
                    <span className="flex items-center gap-1">
                      <UserIcon className="h-3 w-3" />
                      {t.submittedBy.firstName} {t.submittedBy.lastName}
                      <span className="text-[10px] opacity-70">({t.submittedBy.email})</span>
                    </span>
                  ) : (
                    <span className="italic">Auteur supprimé</span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatRelativeTime(t.submittedAt)}
                  </span>
                </div>

                {t.rejectionReason && (
                  <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-[11px] text-red-700 dark:text-red-300">
                    Motif de rejet : {t.rejectionReason}
                  </div>
                )}

                {/* Actions */}
                {rejectingId === t.id ? (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={2}
                      placeholder="Motif de rejet (optionnel) — communiqué à l'auteur"
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason('');
                        }}
                      >
                        Annuler
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleReject(t)}>
                        Confirmer le rejet
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {!t.isApproved && (
                      <Button size="sm" variant="primary" onClick={() => handleApprove(t)} className="gap-1">
                        <Check className="h-3.5 w-3.5" />
                        Approuver
                      </Button>
                    )}
                    {!t.rejectedAt && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejectingId(t.id)}
                        className="gap-1 text-red-600 border-red-200 hover:bg-red-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        Rejeter
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(t)} className="gap-1 text-red-500 ml-auto">
                      <Trash2 className="h-3.5 w-3.5" />
                      Supprimer
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
