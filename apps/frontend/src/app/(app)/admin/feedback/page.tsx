'use client';

import React, { useCallback, useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Card, CardContent, Button, Badge, EmptyState, Textarea, Skeleton,
} from '@omnitech/ui';
import {
  MessageCircle, Star, Check, X, Clock, Trash2,
  User as UserIcon, BarChart3, Plus, ArrowRight, CheckCircle2, XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';
import { formatRelativeTime, formatDate } from '@/lib/utils';

type Tab = 'testimonials' | 'surveys';

// ------ Testimonials ------
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
  submittedBy: { id: string; firstName: string; lastName: string; email: string } | null;
  approvedBy: { id: string; firstName: string; lastName: string } | null;
}
type TestimonialFilter = 'pending' | 'approved' | 'rejected' | 'all';

// ------ Surveys ------
interface Survey {
  id: string;
  title: string;
  description: string | null;
  isAnonymous: boolean;
  isActive: boolean;
  expiresAt: string | null;
  createdAt: string;
  _count?: { responses: number; questions: number };
}

interface SurveyStats {
  totalSurveys: number;
  totalResponses: number;
  averageRating: number | null;
  responseRate: number | null;
}

const TESTIMONIAL_TABS: Array<{ id: TestimonialFilter; label: string }> = [
  { id: 'pending', label: 'En attente' },
  { id: 'approved', label: 'Approuvés' },
  { id: 'rejected', label: 'Rejetés' },
  { id: 'all', label: 'Tous' },
];

function FeedbackPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams?.get('tab') as Tab) || 'testimonials';
  const [tab, setTab] = useState<Tab>(initialTab);

  // Sync URL query when tab changes
  const changeTab = useCallback((t: Tab) => {
    setTab(t);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('tab', t);
    router.replace(`/admin/feedback?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Avis & enquêtes de satisfaction"
        subtitle="Modérez les témoignages des collaborateurs et pilotez les enquêtes de satisfaction (résultats + création de nouvelles enquêtes)."
        icon={MessageCircle}
        hub="admin"
      />

      {/* Top tabs */}
      <div className="flex items-center gap-0.5 border-b-2 border-gray-200 dark:border-slate-700 mb-4">
        <button
          onClick={() => changeTab('testimonials')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm transition-all -mb-[2px] rounded-t-lg ${
            tab === 'testimonials'
              ? 'border-b-2 border-primary text-primary font-medium bg-primary/5'
              : 'text-seal-gray-500 hover:text-seal-navy dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800'
          }`}
        >
          <MessageCircle className="h-4 w-4" /> Témoignages collaborateurs
        </button>
        <button
          onClick={() => changeTab('surveys')}
          className={`flex items-center gap-2 px-5 py-2.5 text-sm transition-all -mb-[2px] rounded-t-lg ${
            tab === 'surveys'
              ? 'border-b-2 border-primary text-primary font-medium bg-primary/5'
              : 'text-seal-gray-500 hover:text-seal-navy dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-800'
          }`}
        >
          <Star className="h-4 w-4" /> Enquêtes satisfaction
        </button>
      </div>

      {tab === 'testimonials' ? <TestimonialsPanel /> : <SurveysPanel />}
    </div>
  );
}

// ============================================================================
// Testimonials panel — logique identique à l'ancienne /admin/testimonials
// ============================================================================
function TestimonialsPanel() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TestimonialFilter>('pending');
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
    if (filter === 'pending') return !t.isApproved && !t.rejectedAt;
    if (filter === 'approved') return t.isApproved;
    if (filter === 'rejected') return !!t.rejectedAt;
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
      toast.success('Témoignage approuvé');
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
      await api.patch(`/testimonials/${t.id}/reject`, { reason: rejectReason.trim() || undefined });
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
      toast.success('Supprimé');
      load();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      toast.error(msg || 'Erreur');
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {TESTIMONIAL_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filter === t.id
                ? 'bg-seal-orange text-white'
                : 'bg-white dark:bg-slate-800 text-seal-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-200 dark:border-slate-700'
            }`}
          >
            {t.label}
            <span className={`ml-2 text-[10px] ${filter === t.id ? 'text-white/80' : 'text-seal-gray-500'}`}>
              {counts[t.id]}
            </span>
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Aucun témoignage"
              description={
                filter === 'pending' ? 'Aucun témoignage en attente de modération.'
                : filter === 'approved' ? 'Aucun témoignage approuvé pour l\'instant.'
                : filter === 'rejected' ? 'Aucun témoignage rejeté.'
                : 'Aucun témoignage soumis pour l\'instant.'
              }
            />
          ) : (
            filtered.map((t) => (
              <div key={t.id} className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                <blockquote className="text-sm italic text-seal-navy dark:text-white leading-relaxed">
                  «&nbsp;{t.quote}&nbsp;»
                </blockquote>
                <div className="mt-2 flex items-center gap-2 flex-wrap text-xs text-seal-gray-500 dark:text-slate-400">
                  {t.department && <span className="font-semibold">— {t.department}</span>}
                  {t.role && <Badge variant="info" className="text-[9px]">{t.role}</Badge>}
                  {t.isApproved && <Badge variant="success" className="text-[9px]">Approuvé</Badge>}
                  {t.rejectedAt && <Badge variant="error" className="text-[9px]">Rejeté</Badge>}
                  {!t.isApproved && !t.rejectedAt && <Badge variant="warning" className="text-[9px]">En attente</Badge>}
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
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatRelativeTime(t.submittedAt)}</span>
                </div>
                {t.rejectionReason && (
                  <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-[11px] text-red-700 dark:text-red-300">
                    Motif : {t.rejectionReason}
                  </div>
                )}
                {rejectingId === t.id ? (
                  <div className="mt-3 space-y-2">
                    <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2} placeholder="Motif (optionnel)" />
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => { setRejectingId(null); setRejectReason(''); }}>Annuler</Button>
                      <Button variant="danger" size="sm" onClick={() => handleReject(t)}>Confirmer rejet</Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {!t.isApproved && <Button size="sm" variant="primary" onClick={() => handleApprove(t)} className="gap-1"><Check className="h-3.5 w-3.5" />Approuver</Button>}
                    {!t.rejectedAt && <Button size="sm" variant="outline" onClick={() => setRejectingId(t.id)} className="gap-1 text-red-600 border-red-200 hover:bg-red-50"><X className="h-3.5 w-3.5" />Rejeter</Button>}
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(t)} className="gap-1 text-red-500 ml-auto"><Trash2 className="h-3.5 w-3.5" />Supprimer</Button>
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

// ============================================================================
// Surveys panel — liste enquêtes + stats + lien vers création
// ============================================================================
function SurveysPanel() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [stats, setStats] = useState<SurveyStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [surveysRes, statsRes] = await Promise.all([
        api.get<Survey[]>('/satisfaction/surveys'),
        api.get<SurveyStats>('/satisfaction/stats').catch(() => ({ data: null as SurveyStats | null })),
      ]);
      setSurveys(Array.isArray(surveysRes.data) ? surveysRes.data : []);
      setStats(statsRes.data);
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      toast.error(msg || 'Erreur de chargement des enquêtes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (s: Survey) => {
    if (!confirm(`Supprimer l'enquête "${s.title}" ? Les réponses seront également perdues.`)) return;
    try {
      await api.delete(`/satisfaction/surveys/${s.id}`);
      toast.success('Enquête supprimée');
      load();
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : null;
      toast.error(msg || 'Erreur');
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-[10px] uppercase font-semibold text-seal-gray-500">Enquêtes</p>
            <p className="text-2xl font-bold text-seal-navy dark:text-white mt-1">{stats.totalSurveys ?? 0}</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-[10px] uppercase font-semibold text-seal-gray-500">Réponses totales</p>
            <p className="text-2xl font-bold text-seal-navy dark:text-white mt-1">{stats.totalResponses ?? 0}</p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-[10px] uppercase font-semibold text-seal-gray-500">Note moyenne</p>
            <p className="text-2xl font-bold text-seal-navy dark:text-white mt-1">
              {stats.averageRating != null ? `${stats.averageRating.toFixed(1)} / 5` : '—'}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <p className="text-[10px] uppercase font-semibold text-seal-gray-500">Taux de réponse</p>
            <p className="text-2xl font-bold text-seal-navy dark:text-white mt-1">
              {stats.responseRate != null ? `${Math.round(stats.responseRate * 100)}%` : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-seal-navy dark:text-white">
          Enquêtes ({surveys.length})
        </h2>
        <Link href="/admin/feedback/new-survey">
          <Button size="sm">
            <Plus className="h-3.5 w-3.5 mr-1" /> Nouvelle enquête
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-4 space-y-2">
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : surveys.length === 0 ? (
            <EmptyState
              title="Aucune enquête"
              description="Créez votre première enquête de satisfaction pour recueillir les retours des collaborateurs."
              action={
                <Link href="/admin/feedback/new-survey">
                  <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" /> Créer une enquête</Button>
                </Link>
              }
            />
          ) : (
            surveys.map((s) => (
              <div key={s.id} className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-seal-navy dark:text-white truncate">{s.title}</h3>
                      {s.isActive ? (
                        <Badge variant="success" className="text-[9px] gap-1"><CheckCircle2 className="h-3 w-3" />Active</Badge>
                      ) : (
                        <Badge variant="info" className="text-[9px] gap-1"><XCircle className="h-3 w-3" />Fermée</Badge>
                      )}
                      {s.isAnonymous && <Badge variant="info" className="text-[9px]">Anonyme</Badge>}
                    </div>
                    {s.description && (
                      <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1 line-clamp-2">{s.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-seal-gray-500 dark:text-slate-400">
                      <span className="flex items-center gap-1"><BarChart3 className="h-3 w-3" />{s._count?.responses ?? 0} réponses</span>
                      <span>·</span>
                      <span>{s._count?.questions ?? 0} questions</span>
                      <span>·</span>
                      <span>Créée {formatRelativeTime(s.createdAt)}</span>
                      {s.expiresAt && <span>· Expire {formatDate(s.expiresAt)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link href={`/admin/feedback/surveys/${s.id}`}>
                      <Button size="sm" variant="outline" className="gap-1">
                        Résultats <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(s)} className="text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function FeedbackPage() {
  return (
    <Suspense fallback={<Skeleton className="h-32 w-full" />}>
      <FeedbackPageInner />
    </Suspense>
  );
}
