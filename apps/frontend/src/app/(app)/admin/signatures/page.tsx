'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, SignatureBadge, Skeleton, Button, Dialog, EmptyState } from '@omnitech/ui';
import { PenLine, FileText, Clock, CheckCircle2, XCircle, Bell, TrendingUp, Plus, Search, X } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import { PageHeader } from '@/components/layout/page-header';

const AdminGroupTabs = dynamic(
  () => import('@/components/layout/admin-group-tabs').then(m => ({ default: m.AdminGroupTabs })),
  { ssr: false, loading: () => <div className="shimmer h-20 rounded-xl" /> },
);

interface SignatureRequest {
  id: string;
  status: string;
  docusealSubmissionId: string | null;
  docusealSlug?: string | null;
  signedAt: string | null;
  createdAt: string;
  signer: { id: string; firstName: string; lastName: string; email: string };
  requestedBy: { id: string; firstName: string; lastName: string; email: string };
  documentVersion: {
    id: string;
    versionNumber?: string;
    document: { id: string; title: string; reference: string };
  };
}

export default function AdminSignaturesPage() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<SignatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'SIGNED' | 'REJECTED'>('ALL');
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [documents, setDocuments] = useState<{ id: string; title: string; reference: string; currentVersionId: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; firstName: string; lastName: string; email: string }[]>([]);
  const [selectedDocVersionId, setSelectedDocVersionId] = useState('');
  const [selectedSigners, setSelectedSigners] = useState<string[]>([]);
  const [signerSearch, setSignerSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load documents and users when dialog opens
  useEffect(() => {
    if (!showRequestDialog) return;
    api.get('/documents?status=APPROVED&limit=200').then(({ data }) => {
      const docs = (data?.data || data || []).map((d: any) => ({
        id: d.id,
        title: d.title,
        reference: d.reference,
        currentVersionId: d.currentVersionId || d.versions?.[0]?.id || d.id,
      }));
      setDocuments(docs);
    }).catch(() => setDocuments([]));
    api.get('/users?limit=500').then(({ data }) => {
      setUsers(Array.isArray(data) ? data : data?.data || []);
    }).catch(() => setUsers([]));
  }, [showRequestDialog]);

  const filteredUsers = users.filter(u => {
    if (!signerSearch) return true;
    const s = signerSearch.toLowerCase();
    return `${u.firstName} ${u.lastName}`.toLowerCase().includes(s) || u.email.toLowerCase().includes(s);
  });

  const handleSubmitRequest = async () => {
    if (!selectedDocVersionId || selectedSigners.length === 0) return;
    setSubmitting(true);
    try {
      for (const signerId of selectedSigners) {
        await api.post('/signatures/request', { documentVersionId: selectedDocVersionId, signerId });
      }
      toast.success(`${selectedSigners.length} demande(s) de signature créée(s)`);
      setShowRequestDialog(false);
      setSelectedDocVersionId('');
      setSelectedSigners([]);
      setSignerSearch('');
      // Refresh list
      const { data } = await api.get('/signatures/all');
      setRequests(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur lors de la creation');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    api.get('/signatures/all')
      .then(({ data }) => setRequests(Array.isArray(data) ? data : []))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = filter === 'ALL'
    ? requests
    : requests.filter((r) => r.status === filter);

  const counts = {
    ALL: requests.length,
    PENDING: requests.filter((r) => r.status === 'PENDING').length,
    SIGNED: requests.filter((r) => r.status === 'SIGNED').length,
    REJECTED: requests.filter((r) => r.status === 'REJECTED').length,
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AdminGroupTabs group="compliance" />
      <PageHeader
        title={t('signatures.title')}
        subtitle={t('signatures.subtitle')}
        icon={PenLine}
        hub="admin"
        actions={
          <Button onClick={() => setShowRequestDialog(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Demander une signature
          </Button>
        }
      />

      {/* Request Signature Dialog */}
      <Dialog
        open={showRequestDialog}
        onClose={() => { setShowRequestDialog(false); setSelectedDocVersionId(''); setSelectedSigners([]); setSignerSearch(''); }}
        title="Demander une signature"
        description="Sélectionnez un document et les signataires"
      >
        <div className="space-y-4">
          {/* Document select */}
          <div>
            <label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">Document</label>
            <select
              value={selectedDocVersionId}
              onChange={(e) => setSelectedDocVersionId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-navy dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">-- Choisir un document approuve --</option>
              {documents.map((d) => (
                <option key={d.id} value={d.currentVersionId}>
                  {d.reference} — {d.title}
                </option>
              ))}
            </select>
          </div>

          {/* Signers multi-select */}
          <div>
            <label className="block text-sm font-semibold text-navy dark:text-white mb-1.5">
              Signataires ({selectedSigners.length} sélectionné{selectedSigners.length > 1 ? 's' : ''})
            </label>
            {/* Selected chips */}
            {selectedSigners.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedSigners.map((id) => {
                  const u = users.find(u => u.id === id);
                  if (!u) return null;
                  return (
                    <span key={id} className="inline-flex items-center gap-1 bg-primary/10 text-primary rounded-full px-2.5 py-1 text-xs font-medium">
                      {u.firstName} {u.lastName}
                      <button onClick={() => setSelectedSigners(prev => prev.filter(s => s !== id))} className="hover:text-red-500">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-seal-gray-500" />
              <input
                type="text"
                value={signerSearch}
                onChange={(e) => setSignerSearch(e.target.value)}
                placeholder="Rechercher un collaborateur..."
                className="w-full rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 pl-9 pr-3 py-2 text-sm text-navy dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            {/* User list */}
            <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-100 dark:border-slate-700 divide-y divide-gray-100 dark:divide-slate-700">
              {filteredUsers.slice(0, 50).map((u) => {
                const isSelected = selectedSigners.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedSigners(prev => isSelected ? prev.filter(s => s !== u.id) : [...prev, u.id])}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${isSelected ? 'bg-primary/5 text-primary' : 'text-navy dark:text-white hover:bg-gray-50 dark:hover:bg-slate-800'}`}
                  >
                    <span>{u.firstName} {u.lastName} <span className="text-xs text-seal-gray-500 dark:text-slate-400">({u.email})</span></span>
                    {isSelected && <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />}
                  </button>
                );
              })}
              {filteredUsers.length === 0 && (
                <p className="text-xs text-seal-gray-500 dark:text-slate-400 text-center py-3">Aucun utilisateur trouve</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => { setShowRequestDialog(false); setSelectedDocVersionId(''); setSelectedSigners([]); setSignerSearch(''); }}>
              Annuler
            </Button>
            <Button
              onClick={handleSubmitRequest}
              disabled={!selectedDocVersionId || selectedSigners.length === 0 || submitting}
              loading={submitting}
            >
              {submitting ? 'Envoi...' : `Envoyer ${selectedSigners.length > 0 ? `(${selectedSigners.length})` : ''}`}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {([
          { key: 'ALL' as const, label: t('signatures.total'), icon: FileText, color: 'text-navy dark:text-white', bg: 'bg-gray-100 dark:bg-slate-800' },
          { key: 'PENDING' as const, label: t('signatures.pending'), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/30' },
          { key: 'SIGNED' as const, label: t('signatures.signed'), icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/30' },
          { key: 'REJECTED' as const, label: t('signatures.rejected'), icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/30' },
        ]).map((stat) => (
          <button
            key={stat.key}
            onClick={() => setFilter(stat.key)}
            className="text-left"
          >
            <Card hoverable className={`h-full ${filter === stat.key ? 'ring-2 ring-primary' : ''}`}>
              <CardContent className="py-4">
                <div className={`h-10 w-10 rounded-xl ${stat.bg} flex items-center justify-center mb-2`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <p className="text-2xl font-medium text-navy dark:text-white">{counts[stat.key]}</p>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">{stat.label}</p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {/* Completion rate stats bar */}
      {requests.length > 0 && (
        <div className="flex items-center gap-4 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-4 py-3">
          <TrendingUp className="h-4 w-4 text-primary flex-shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-navy dark:text-white">
                Taux de completion : {requests.length > 0 ? Math.round((counts.SIGNED / requests.length) * 100) : 0}%
              </span>
              <span className="text-[10px] text-seal-gray-500 dark:text-slate-400">
                {counts.SIGNED} signees / {requests.length} total
                {counts.PENDING > 0 && ` — ${counts.PENDING} en attente`}
                {counts.REJECTED > 0 && ` — ${counts.REJECTED} refusees`}
              </span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full flex">
                {counts.SIGNED > 0 && (
                  <div
                    className="bg-emerald-500 transition-all duration-500"
                    style={{ width: `${(counts.SIGNED / requests.length) * 100}%` }}
                  />
                )}
                {counts.REJECTED > 0 && (
                  <div
                    className="bg-red-400 transition-all duration-500"
                    style={{ width: `${(counts.REJECTED / requests.length) * 100}%` }}
                  />
                )}
                {counts.PENDING > 0 && (
                  <div
                    className="bg-amber-400 transition-all duration-500"
                    style={{ width: `${(counts.PENDING / requests.length) * 100}%` }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DocuSeal integration status */}
      <Card className="mb-4">
        <CardContent className="py-3 flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <p className="text-xs text-seal-gray-500 dark:text-slate-400">
            DocuSeal connecté — <a href={process.env.NEXT_PUBLIC_DOCUSEAL_URL || 'http://localhost:7000'} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Ouvrir DocuSeal</a>
          </p>
        </CardContent>
      </Card>

      {/* Bulk actions */}
      {counts.PENDING > 0 && (
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={async () => {
            const pending = requests.filter(s => s.status === 'PENDING');
            for (const sig of pending) {
              await api.post('/notifications', {
                userId: sig.signer.id,
                type: 'SIGNATURE_NEEDED',
                title: `Rappel : signature en attente`,
                body: `Vous avez une signature en attente. Veuillez la compléter dans les meilleurs délais.`,
                resourceType: 'Signature',
                resourceId: sig.id,
              }).catch(console.error);
            }
            toast.success(`${pending.length} rappel(s) envoyé(s)`);
          }}>
            <Bell className="h-4 w-4 mr-1.5" />
            Rappeler les signatures en attente ({counts.PENDING})
          </Button>
        </div>
      )}

      {/* View mode toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setViewMode('list')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${viewMode === 'list' ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'}`}
        >
          Liste
        </button>
        <button
          onClick={() => setViewMode('timeline')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${viewMode === 'timeline' ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'}`}
        >
          Timeline
        </button>
      </div>

      {/* Signatures list */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-navy dark:text-white">
            {filter === 'ALL' ? t('signatures.allRequests') : filter === 'PENDING' ? t('signatures.pendingRequests') : filter === 'SIGNED' ? t('signatures.signedRequests') : t('signatures.rejectedRequests')}
            {' '}({filtered.length})
          </h2>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <EmptyState type="general" title={t('signatures.noRequests')} description="Aucune demande ne correspond au filtre actuel." />
          ) : viewMode === 'timeline' ? (
            <div className="relative pl-6">
              {/* Timeline vertical line */}
              <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-slate-700" />
              {filtered
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((req) => (
                <div key={req.id} className="relative pb-6 last:pb-0">
                  {/* Timeline dot */}
                  <div className={`absolute -left-[16px] top-1 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 ${
                    req.status === 'SIGNED' ? 'bg-emerald-500' : req.status === 'REJECTED' ? 'bg-red-500' : 'bg-amber-500'
                  }`} />
                  <div className="rounded-lg border border-gray-200 dark:border-slate-700 p-3 hover:border-primary/50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <Link
                        href={`/documents/${req.documentVersion.document.id}`}
                        className="text-sm font-semibold text-navy dark:text-white hover:text-primary transition-colors"
                      >
                        {req.documentVersion.document.title}
                      </Link>
                      <SignatureBadge status={req.status as 'PENDING' | 'SIGNED' | 'REJECTED' | 'EXPIRED'} />
                    </div>
                    <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                      <span className="font-mono">{req.documentVersion.document.reference}</span>
                      {` — ${t('signatures.signer')} : `}
                      {req.signer.firstName} {req.signer.lastName}
                    </p>
                    <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-1">
                      {formatDateTime(req.createdAt)}
                      {req.signedAt && ` — Signe le ${formatDateTime(req.signedAt)}`}
                    </p>
                    {req.status === 'PENDING' && req.docusealSubmissionId && (
                      <a
                        href={`${process.env.NEXT_PUBLIC_DOCUSEAL_URL || 'http://localhost:7000'}/s/${req.docusealSlug || req.docusealSubmissionId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-1 text-xs font-semibold text-primary hover:underline"
                      >
                        <PenLine className="h-3 w-3" />
                        {t('signatures.signNow')}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center gap-4 rounded-lg border border-gray-200 dark:border-slate-700 p-4"
                >
                  <PenLine className="h-5 w-5 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/documents/${req.documentVersion.document.id}`}
                      className="text-sm font-semibold text-navy dark:text-white hover:text-primary transition-colors"
                    >
                      {req.documentVersion.document.title}
                    </Link>
                    <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                      <span className="font-mono">{req.documentVersion.document.reference}</span>
                      {` — ${t('signatures.signer')} : `}
                      {req.signer.firstName} {req.signer.lastName}
                    </p>
                    <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                      {t('signatures.requestedBy')} {req.requestedBy.firstName} {req.requestedBy.lastName}
                      {` ${t('signatures.on')} `}{formatDateTime(req.createdAt)}
                    </p>
                    {req.status === 'PENDING' && req.docusealSubmissionId && (
                      <a
                        href={`${process.env.NEXT_PUBLIC_DOCUSEAL_URL || 'http://localhost:7000'}/s/${req.docusealSlug || req.docusealSubmissionId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 mt-1 text-sm font-semibold text-primary hover:underline"
                      >
                        <PenLine className="h-3.5 w-3.5" />
                        {t('signatures.signNow')}
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <SignatureBadge status={req.status as 'PENDING' | 'SIGNED' | 'REJECTED' | 'EXPIRED'} />
                    {req.signedAt && (
                      <span className="text-xs text-seal-gray-500 dark:text-slate-400">
                        {formatDateTime(req.signedAt)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
