'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRefetchOnFocus } from '@/hooks/use-refetch-on-focus';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { DOCUMENT_CATEGORY_LABELS } from '@omnitech/shared';
import {
  Card,
  CardContent,
  CardHeader,
  Button,
  StatusBadge,
  DataTable,
  EmptyState,
  Tabs,
} from '@omnitech/ui';
import type { Column } from '@omnitech/ui';
import { formatRelativeTime } from '@/lib/utils';
import { FileText, Eye, UserCheck, CheckCircle2, AlertTriangle, PartyPopper, XCircle, ClipboardCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { toast } from 'sonner';
import { useTranslation } from '@/lib/i18n';

interface PendingDocument {
  id: string;
  title: string;
  reference: string;
  status: string;
  category: string;
  updatedAt: string;
  owner: { firstName: string; lastName: string };
}

export default function PendingDocumentsPage() {
  const router = useRouter();
  const user = useAuthStore(s => s.user);
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('review');
  const [reviewDocs, setReviewDocs] = useState<PendingDocument[]>([]);
  const [approvalDocs, setApprovalDocs] = useState<PendingDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = useCallback(async () => {
    try {
      const [reviewRes, approvalRes] = await Promise.allSettled([
        api.get('/documents', { params: { status: 'IN_REVIEW', limit: 50 } }),
        api.get('/documents', { params: { status: 'PENDING_APPROVAL', limit: 50 } }),
      ]);
      if (reviewRes.status === 'fulfilled') setReviewDocs(reviewRes.value.data?.data || []);
      if (approvalRes.status === 'fulfilled') setApprovalDocs(approvalRes.value.data?.data || []);
    } catch {
      // graceful
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { fetchPending(); }, [fetchPending]);
  useRefetchOnFocus(fetchPending);

  const tabs = [
    { id: 'review', label: t('pending.inReview'), count: reviewDocs.length },
    { id: 'approval', label: t('pending.pendingApproval'), count: approvalDocs.length },
  ];

  const docs = activeTab === 'review' ? reviewDocs : approvalDocs;

  const getDaysPending = (updatedAt: string) => {
    return Math.floor((Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24));
  };

  const isUrgent = (updatedAt: string) => getDaysPending(updatedAt) > 7;

  const getUrgencyConfig = (updatedAt: string) => {
    const days = getDaysPending(updatedAt);
    if (days > 14) return { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', label: `En attente depuis ${days} jours`, dot: 'bg-red-500' };
    if (days > 7) return { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', label: `En attente depuis ${days} jours`, dot: 'bg-amber-500' };
    return { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', label: days === 0 ? "En attente depuis aujourd'hui" : `En attente depuis ${days} jour${days > 1 ? 's' : ''}`, dot: 'bg-emerald-500' };
  };

  const handleQuickApprove = async (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();
    const doc = docs.find(d => d.id === docId);
    const action = activeTab === 'review' ? 'valider la revue technique' : 'approuver';
    if (!window.confirm(`Êtes-vous sûr de vouloir ${action} le document « ${doc?.title || docId} » ?\n\nConseil : cliquez sur « Voir » pour vérifier le contenu avant approbation.`)) return;
    try {
      if (activeTab === 'review') {
        await api.post(`/documents/${docId}/approve-review`);
        toast.success('Revue technique approuvée');
      } else {
        await api.post(`/documents/${docId}/approve`);
        toast.success(t('pending.approved'));
      }
      // Refetch both tabs (document may have moved between states)
      fetchPending();
    } catch {
      toast.error(t('pending.approveError'));
    }
  };

  const handleQuickReject = async (e: React.MouseEvent, docId: string) => {
    e.stopPropagation();
    const reason = window.prompt('Motif du rejet (optionnel) :');
    if (reason === null) return; // user cancelled
    try {
      if (activeTab === 'review') {
        await api.post(`/documents/${docId}/reject-review`, { comment: reason || 'Rejeté depuis la liste' });
        toast.success('Revue rejetée');
      } else {
        await api.post(`/documents/${docId}/reject`, { comment: reason || 'Rejeté depuis la liste' });
        toast.success('Document rejeté');
      }
      fetchPending();
    } catch {
      toast.error('Erreur lors du rejet');
    }
  };

  const columns: Column<PendingDocument>[] = [
    {
      key: 'reference',
      header: t('pending.reference'),
      className: 'w-36',
      render: (doc) => (
        <div className="flex items-center gap-2">
          {isUrgent(doc.updatedAt) && (
            <span title={t('pending.urgentTooltip')}><AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" /></span>
          )}
          <span className="font-mono text-xs text-seal-navy dark:text-white font-semibold">{doc.reference}</span>
        </div>
      ),
    },
    {
      key: 'title',
      header: t('pending.titleCol'),
      render: (doc) => <span className="text-sm font-semibold text-seal-navy dark:text-white">{doc.title}</span>,
    },
    {
      key: 'category',
      header: t('pending.category'),
      render: (doc) => (
        <span className="text-sm text-seal-gray-500 dark:text-slate-400">
          {DOCUMENT_CATEGORY_LABELS[doc.category as keyof typeof DOCUMENT_CATEGORY_LABELS]}
        </span>
      ),
    },
    {
      key: 'owner',
      header: t('pending.author'),
      render: (doc) => (
        <div>
          <span className="text-sm font-medium text-seal-navy dark:text-white">
            {doc.owner.firstName} {doc.owner.lastName}
          </span>
          <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">
            Soumis {formatRelativeTime(doc.updatedAt)}
          </p>
        </div>
      ),
    },
    {
      key: 'updatedAt',
      header: t('pending.modified'),
      render: (doc) => {
        const urgency = getUrgencyConfig(doc.updatedAt);
        return (
          <div className="flex flex-col gap-1">
            <span className={`text-xs ${isUrgent(doc.updatedAt) ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-seal-gray-500 dark:text-slate-400'}`}>{formatRelativeTime(doc.updatedAt)}</span>
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium w-fit ${urgency.color}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${urgency.dot}`} />
              {urgency.label}
            </span>
          </div>
        );
      },
    },
    {
      key: 'actions' as any,
      header: t('pending.actions'),
      className: 'w-64',
      render: (doc) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" onClick={() => router.push(`/documents/${doc.id}`)} className="bg-primary hover:bg-primary/90 text-white">
            <Eye className="h-3 w-3 mr-1" /> {t('pending.view')}
          </Button>
          <Button size="sm" variant="outline" onClick={(e) => handleQuickApprove(e, doc.id)} className="text-green-600 border-green-200 hover:bg-green-50 dark:border-green-800 dark:hover:bg-green-900/20">
            <CheckCircle2 className="h-3 w-3 mr-1" /> {activeTab === 'review' ? 'Valider' : t('pending.approve')}
          </Button>
          <Button size="sm" variant="outline" onClick={(e) => handleQuickReject(e, doc.id)} className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20">
            <XCircle className="h-3 w-3 mr-1" /> Rejeter
          </Button>
        </div>
      ),
    },
  ];

  const actionRequiredCount = activeTab === 'review' ? reviewDocs.length : approvalDocs.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pending.title')}
        subtitle={t('pending.subtitle')}
        icon={ClipboardCheck}
        hub="work"
      />

      {/* Action required banner */}
      {!loading && actionRequiredCount > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-5 py-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Votre action requise
              {user && (
                <span className="font-normal"> — {user.firstName} {user.lastName}</span>
              )}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              {activeTab === 'review'
                ? `${actionRequiredCount} document${actionRequiredCount > 1 ? 's' : ''} en attente de votre revue technique`
                : `${actionRequiredCount} document${actionRequiredCount > 1 ? 's' : ''} en attente de votre approbation`}
            </p>
          </div>
        </div>
      )}

      {/* Stats bar */}
      {!loading && (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Eye className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-medium text-seal-navy dark:text-white">{reviewDocs.length}</p>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">{t('pending.inReview')}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <UserCheck className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-medium text-seal-navy dark:text-white">{approvalDocs.length}</p>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">{t('pending.inApproval')}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        <CardContent className="p-0">
          {docs.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                <PartyPopper className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-lg font-medium text-seal-navy dark:text-white">{t('pending.allClear')}</p>
              <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1 text-center max-w-sm">
                {activeTab === 'review'
                  ? t('pending.noReview')
                  : t('pending.noApproval')}
              </p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={docs}
              keyExtractor={(doc) => doc.id}
              loading={loading}
              onRowClick={(doc) => router.push(`/documents/${doc.id}`)}
              emptyMessage={
                activeTab === 'review'
                  ? t('pending.emptyReview')
                  : t('pending.emptyApproval')
              }
              emptyIcon={
                activeTab === 'review' ? (
                  <Eye className="h-12 w-12 text-seal-gray-500 dark:text-slate-500" />
                ) : (
                  <UserCheck className="h-12 w-12 text-seal-gray-500 dark:text-slate-500" />
                )
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
