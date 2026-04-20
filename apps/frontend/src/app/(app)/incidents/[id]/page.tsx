'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';
import { isRoleAtLeast, UserRole } from '@omnitech/shared';
import { EntityBreadcrumb } from '@/components/ui/entity-breadcrumb';
import { InlineStatusDropdown } from '@/components/ui/inline-status-dropdown';
import { eventBus, createEvent } from '@/lib/events';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Dialog,
  Input,
  Select,
  Skeleton,
  Tabs,
  Textarea,
} from '@omnitech/ui';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  MessageSquare,
  Plus,
  Send,
  Target,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

// --- Mirrors backend enums --------------------------------------------------

const STATUS_FLOW = [
  'DETECTED',
  'UNDER_INVESTIGATION',
  'CONTAINED',
  'ERADICATED',
  'RECOVERED',
  'CLOSED',
] as const;

const STATUS_LABEL: Record<string, string> = {
  DETECTED: 'Détecté',
  UNDER_INVESTIGATION: 'Investigation',
  CONTAINED: 'Contenu',
  ERADICATED: 'Éradiqué',
  RECOVERED: 'Rétabli',
  CLOSED: 'Clôturé',
};

const STATUS_BADGE_VARIANT: Record<
  string,
  'error' | 'warning' | 'info' | 'navy' | 'primary' | 'success'
> = {
  DETECTED: 'error',
  UNDER_INVESTIGATION: 'warning',
  CONTAINED: 'info',
  ERADICATED: 'primary',
  RECOVERED: 'success',
  CLOSED: 'navy',
};

const SEVERITY_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  CRITICAL: { bg: 'bg-[#cc0000]/10', text: 'text-[#cc0000]', label: 'Critique' },
  HIGH: { bg: 'bg-[#892034]/10', text: 'text-[#892034]', label: 'Haute' },
  MEDIUM: { bg: 'bg-[#c68200]/10', text: 'text-[#c68200]', label: 'Moyenne' },
  LOW: { bg: 'bg-[#70916a]/15', text: 'text-[#70916a]', label: 'Faible' },
};

const REMEDIATION_PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Faible' },
  { value: 'MEDIUM', label: 'Moyenne' },
  { value: 'HIGH', label: 'Haute' },
  { value: 'CRITICAL', label: 'Critique' },
];

// --- Types ------------------------------------------------------------------

interface UserMini {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface Remediation {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  completedAt: string | null;
  evidence: string | null;
  responsible: UserMini | null;
}

interface TimelineEntry {
  id: string;
  entryType: string;
  content: string;
  createdAt: string;
  author: UserMini | null;
}

interface IncidentDetail {
  id: string;
  reference: string;
  title: string;
  description: string;
  status: string;
  severity: keyof typeof SEVERITY_STYLE;
  category: string;
  detectedAt: string;
  containedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  affectedSystems: string[];
  affectedUsers: number;
  impactSummary: string | null;
  rootCause: string | null;
  lessonsLearned: string | null;
  gdprNotifiable: boolean;
  cnilReported: boolean;
  cnilReportedAt: string | null;
  tags: string[];
  reporter: UserMini | null;
  assignedTo: UserMini | null;
  remediations: Remediation[];
  timeline: TimelineEntry[];
}

// --- Page -------------------------------------------------------------------

export default function IncidentDetailPage() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const router = useRouter();
  const user = useAuthStore(s => s.user);

  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('details');
  const [comment, setComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Remediation form
  const [remediationOpen, setRemediationOpen] = useState(false);
  const [savingRemediation, setSavingRemediation] = useState(false);
  const [remForm, setRemForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    priority: 'MEDIUM',
  });

  // Impact editing state (reviewer+)
  const [impactForm, setImpactForm] = useState({
    rootCause: '',
    lessonsLearned: '',
    impactSummary: '',
    affectedUsers: 0,
    gdprNotifiable: false,
  });

  const isReviewer = useMemo(
    () => (user ? isRoleAtLeast(user.role, UserRole.REVIEWER) : false),
    [user],
  );

  const fetchIncident = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<IncidentDetail>(`/incidents/${id}`);
      setIncident(res.data);
      setImpactForm({
        rootCause: res.data.rootCause || '',
        lessonsLearned: res.data.lessonsLearned || '',
        impactSummary: res.data.impactSummary || '',
        affectedUsers: res.data.affectedUsers || 0,
        gdprNotifiable: res.data.gdprNotifiable || false,
      });
    } catch (err) {
      console.error(err);
      toast.error('Incident introuvable');
      router.push('/incidents');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (id) fetchIncident();
  }, [id, fetchIncident]);

  const changeStatus = async (newStatus: string) => {
    if (!incident) return;
    const prev = incident.status;
    // Optimistic update + event
    setIncident(i => i ? { ...i, status: newStatus } : i);
    eventBus.emit(createEvent('STATUS_CHANGED', 'INCIDENT', incident.id, {
      from: prev, to: newStatus, optimistic: true,
    }));
    try {
      await api.post(`/incidents/${id}/status`, { status: newStatus });
      toast.success('Statut mis à jour');
      eventBus.emit(createEvent('STATUS_CHANGED', 'INCIDENT', incident.id, {
        from: prev, to: newStatus, optimistic: false,
      }));
      fetchIncident();
    } catch (err: unknown) {
      // Rollback
      setIncident(i => i ? { ...i, status: prev } : i);
      eventBus.emit(createEvent('ROLLBACK', 'INCIDENT', incident.id, {
        from: newStatus, to: prev, optimistic: false,
      }));
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Erreur';
      toast.error(String(msg));
    }
  };

  const submitComment = async () => {
    if (comment.trim().length < 1) return;
    setSubmittingComment(true);
    try {
      await api.post(`/incidents/${id}/timeline`, {
        entryType: 'COMMENT',
        content: comment.trim(),
      });
      setComment('');
      fetchIncident();
    } catch {
      toast.error('Erreur commentaire');
    } finally {
      setSubmittingComment(false);
    }
  };

  const createRemediation = async () => {
    if (remForm.title.trim().length < 3) {
      toast.error('Titre trop court');
      return;
    }
    setSavingRemediation(true);
    try {
      await api.post(`/incidents/${id}/remediations`, {
        title: remForm.title.trim(),
        description: remForm.description.trim() || undefined,
        dueDate: remForm.dueDate || undefined,
        priority: remForm.priority,
      });
      toast.success('Remediation ajoutee');
      setRemediationOpen(false);
      setRemForm({ title: '', description: '', dueDate: '', priority: 'MEDIUM' });
      fetchIncident();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Erreur';
      toast.error(String(msg));
    } finally {
      setSavingRemediation(false);
    }
  };

  const completeRemediation = async (remediationId: string) => {
    const evidence = window.prompt(
      'Décrivez la preuve de réalisation (lien, référence, commentaire)',
    );
    if (!evidence) return;
    try {
      await api.post(`/remediations/${remediationId}/complete`, { evidence });
      toast.success('Remediation cloturee');
      fetchIncident();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Erreur';
      toast.error(String(msg));
    }
  };

  const saveImpact = async () => {
    try {
      await api.patch(`/incidents/${id}`, impactForm);
      toast.success('Impact enregistre');
      fetchIncident();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Erreur';
      toast.error(String(msg));
    }
  };

  if (loading || !incident) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-4 w-32" />
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const severity = SEVERITY_STYLE[incident.severity];
  const currentStatusIdx = STATUS_FLOW.indexOf(
    incident.status as (typeof STATUS_FLOW)[number],
  );
  const nextStatuses = STATUS_FLOW.filter(
    (s, idx) => idx > currentStatusIdx && idx <= currentStatusIdx + 2,
  );

  return (
    <div className="p-6 space-y-6">
      <EntityBreadcrumb module="Incidents" href="/incidents" current={incident.reference} />

      {/* Header */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono text-xs text-seal-gray-500">
                  {incident.reference}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${severity?.bg} ${severity?.text}`}
                >
                  {severity?.label}
                </span>
                <InlineStatusDropdown
                  current={incident.status}
                  statuses={STATUS_FLOW.map(s => ({
                    value: s,
                    label: STATUS_LABEL[s] || s,
                    badgeBg: s === 'DETECTED' ? 'bg-red-100 dark:bg-red-900/30' : s === 'UNDER_INVESTIGATION' ? 'bg-amber-100 dark:bg-amber-900/30' : s === 'CONTAINED' ? 'bg-blue-100 dark:bg-blue-900/30' : s === 'ERADICATED' ? 'bg-violet-100 dark:bg-violet-900/30' : s === 'RECOVERED' ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-gray-100 dark:bg-slate-800',
                    badgeText: s === 'DETECTED' ? 'text-red-700 dark:text-red-400' : s === 'UNDER_INVESTIGATION' ? 'text-amber-700 dark:text-amber-400' : s === 'CONTAINED' ? 'text-blue-700 dark:text-blue-400' : s === 'ERADICATED' ? 'text-violet-700 dark:text-violet-400' : s === 'RECOVERED' ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-600 dark:text-slate-400',
                  }))}
                  actions={isReviewer ? STATUS_FLOW.filter(s => s !== incident.status).map(s => ({
                    key: s,
                    label: STATUS_LABEL[s] || s,
                  })) : []}
                  onAction={(key) => changeStatus(key)}
                  interactive={isReviewer}
                />
                {incident.gdprNotifiable && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#c68200]/10 text-[#c68200] px-2 py-0.5 text-[11px] font-semibold">
                    <AlertTriangle className="h-3 w-3" />
                    RGPD
                  </span>
                )}
              </div>
              <h1 className="mt-2 text-xl font-medium text-seal-navy dark:text-white">
                {incident.title}
              </h1>
              <div className="mt-1 text-xs text-seal-gray-500 space-x-3">
                <span>
                  Détecté le{' '}
                  {new Date(incident.detectedAt).toLocaleString('fr-FR')}
                </span>
                {incident.reporter && (
                  <span>
                    Signalé par {incident.reporter.firstName}{' '}
                    {incident.reporter.lastName}
                  </span>
                )}
                {incident.assignedTo && (
                  <span>
                    Assigné à {incident.assignedTo.firstName}{' '}
                    {incident.assignedTo.lastName}
                  </span>
                )}
              </div>
            </div>
            {/* Status transitions now handled by inline dropdown on the badge above */}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'details', label: 'Détails' },
          {
            id: 'remediations',
            label: 'Remédiations',
            count: incident.remediations.length,
          },
          {
            id: 'timeline',
            label: 'Timeline',
            count: incident.timeline.length,
          },
          { id: 'impact', label: 'Impact' },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* Details */}
      {activeTab === 'details' && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div>
              <h3 className="text-[10px] font-medium uppercase tracking-widest text-seal-gray-500 dark:text-slate-500 mb-2">
                Description
              </h3>
              <p className="text-sm text-seal-navy dark:text-white whitespace-pre-wrap">
                {incident.description}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-seal-gray-500">Catégorie</p>
                <p className="text-seal-navy dark:text-white font-semibold">
                  {incident.category}
                </p>
              </div>
              <div>
                <p className="text-seal-gray-500">Systèmes affectés</p>
                <p className="text-seal-navy dark:text-white font-semibold">
                  {incident.affectedSystems.length > 0
                    ? incident.affectedSystems.join(', ')
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-seal-gray-500">Contenu le</p>
                <p className="text-seal-navy dark:text-white font-semibold">
                  {incident.containedAt
                    ? new Date(incident.containedAt).toLocaleString('fr-FR')
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-seal-gray-500">Rétabli le</p>
                <p className="text-seal-navy dark:text-white font-semibold">
                  {incident.resolvedAt
                    ? new Date(incident.resolvedAt).toLocaleString('fr-FR')
                    : '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Remediations */}
      {activeTab === 'remediations' && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
                Plan de remédiation
              </h3>
              {isReviewer && (
                <Button
                  size="sm"
                  onClick={() => setRemediationOpen(true)}
                  className="bg-primary hover:bg-primary/90 text-white"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Ajouter une remédiation
                </Button>
              )}
            </div>
            {incident.remediations.length === 0 ? (
              <p className="text-xs text-seal-gray-500 italic py-4">
                Aucune remédiation définie pour le moment.
              </p>
            ) : (
              <div className="space-y-2">
                {incident.remediations.map((r) => (
                  <div
                    key={r.id}
                    className="border border-gray-200 dark:border-slate-700 rounded-lg p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-seal-navy dark:text-white">
                            {r.title}
                          </p>
                          <Badge
                            variant={
                              r.status === 'DONE'
                                ? 'success'
                                : r.status === 'IN_PROGRESS'
                                  ? 'warning'
                                  : r.status === 'BLOCKED'
                                    ? 'error'
                                    : 'navy'
                            }
                          >
                            {r.status}
                          </Badge>
                          <span className="text-[10px] rounded-full bg-primary/10 text-primary px-2 py-0.5 font-semibold">
                            {r.priority}
                          </span>
                        </div>
                        {r.description && (
                          <p className="text-xs text-seal-gray-500 mt-1">
                            {r.description}
                          </p>
                        )}
                        <div className="mt-2 flex gap-3 text-[11px] text-seal-gray-500">
                          {r.responsible && (
                            <span>
                              Responsable : {r.responsible.firstName}{' '}
                              {r.responsible.lastName}
                            </span>
                          )}
                          {r.dueDate && (
                            <span>
                              Échéance :{' '}
                              {new Date(r.dueDate).toLocaleDateString('fr-FR')}
                            </span>
                          )}
                          {r.completedAt && (
                            <span>
                              Terminée :{' '}
                              {new Date(r.completedAt).toLocaleDateString('fr-FR')}
                            </span>
                          )}
                        </div>
                        {r.evidence && (
                          <p className="mt-2 text-[11px] text-[#70916a] flex items-start gap-1">
                            <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span>Preuve : {r.evidence}</span>
                          </p>
                        )}
                      </div>
                      {r.status !== 'DONE' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => completeRemediation(r.id)}
                        >
                          Marquer terminée
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      {activeTab === 'timeline' && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="space-y-3">
              {incident.timeline.length === 0 ? (
                <p className="text-xs text-seal-gray-500 italic">
                  Aucune entrée dans la chronologie.
                </p>
              ) : (
                <div className="relative">
                  {/* Vertical connecting line */}
                  <div className="absolute left-4 top-4 bottom-4 w-px bg-gray-200 dark:bg-slate-700" />
                  {incident.timeline.map((t, idx) => {
                    const isLast = idx === incident.timeline.length - 1;
                    const iconStyle = t.entryType === 'STATUS_CHANGE'
                      ? { bg: 'bg-primary/15', icon: <ClipboardList className="h-3.5 w-3.5 text-primary" /> }
                      : t.entryType === 'EVIDENCE'
                      ? { bg: 'bg-[#70916a]/15', icon: <CheckCircle2 className="h-3.5 w-3.5 text-[#70916a]" /> }
                      : t.entryType === 'ACTION'
                      ? { bg: 'bg-[#c68200]/15', icon: <Target className="h-3.5 w-3.5 text-[#c68200]" /> }
                      : { bg: 'bg-seal-navy/10 dark:bg-slate-700', icon: <MessageSquare className="h-3.5 w-3.5 text-seal-navy dark:text-slate-300" /> };
                    const entryLabel = t.entryType === 'STATUS_CHANGE' ? 'Changement de statut'
                      : t.entryType === 'EVIDENCE' ? 'Preuve'
                      : t.entryType === 'ACTION' ? 'Action'
                      : 'Commentaire';
                    return (
                      <div
                        key={t.id}
                        className={`relative flex gap-3 pb-4 last:pb-0 transition-all duration-200 ${
                          isLast ? 'rounded-xl border border-primary/30 bg-primary/5 dark:bg-primary/10 p-3 -ml-1' : ''
                        }`}
                      >
                        <div className={`relative z-10 h-8 w-8 rounded-full ${iconStyle.bg} flex items-center justify-center flex-shrink-0 ring-2 ring-white dark:ring-slate-900`}>
                          {iconStyle.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-seal-navy dark:text-white">
                              {t.author
                                ? `${t.author.firstName} ${t.author.lastName}`
                                : 'Système'}
                            </span>
                            <span className="text-[10px] text-seal-gray-500 dark:text-slate-400">
                              {new Date(t.createdAt).toLocaleString('fr-FR')}
                            </span>
                            <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-medium ${
                              t.entryType === 'STATUS_CHANGE' ? 'bg-primary/10 text-primary' :
                              t.entryType === 'EVIDENCE' ? 'bg-[#70916a]/10 text-[#70916a]' :
                              t.entryType === 'ACTION' ? 'bg-[#c68200]/10 text-[#c68200]' :
                              'bg-gray-100 dark:bg-slate-800 text-seal-gray-500'
                            }`}>
                              {entryLabel}
                            </span>
                            {isLast && (
                              <span className="text-[9px] font-semibold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                                Dernier
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-seal-navy dark:text-slate-200 whitespace-pre-wrap">
                            {t.content}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-slate-700">
              <Textarea
                rows={2}
                placeholder="Ajouter un commentaire à la timeline..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="flex-1"
              />
              <Button
                onClick={submitComment}
                disabled={submittingComment || comment.trim().length === 0}
                className="bg-primary hover:bg-primary/90 text-white self-end"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Impact */}
      {activeTab === 'impact' && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Utilisateurs affectés"
                type="number"
                disabled={!isReviewer}
                value={String(impactForm.affectedUsers)}
                onChange={(e) =>
                  setImpactForm({
                    ...impactForm,
                    affectedUsers: Number(e.target.value) || 0,
                  })
                }
              />
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-xs text-seal-navy dark:text-white">
                  <input
                    type="checkbox"
                    disabled={!isReviewer}
                    checked={impactForm.gdprNotifiable}
                    onChange={(e) =>
                      setImpactForm({
                        ...impactForm,
                        gdprNotifiable: e.target.checked,
                      })
                    }
                    className="accent-primary"
                  />
                  Notification RGPD / CNIL requise
                </label>
              </div>
            </div>
            <Textarea
              label="Résumé d'impact"
              rows={2}
              disabled={!isReviewer}
              value={impactForm.impactSummary}
              onChange={(e) =>
                setImpactForm({ ...impactForm, impactSummary: e.target.value })
              }
            />
            <Textarea
              label="Cause racine (root cause)"
              rows={3}
              disabled={!isReviewer}
              value={impactForm.rootCause}
              onChange={(e) =>
                setImpactForm({ ...impactForm, rootCause: e.target.value })
              }
            />
            <Textarea
              label="Enseignements (ISO 27001 A.5.27)"
              rows={3}
              disabled={!isReviewer}
              value={impactForm.lessonsLearned}
              onChange={(e) =>
                setImpactForm({ ...impactForm, lessonsLearned: e.target.value })
              }
            />
            {isReviewer && (
              <div className="flex justify-end">
                <Button
                  onClick={saveImpact}
                  className="bg-primary hover:bg-primary/90 text-white"
                >
                  Enregistrer
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add remediation modal */}
      <Dialog
        open={remediationOpen}
        onClose={() => setRemediationOpen(false)}
        title="Ajouter une remédiation"
        description="Définissez une action corrective à tracer"
      >
        <div className="space-y-3">
          <Input
            label="Titre *"
            placeholder="Ex. Révoquer les tokens AD compromis"
            value={remForm.title}
            onChange={(e) => setRemForm({ ...remForm, title: e.target.value })}
          />
          <Textarea
            label="Description"
            rows={3}
            value={remForm.description}
            onChange={(e) =>
              setRemForm({ ...remForm, description: e.target.value })
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="date"
              label="Échéance"
              value={remForm.dueDate}
              onChange={(e) => setRemForm({ ...remForm, dueDate: e.target.value })}
            />
            <Select
              label="Priorité"
              options={REMEDIATION_PRIORITY_OPTIONS}
              value={remForm.priority}
              onChange={(e) =>
                setRemForm({ ...remForm, priority: e.target.value })
              }
            />
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-gray-100 dark:border-slate-700">
            <Button variant="outline" onClick={() => setRemediationOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={createRemediation}
              disabled={savingRemediation}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              {savingRemediation ? 'Enregistrement...' : 'Créer'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
