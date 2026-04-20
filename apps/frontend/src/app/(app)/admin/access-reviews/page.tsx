'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import { formatDate, formatRelativeTime } from '@/lib/utils';
import { toast } from 'sonner';
import { ExportButton } from '@/components/ui/export-button';
import { PdfExportButton } from '@/components/ui/pdf-export-button';
import { AdminGroupTabs } from '@/components/layout/admin-group-tabs';
import { PageHeader } from '@/components/layout/page-header';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  EmptyState,
  Skeleton,
  Tabs,
} from '@omnitech/ui';
import {
  ShieldCheck,
  CalendarDays,
  Users,
  UserCheck,
  UserX,
  UserCog,
  Clock,
  Plus,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Building2,
  FileText,
  X,
  Loader2,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
type ReviewStatus = 'PENDING' | 'APPROVED' | 'REVOKED' | 'MODIFIED' | 'EXPIRED';
type ReviewDecision = 'KEEP' | 'REVOKE' | 'CHANGE_ROLE' | 'CHANGE_DEPT';

interface CampaignStats {
  total: number;
  completed: number;
  progress: number;
  PENDING: number;
  APPROVED: number;
  REVOKED: number;
  MODIFIED: number;
  EXPIRED: number;
}

interface Campaign {
  id: string;
  name: string;
  description?: string | null;
  startDate: string;
  dueDate: string;
  status: CampaignStatus;
  createdById: string;
  scopeDepartmentId?: string | null;
  scopeRoles: string[];
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  stats?: CampaignStats;
}

interface ReviewUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  department?: { id: string; name: string; code?: string | null } | null;
}

interface Review {
  id: string;
  campaignId: string;
  userId: string;
  reviewerId?: string | null;
  status: ReviewStatus;
  decision?: ReviewDecision | null;
  comments?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: ReviewUser | null;
  reviewer?: ReviewUser | null;
  campaign?: { id: string; name: string; dueDate: string; status: CampaignStatus };
}

interface CampaignDetail extends Campaign {
  reviews: Review[];
}

interface Department {
  id: string;
  name: string;
  code?: string | null;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const CAMPAIGN_STATUS_VARIANT: Record<
  CampaignStatus,
  'info' | 'primary' | 'success' | 'warning' | 'error' | 'navy' | 'draft'
> = {
  DRAFT: 'draft',
  ACTIVE: 'primary',
  COMPLETED: 'success',
  CANCELLED: 'error',
};

const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  DRAFT: 'Brouillon',
  ACTIVE: 'En cours',
  COMPLETED: 'Clôturée',
  CANCELLED: 'Annulée',
};

const REVIEW_STATUS_VARIANT: Record<
  ReviewStatus,
  'info' | 'primary' | 'success' | 'warning' | 'error' | 'navy' | 'archived'
> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REVOKED: 'error',
  MODIFIED: 'primary',
  EXPIRED: 'archived',
};

const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  PENDING: 'En attente',
  APPROVED: 'Maintenu',
  REVOKED: 'Révoqué',
  MODIFIED: 'Modifié',
  EXPIRED: 'Expiré',
};

function fullName(user?: ReviewUser | null): string {
  if (!user) return 'Utilisateur inconnu';
  return `${user.firstName} ${user.lastName}`;
}

// -----------------------------------------------------------------------------
// Page
// -----------------------------------------------------------------------------

export default function AccessReviewsPage() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const [tab, setTab] = useState<'campaigns' | 'my'>('campaigns');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [openCampaign, setOpenCampaign] = useState<CampaignDetail | null>(null);
  const [openCampaignLoading, setOpenCampaignLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);

  const isAdmin = !!user && isRoleAtLeast(user.role, UserRole.ADMIN);

  const loadCampaigns = useCallback(async () => {
    try {
      const { data } = await api.get('/access-reviews/campaigns');
      setCampaigns(data || []);
    } catch {
      toast.error('Impossible de charger les campagnes');
    }
  }, []);

  const loadMyReviews = useCallback(async () => {
    try {
      const { data } = await api.get('/access-reviews/my');
      setMyReviews(data || []);
    } catch {
      toast.error('Impossible de charger vos revues');
    }
  }, []);

  const loadDepartments = useCallback(async () => {
    try {
      const { data } = await api.get('/departments');
      setDepartments(Array.isArray(data) ? data : data?.data || []);
    } catch {
      /* optional */
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadCampaigns(), loadMyReviews()]);
    setLoading(false);
  }, [loadCampaigns, loadMyReviews]);

  useEffect(() => {
    refreshAll();
    loadDepartments();
  }, [refreshAll, loadDepartments]);

  const handleViewCampaign = useCallback(async (id: string) => {
    setOpenCampaignLoading(true);
    try {
      const { data } = await api.get(`/access-reviews/campaigns/${id}`);
      setOpenCampaign(data);
    } catch {
      toast.error('Impossible de charger la campagne');
    } finally {
      setOpenCampaignLoading(false);
    }
  }, []);

  const handleCloseCampaign = useCallback(
    async (id: string) => {
      if (!confirm('Clôturer définitivement cette campagne ? Les revues en attente seront marquées comme expirées.')) {
        return;
      }
      try {
        await api.post(`/access-reviews/campaigns/${id}/close`);
        toast.success('Campagne clôturée');
        await loadCampaigns();
        if (openCampaign?.id === id) {
          await handleViewCampaign(id);
        }
      } catch {
        toast.error('Erreur lors de la clôture');
      }
    },
    [loadCampaigns, openCampaign?.id, handleViewCampaign],
  );

  const handleSubmitDecision = useCallback(
    async (reviewId: string, decision: ReviewDecision, comments?: string) => {
      try {
        await api.post(`/access-reviews/${reviewId}/decision`, { decision, comments });
        toast.success('Décision enregistrée');
        await Promise.all([loadMyReviews(), loadCampaigns()]);
        if (openCampaign) {
          await handleViewCampaign(openCampaign.id);
        }
      } catch (err) {
        const e = err as { response?: { data?: { message?: string } } };
        toast.error(e.response?.data?.message || 'Erreur lors de la soumission');
      }
    },
    [loadMyReviews, loadCampaigns, openCampaign, handleViewCampaign],
  );

  const pendingCount = useMemo(() => myReviews.filter((r) => r.status === 'PENDING').length, [myReviews]);
  const activeCount = useMemo(() => campaigns.filter((c) => c.status === 'ACTIVE').length, [campaigns]);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <AdminGroupTabs group="identity" />
      <PageHeader
        title="Revues d'accès"
        subtitle="Revue trimestrielle des droits (ISO 27001 A.5.18)"
        icon={ShieldCheck}
        hub="admin"
        actions={
          <>
            <ExportButton
            filename="revues-acces"
            rows={(campaigns || []) as unknown as Array<Record<string, unknown>>}
            columns={[
              { header: 'ID', accessor: 'id' },
              { header: 'Titre', accessor: 'title' },
              { header: 'Statut', accessor: 'status' },
              { header: 'Début', accessor: (r: any) => r?.startDate || '' },
              { header: 'Fin', accessor: (r: any) => r?.endDate || '' },
              { header: 'Créée par', accessor: (r: any) => r?.createdBy?.email || '' },
            ]}
          />
          <PdfExportButton
            payload={() => ({
              title: 'Revue périodique des accès',
              subtitle: 'ISO 27001 A.5.18 — Procès-verbal de revue',
              reference: `REVIEW-${new Date().toISOString().slice(0, 10)}`,
              context: 'Extrait du portail OMNITECH Intranet',
              sections: [
                {
                  heading: 'Campagnes',
                  paragraphs:
                    (campaigns || []).length === 0
                      ? ['Aucune campagne enregistrée.']
                      : (campaigns || []).map(
                          (c: any) =>
                            `${c.title || c.id} — statut: ${c.status || 'n/a'} — période: ${c.startDate?.slice(0, 10) || '?'} → ${c.endDate?.slice(0, 10) || '?'}`,
                        ),
                },
                {
                  heading: 'Synthèse',
                  paragraphs: [
                    `Nombre de campagnes: ${(campaigns || []).length}`,
                    `Campagnes actives: ${activeCount}`,
                    'Ce document a été généré automatiquement. Le hash SHA-256 en pied de page garantit son intégrité.',
                  ],
                },
              ],
            })}
          />
            {isAdmin && (
              <Button onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" />
                Nouvelle campagne
              </Button>
            )}
          </>
        }
      />

      {/* Summary bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-taupe dark:text-slate-400">Campagnes actives</p>
              <p className="text-xl text-navy dark:text-white">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-400">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <Clock className="h-5 w-5 text-amber-500" />
            <div>
              <p className="text-xs text-taupe dark:text-slate-400">Revues à traiter</p>
              <p className="text-xl text-navy dark:text-white">{pendingCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-navy">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-navy dark:text-slate-300" />
            <div>
              <p className="text-xs text-taupe dark:text-slate-400">Total campagnes</p>
              <p className="text-xl text-navy dark:text-white">{campaigns.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'campaigns', label: 'Campagnes', count: campaigns.length },
          { id: 'my', label: 'Mes revues', count: pendingCount },
        ]}
        activeTab={tab}
        onChange={(id) => setTab(id as 'campaigns' | 'my')}
      />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : tab === 'campaigns' ? (
        <CampaignsList
          campaigns={campaigns}
          isAdmin={isAdmin}
          onView={handleViewCampaign}
          onClose={handleCloseCampaign}
        />
      ) : (
        <MyReviewsList reviews={myReviews} onDecision={handleSubmitDecision} />
      )}

      {/* Create campaign modal */}
      {showCreate && (
        <CreateCampaignDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          departments={departments}
          onCreated={() => {
            setShowCreate(false);
            refreshAll();
          }}
        />
      )}

      {/* Campaign detail drawer */}
      {(openCampaign || openCampaignLoading) && (
        <CampaignDetailDrawer
          campaign={openCampaign}
          loading={openCampaignLoading}
          isAdmin={isAdmin}
          onClose={() => setOpenCampaign(null)}
          onDecision={handleSubmitDecision}
          onCloseCampaign={handleCloseCampaign}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Campaigns list
// -----------------------------------------------------------------------------

function CampaignsList({
  campaigns,
  isAdmin,
  onView,
  onClose,
}: {
  campaigns: Campaign[];
  isAdmin: boolean;
  onView: (id: string) => void;
  onClose: (id: string) => void;
}) {
  if (campaigns.length === 0) {
    return (
      <EmptyState
        type="general"
        title="Aucune campagne"
        description="Créez une campagne pour lancer une revue périodique des accès."
      />
    );
  }
  return (
    <div className="space-y-3">
      {campaigns.map((c, idx) => {
        const stats = c.stats || {
          total: 0,
          completed: 0,
          progress: 0,
          PENDING: 0,
          APPROVED: 0,
          REVOKED: 0,
          MODIFIED: 0,
          EXPIRED: 0,
        };
        const overdue = c.status === 'ACTIVE' && new Date(c.dueDate).getTime() < Date.now();
        const statusBadgeClass: Record<CampaignStatus, string> = {
          ACTIVE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
          COMPLETED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
          DRAFT: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300',
          CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        };
        const overdueClass = overdue ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : '';
        const effectiveStatusClass = overdue ? overdueClass : statusBadgeClass[c.status];
        return (
          <Card
            key={c.id}
            className={`stagger-item ${overdue ? 'border-l-4 border-l-red-500' : c.status === 'ACTIVE' ? 'border-l-4 border-l-primary' : ''}`}
            style={{ animationDelay: `${idx * 40}ms` }}
          >
            <CardContent className="py-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-navy dark:text-white">{c.name}</h3>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${effectiveStatusClass}`}>
                      {overdue ? 'En retard' : CAMPAIGN_STATUS_LABEL[c.status]}
                    </span>
                    {overdue && (
                      <Badge variant="error">
                        <AlertTriangle className="h-3 w-3" /> Échéance dépassée
                      </Badge>
                    )}
                  </div>
                  {c.description && (
                    <p className="text-sm text-taupe dark:text-slate-400 mt-1 line-clamp-2">
                      {c.description}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-taupe dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      Échéance : {formatDate(c.dueDate)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {stats.total} utilisateurs
                    </span>
                    {c.completedAt && (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        Clôturée {formatRelativeTime(c.completedAt)}
                      </span>
                    )}
                  </div>
                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] text-taupe dark:text-slate-500 mb-1">
                      <span>
                        Avancement : {stats.completed} / {stats.total}
                      </span>
                      <span>{stats.progress}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-500"
                        style={{ width: `${stats.progress}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {stats.APPROVED > 0 && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                          {stats.APPROVED} maintenus
                        </span>
                      )}
                      {stats.REVOKED > 0 && (
                        <span className="text-[10px] text-red-600 dark:text-red-400">
                          {stats.REVOKED} révoqués
                        </span>
                      )}
                      {stats.MODIFIED > 0 && (
                        <span className="text-[10px] text-primary">
                          {stats.MODIFIED} modifiés
                        </span>
                      )}
                      {stats.EXPIRED > 0 && (
                        <span className="text-[10px] text-taupe">
                          {stats.EXPIRED} expirés
                        </span>
                      )}
                      {stats.PENDING > 0 && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">
                          {stats.PENDING} en attente
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Button size="sm" variant="outline" onClick={() => onView(c.id)}>
                    <Eye className="h-3 w-3" />
                    Voir
                  </Button>
                  {isAdmin && c.status === 'ACTIVE' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => onClose(c.id)}
                    >
                      <X className="h-3 w-3" />
                      Clôturer
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------
// My reviews list
// -----------------------------------------------------------------------------

function MyReviewsList({
  reviews,
  onDecision,
}: {
  reviews: Review[];
  onDecision: (id: string, decision: ReviewDecision, comments?: string) => Promise<void>;
}) {
  if (reviews.length === 0) {
    return (
      <EmptyState
        type="general"
        title="Aucune revue en attente"
        description="Vous n'avez pas de revue d'accès à traiter pour le moment."
      />
    );
  }
  return (
    <div className="space-y-3">
      {reviews.map((r, idx) => (
        <div key={r.id} className="stagger-item" style={{ animationDelay: `${idx * 40}ms` }}>
          <ReviewCard review={r} onDecision={onDecision} />
        </div>
      ))}
    </div>
  );
}

function ReviewCard({
  review,
  onDecision,
}: {
  review: Review;
  onDecision: (id: string, decision: ReviewDecision, comments?: string) => Promise<void>;
}) {
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState<ReviewDecision | null>(null);

  const submit = async (decision: ReviewDecision) => {
    setSubmitting(decision);
    try {
      await onDecision(review.id, decision, comments.trim() || undefined);
      setComments('');
    } finally {
      setSubmitting(null);
    }
  };

  const u = review.user;
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-navy dark:text-white">{fullName(u)}</span>
              {u && <Badge variant="navy">{u.role}</Badge>}
              {u?.department && (
                <Badge variant="info">
                  <Building2 className="h-3 w-3" />
                  {u.department.name}
                </Badge>
              )}
              {review.campaign && (
                <Badge variant="primary">
                  <FileText className="h-3 w-3" />
                  {review.campaign.name}
                </Badge>
              )}
              <Badge variant={REVIEW_STATUS_VARIANT[review.status]}>
                {REVIEW_STATUS_LABEL[review.status]}
              </Badge>
            </div>
            {u && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-taupe dark:text-slate-400">
                <span>{u.email}</span>
                <span>Embauché {formatDate(u.createdAt)}</span>
                <span>
                  Dernière connexion :{' '}
                  {u.lastLoginAt ? formatRelativeTime(u.lastLoginAt) : 'Jamais'}
                </span>
                {review.campaign && (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    Échéance {formatDate(review.campaign.dueDate)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Comment + decision buttons */}
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Commentaire (optionnel)"
            rows={2}
            className="w-full rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white placeholder:text-taupe focus:border-primary focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              loading={submitting === 'KEEP'}
              disabled={!!submitting}
              onClick={() => submit('KEEP')}
            >
              <UserCheck className="h-3 w-3" />
              Maintenir
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={submitting === 'REVOKE'}
              disabled={!!submitting}
              onClick={() => submit('REVOKE')}
            >
              <UserX className="h-3 w-3" />
              Révoquer
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={submitting === 'CHANGE_ROLE'}
              disabled={!!submitting}
              onClick={() => submit('CHANGE_ROLE')}
            >
              <UserCog className="h-3 w-3" />
              Changer de rôle
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={submitting === 'CHANGE_DEPT'}
              disabled={!!submitting}
              onClick={() => submit('CHANGE_DEPT')}
            >
              <Building2 className="h-3 w-3" />
              Changer de service
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Create campaign dialog
// -----------------------------------------------------------------------------

function CreateCampaignDialog({
  open,
  onClose,
  onCreated,
  departments,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  departments: Department[];
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [scopeDepartmentId, setScopeDepartmentId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name.trim() || !dueDate) {
      toast.error('Nom et date d\'échéance requis');
      return;
    }
    // Prevent creating a campaign whose due date is already in the past
    const due = new Date(dueDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (due.getTime() < now.getTime()) {
      toast.error('La date d\'échéance doit être dans le futur');
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        dueDate: new Date(dueDate).toISOString(),
      };
      if (description.trim()) payload.description = description.trim();
      if (scopeDepartmentId) payload.scopeDepartmentId = scopeDepartmentId;
      await api.post('/access-reviews/campaigns', payload);
      toast.success('Campagne créée');
      onCreated();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Nouvelle campagne de revue"
      description="Une revue sera automatiquement générée pour chaque utilisateur actif dans le périmètre choisi."
    >
      <div className="space-y-3">
        <div>
          <label className="text-xs text-taupe dark:text-slate-400">Nom de la campagne</label>
          <input
            className="w-full mt-1 rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white focus:border-primary focus:outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Revue Q2 2026"
            maxLength={200}
          />
        </div>
        <div>
          <label className="text-xs text-taupe dark:text-slate-400">Description (optionnel)</label>
          <textarea
            className="w-full mt-1 rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white focus:border-primary focus:outline-none"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            maxLength={2000}
          />
        </div>
        <div>
          <label className="text-xs text-taupe dark:text-slate-400">Date d&apos;échéance</label>
          <input
            type="date"
            className="w-full mt-1 rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white focus:border-primary focus:outline-none"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-taupe dark:text-slate-400">Périmètre — Département (optionnel)</label>
          <select
            className="w-full mt-1 rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white focus:border-primary focus:outline-none"
            value={scopeDepartmentId}
            onChange={(e) => setScopeDepartmentId(e.target.value)}
          >
            <option value="">Tous les départements</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={submit} loading={submitting}>
            Créer la campagne
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Campaign detail drawer
// -----------------------------------------------------------------------------

function CampaignDetailDrawer({
  campaign,
  loading,
  isAdmin,
  onClose,
  onDecision,
  onCloseCampaign,
}: {
  campaign: CampaignDetail | null;
  loading: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onDecision: (id: string, decision: ReviewDecision, comments?: string) => Promise<void>;
  onCloseCampaign: (id: string) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative ml-auto h-full w-full max-w-3xl bg-white dark:bg-slate-900 shadow-2xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div>
            <h2 className="text-navy dark:text-white">
              {campaign?.name || 'Campagne'}
            </h2>
            {campaign && (
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={CAMPAIGN_STATUS_VARIANT[campaign.status]}>
                  {CAMPAIGN_STATUS_LABEL[campaign.status]}
                </Badge>
                <span className="text-xs text-taupe dark:text-slate-400">
                  Échéance : {formatDate(campaign.dueDate)}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && campaign?.status === 'ACTIVE' && (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-500 hover:text-red-600"
                onClick={() => onCloseCampaign(campaign.id)}
              >
                <X className="h-3 w-3" />
                Clôturer
              </Button>
            )}
            <button
              onClick={onClose}
              className="rounded-full p-1 hover:bg-gray-100 dark:hover:bg-slate-700"
              aria-label="Fermer"
            >
              <X className="h-5 w-5 text-taupe dark:text-slate-400" />
            </button>
          </div>
        </div>

        <div className="p-6">
          {loading || !campaign ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 text-primary animate-spin" />
            </div>
          ) : campaign.reviews.length === 0 ? (
            <EmptyState
              type="general"
              title="Aucune revue"
              description="Cette campagne ne contient pas encore de revue."
            />
          ) : (
            <div className="space-y-4">
              {campaign.description && (
                <p className="text-sm text-taupe dark:text-slate-400">{campaign.description}</p>
              )}
              <ReviewsTable
                reviews={campaign.reviews}
                canDecide={campaign.status === 'ACTIVE'}
                onDecision={onDecision}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewsTable({
  reviews,
  canDecide,
  onDecision,
}: {
  reviews: Review[];
  canDecide: boolean;
  onDecision: (id: string, decision: ReviewDecision, comments?: string) => Promise<void>;
}) {
  return (
    <div className="space-y-2">
      {reviews.map((r) => (
        <InlineReviewRow
          key={r.id}
          review={r}
          canDecide={canDecide && r.status === 'PENDING'}
          onDecision={onDecision}
        />
      ))}
    </div>
  );
}

function InlineReviewRow({
  review,
  canDecide,
  onDecision,
}: {
  review: Review;
  canDecide: boolean;
  onDecision: (id: string, decision: ReviewDecision, comments?: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState<ReviewDecision | null>(null);

  const submit = async (decision: ReviewDecision) => {
    setSubmitting(decision);
    try {
      await onDecision(review.id, decision, comments.trim() || undefined);
      setExpanded(false);
      setComments('');
    } finally {
      setSubmitting(null);
    }
  };

  const u = review.user;
  const decisionBorder: Record<ReviewStatus, string> = {
    PENDING: 'border-l-4 border-l-amber-400',
    APPROVED: 'border-l-4 border-l-emerald-500',
    REVOKED: 'border-l-4 border-l-red-500',
    MODIFIED: 'border-l-4 border-l-primary',
    EXPIRED: 'border-l-4 border-l-gray-400',
  };
  return (
    <div className={`rounded-md border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 ${decisionBorder[review.status]}`}>
      <div
        className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50"
        onClick={() => canDecide && setExpanded((v) => !v)}
        role={canDecide ? 'button' : undefined}
        tabIndex={canDecide ? 0 : undefined}
        aria-expanded={canDecide ? expanded : undefined}
        onKeyDown={
          canDecide
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setExpanded((v) => !v);
                }
              }
            : undefined
        }
      >
        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
          <span className="text-sm text-navy dark:text-white truncate">{fullName(u)}</span>
          {u && (
            <span className="text-xs text-taupe dark:text-slate-400 truncate">{u.email}</span>
          )}
          {u?.department && (
            <Badge variant="info">{u.department.name}</Badge>
          )}
          {u && <Badge variant="navy">{u.role}</Badge>}
        </div>
        <Badge variant={REVIEW_STATUS_VARIANT[review.status]}>
          {REVIEW_STATUS_LABEL[review.status]}
        </Badge>
      </div>
      {review.comments && !expanded && (
        <div className="px-3 pb-2 text-xs text-taupe dark:text-slate-400 italic">
          &ldquo;{review.comments}&rdquo;
        </div>
      )}
      {expanded && canDecide && (
        <div className="px-3 py-3 border-t border-gray-100 dark:border-slate-800 space-y-2">
          {u && (
            <div className="text-xs text-taupe dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
              <span>Embauché {formatDate(u.createdAt)}</span>
              <span>
                Dernière connexion :{' '}
                {u.lastLoginAt ? formatRelativeTime(u.lastLoginAt) : 'Jamais'}
              </span>
            </div>
          )}
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Commentaire (optionnel)"
            rows={2}
            className="w-full rounded-md border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white placeholder:text-taupe focus:border-primary focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              loading={submitting === 'KEEP'}
              disabled={!!submitting}
              onClick={() => submit('KEEP')}
            >
              <UserCheck className="h-3 w-3" />
              Maintenir
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={submitting === 'REVOKE'}
              disabled={!!submitting}
              onClick={() => submit('REVOKE')}
            >
              <UserX className="h-3 w-3" />
              Révoquer
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={submitting === 'CHANGE_ROLE'}
              disabled={!!submitting}
              onClick={() => submit('CHANGE_ROLE')}
            >
              <UserCog className="h-3 w-3" />
              Modifier rôle
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={submitting === 'CHANGE_DEPT'}
              disabled={!!submitting}
              onClick={() => submit('CHANGE_DEPT')}
            >
              <Building2 className="h-3 w-3" />
              Modifier service
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
