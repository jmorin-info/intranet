'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, BellRing, CheckCircle2, Clock3, FileText, RefreshCw, Workflow, XCircle } from 'lucide-react';
import { Button, Card, CardContent, Dialog, EmptyState, SearchInput, Skeleton, buttonVariants } from '@omnitech/ui';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { PageHeader } from '@/components/layout/page-header';
import { approvalDueTime, approvalRequestError, approvalSummary, decisionCommentError, filterApprovals,
  type ApprovalFilter, type PendingApproval } from '@/lib/approvals';

type Decision = 'APPROVED' | 'REJECTED';

export default function ApprovalsPage() {
  const user = useAuthStore((state) => state.user);
  const [rows, setRows] = useState<PendingApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ApprovalFilter>('all');
  const [now, setNow] = useState(Date.now);
  const [selection, setSelection] = useState<{ row: PendingApproval; decision: Decision } | null>(null);
  const [comment, setComment] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [saving, setSaving] = useState(false);
  const [reminding, setReminding] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get<PendingApproval[]>('/approval-workflows/pending/me', { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!Array.isArray(data)) throw new Error('Réponse du circuit invalide. Actualisez la liste ou contactez le support.');
      setRows(data);
      setLoaded(true);
      setNow(Date.now());
    } catch (failure) {
      if (!controller.signal.aborted) setError(approvalRequestError(failure, 'Impossible de charger vos approbations. Réessayez dans un instant.'));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refreshClock = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => { request.current?.abort(); window.clearInterval(refreshClock); };
  }, [load]);

  const summary = useMemo(() => approvalSummary(rows, now), [rows, now]);
  const visible = useMemo(() => filterApprovals(rows, query, filter, now), [rows, query, filter, now]);

  function openDecision(row: PendingApproval, decision: Decision) {
    setSelection({ row, decision });
    setComment('');
    setDecisionError('');
  }

  async function submitDecision(event: React.FormEvent) {
    event.preventDefault();
    if (!selection || saving) return;
    const invalid = decisionCommentError(selection.decision, comment);
    if (invalid) { setDecisionError(invalid); return; }
    setSaving(true);
    setDecisionError('');
    try {
      await api.post(`/approval-workflows/steps/${encodeURIComponent(selection.row.id)}/decide`, {
        decision: selection.decision, comment: comment.trim() || undefined,
      });
      toast.success(selection.decision === 'APPROVED' ? 'Votre approbation a été enregistrée.' : 'Votre refus et son motif ont été enregistrés.');
      setSelection(null);
      await load();
    } catch (failure) {
      const message = approvalRequestError(failure, 'La décision n’a pas pu être enregistrée. Vérifiez la demande puis réessayez.');
      setDecisionError(message);
      if ((failure as { response?: { status?: number } })?.response?.status === 409) {
        setSelection(null);
        toast.info(message);
        await load();
      }
    } finally { setSaving(false); }
  }

  async function remind(row: PendingApproval) {
    if (reminding) return;
    setReminding(row.instance.id);
    try {
      const { data } = await api.post<{ sent: number; alreadySent: boolean }>(
        `/approval-workflows/instances/${encodeURIComponent(row.instance.id)}/remind`,
      );
      if (data.alreadySent) toast.info('Une relance a déjà été envoyée aujourd’hui pour cette étape.');
      else toast.success(data.sent ? 'La relance a été envoyée aux approbateurs concernés.' : 'Aucun destinataire disponible pour cette relance.');
    } catch (failure) { toast.error(approvalRequestError(failure, 'La relance n’a pas pu être envoyée.')); }
    finally { setReminding(null); }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader title="Mes approbations" subtitle="Les étapes qui attendent votre décision, classées par échéance."
        icon={Workflow} hub="work" actions={
          <Button variant="outline" onClick={() => void load()} loading={loading}>
            {!loading && <RefreshCw className="h-4 w-4" aria-hidden="true" />} Actualiser
          </Button>
        } />

      {error && <div role="alert" className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}{loaded ? ' La dernière liste chargée reste affichée.' : ''}</span></p>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>Réessayer</Button>
      </div>}

      {!loaded && loading ? <div className="space-y-3" role="status" aria-label="Chargement des approbations">
        {[1, 2, 3].map((item) => <Skeleton key={item} className="h-28 w-full rounded-xl" />)}
      </div> : loaded && <>
        <div className="grid gap-3 sm:grid-cols-3" aria-label="Synthèse des approbations">
          {([
            { key: 'all', title: 'À traiter', count: summary.pending, icon: Workflow, tone: 'text-seal-navy dark:text-blue-200' },
            { key: 'overdue', title: 'En retard', count: summary.overdue, icon: AlertCircle, tone: 'text-[#892034] dark:text-red-300' },
            { key: 'soon', title: 'Échéance sous 24 h', count: summary.soon, icon: Clock3, tone: 'text-amber-800 dark:text-amber-300' },
          ] as const).map((item) => <button type="button" key={item.key} aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)} className={`flex items-center justify-between rounded-xl border bg-white p-4 text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-blue dark:bg-slate-900 ${filter === item.key ? 'border-seal-blue ring-1 ring-seal-blue' : 'border-gray-200 dark:border-slate-700 hover:border-seal-blue/50'}`}>
            <span><span className="block text-sm text-seal-gray-500 dark:text-slate-400">{item.title}</span>
              <span className={`mt-1 block text-2xl font-semibold tabular-nums ${item.tone}`}>{item.count}</span></span>
            <item.icon className={`h-6 w-6 ${item.tone}`} aria-hidden="true" />
          </button>)}
        </div>

        <Card><CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1"><label className="mb-1.5 block text-sm font-medium" htmlFor="approval-search">Rechercher une demande</label>
              <SearchInput id="approval-search" value={query} onChange={setQuery} placeholder="Titre, référence, circuit ou étape" />
            </div>
            <div><label className="mb-1.5 block text-sm font-medium" htmlFor="approval-deadline">Échéance</label>
              <select id="approval-deadline" value={filter} onChange={(event) => setFilter(event.target.value as ApprovalFilter)}
                className="h-10 w-full rounded-btn border border-gray-300 bg-white px-3 text-sm text-seal-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-blue dark:border-slate-600 dark:bg-slate-800 dark:text-white sm:w-52">
                <option value="all">Toutes les échéances</option><option value="overdue">En retard</option>
                <option value="soon">Dans les prochaines 24 h</option><option value="without-deadline">Sans échéance</option>
              </select>
            </div>
          </div>
          <p role="status" aria-live="polite" className="text-xs text-seal-gray-500 dark:text-slate-400">
            {visible.length} demande{visible.length > 1 ? 's' : ''} affichée{visible.length > 1 ? 's' : ''} sur {summary.pending} à traiter
          </p>
        </CardContent></Card>

        {visible.length === 0 ? <EmptyState icon={summary.pending ? FileText : CheckCircle2}
          title={summary.pending ? 'Aucune demande ne correspond aux filtres' : 'Aucune approbation en attente'}
          description={summary.pending ? 'Modifiez la recherche ou l’échéance pour retrouver une demande.' : 'Les nouvelles étapes qui vous sont confiées apparaîtront ici. Vous pouvez poursuivre votre travail.'}
          cta={summary.pending ? { label: 'Réinitialiser les filtres', onClick: () => { setQuery(''); setFilter('all'); } }
            : { label: 'Consulter la GED', href: '/documents' }} /> : <div className="space-y-3" aria-label="Demandes à traiter" aria-busy={loading}>
          {visible.map((row) => {
            const due = approvalDueTime(row);
            const overdue = due !== null && due <= now;
            const mayRemind = row.instance.startedById === user?.id || (!!user && isRoleAtLeast(user.role, UserRole.ADMIN));
            return <article key={row.id} className={`rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-900 sm:p-5 ${overdue ? 'border-l-4 border-l-[#892034] border-gray-200 dark:border-slate-700 dark:border-l-red-400' : 'border-gray-200 dark:border-slate-700'}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <p className="text-xs font-medium text-seal-gray-500 dark:text-slate-400">{row.instance.workflow.name} · Étape {row.step.order}</p>
                  <h2 className="break-words text-base font-semibold text-seal-navy dark:text-white">
                    <Link href={`/documents/${encodeURIComponent(row.instance.documentId)}`} className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-blue rounded">
                      {row.instance.document?.title || 'Document à examiner'}
                    </Link>
                  </h2>
                  <p className="text-sm text-seal-gray-500 dark:text-slate-400">{row.instance.document?.reference ? `${row.instance.document.reference} · ` : ''}{row.step.name}</p>
                  <p className={`flex items-center gap-1.5 text-xs ${overdue ? 'font-semibold text-[#892034] dark:text-red-300' : 'text-seal-gray-500 dark:text-slate-400'}`}>
                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    {due === null ? 'Aucune échéance définie' : <>{overdue ? 'En retard depuis le ' : 'À traiter avant le '}<time dateTime={row.dueAt || undefined}>{new Date(due).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</time></>}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 lg:max-w-sm lg:justify-end">
                  <Link href={`/documents/${encodeURIComponent(row.instance.documentId)}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                    <FileText className="h-4 w-4" aria-hidden="true" /> Examiner
                  </Link>
                  <Button size="sm" onClick={() => openDecision(row, 'APPROVED')} disabled={saving || loading}><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Approuver</Button>
                  <Button size="sm" variant="outline" onClick={() => openDecision(row, 'REJECTED')} disabled={saving || loading}><XCircle className="h-4 w-4" aria-hidden="true" /> Refuser</Button>
                  {mayRemind && <Button size="sm" variant="ghost" onClick={() => void remind(row)} loading={reminding === row.instance.id} disabled={reminding !== null}>
                    {reminding !== row.instance.id && <BellRing className="h-4 w-4" aria-hidden="true" />} Relancer
                  </Button>}
                </div>
              </div>
            </article>;
          })}
        </div>}
        <p className="text-xs leading-relaxed text-seal-gray-500 dark:text-slate-400">Seules les étapes actuellement ouvertes sont proposées. Chaque décision est enregistrée dans l’historique du circuit. Les relances sont limitées à une par étape et par jour.</p>
      </>}

      <Dialog open={selection !== null} onClose={() => { if (!saving) setSelection(null); }}
        title={selection?.decision === 'REJECTED' ? 'Refuser cette étape' : 'Confirmer votre approbation'}
        description="Examinez le document et sa version avant de confirmer. Votre décision sera horodatée et conservée dans le circuit.">
        {selection && <form onSubmit={(event) => void submitDecision(event)} className="space-y-4">
          <div className="rounded-lg border border-gray-200 p-3 text-sm dark:border-slate-700">
            <p className="font-semibold">{selection.row.instance.document?.title || 'Document à examiner'}</p>
            <p className="mt-1 text-seal-gray-500 dark:text-slate-400">{selection.row.instance.workflow.name} · {selection.row.step.name}</p>
            <Link href={`/documents/${encodeURIComponent(selection.row.instance.documentId)}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-medium text-seal-blue underline">Ouvrir le document dans un nouvel onglet</Link>
          </div>
          <div><label htmlFor="approval-comment" className="mb-1.5 block text-sm font-medium">{selection.decision === 'REJECTED' ? 'Motif du refus (obligatoire)' : 'Commentaire (facultatif)'}</label>
            <textarea id="approval-comment" value={comment} onChange={(event) => setComment(event.target.value)}
              required={selection.decision === 'REJECTED'} maxLength={2000} rows={4} disabled={saving}
              aria-invalid={!!decisionError} aria-describedby="approval-comment-help"
              className="w-full rounded-btn border border-gray-300 bg-white p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-blue dark:border-slate-600 dark:bg-slate-800" />
            <p id="approval-comment-help" className="mt-1 text-xs text-seal-gray-500 dark:text-slate-400">{comment.length}/2 000 caractères. Précisez les éléments à corriger en cas de refus.</p>
          </div>
          {decisionError && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{decisionError}</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4 dark:border-slate-700">
            <Button variant="outline" onClick={() => setSelection(null)} disabled={saving}>Annuler</Button>
            <Button type="submit" variant={selection.decision === 'REJECTED' ? 'danger' : 'primary'} loading={saving}>
              {selection.decision === 'REJECTED' ? 'Confirmer le refus' : 'Enregistrer mon approbation'}
            </Button>
          </div>
        </form>}
      </Dialog>
    </div>
  );
}
