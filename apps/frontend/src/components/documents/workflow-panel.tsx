'use client';

/**
 * WorkflowPanel — Panneau multi-reviewer pour la page détail d'un document.
 *
 * Deux modes :
 *  1) Aucune instance active → sélection du workflow template + override des
 *     approbateurs par étape + bouton "Démarrer le workflow".
 *  2) Instance active → timeline verticale des étapes, décisions, et boutons
 *     Approuver/Rejeter pour l'approbateur de l'étape courante.
 *
 * Conventions : classes seal-* / text-seal-navy / dark:text-white.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Clock, Loader2, PlayCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import { Card, CardContent, CardHeader, Button, Badge } from '@omnitech/ui';
import { MentionTextarea } from '@/components/ui/mention-textarea';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkflowTemplateStep {
  id: string;
  order: number;
  name: string;
  mode: 'SINGLE' | 'PARALLEL_ALL' | 'PARALLEL_ANY';
  approverRole?: string | null;
  approverUserId?: string | null;
  approverUser?: { id: string; firstName: string; lastName: string } | null;
  slaHours?: number | null;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string | null;
  documentCategory?: string | null;
  isActive: boolean;
  isDefault: boolean;
  steps: WorkflowTemplateStep[];
}

interface StepResult {
  id: string;
  stepId: string;
  decision: 'PENDING' | 'APPROVED' | 'REJECTED';
  comment?: string | null;
  decidedAt?: string | null;
  dueAt?: string | null;
  step: WorkflowTemplateStep;
  decidedBy?: { id: string; firstName: string; lastName: string } | null;
}

interface ActiveInstance {
  id: string;
  workflowId: string;
  documentId: string;
  documentVersionId: string;
  currentStepOrder: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  startedAt: string;
  completedAt?: string | null;
  workflow: WorkflowTemplate;
  stepResults: StepResult[];
  startedBy?: { id: string; firstName: string; lastName: string } | null;
}

interface SearchableUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface WorkflowPanelProps {
  documentId: string;
  /** ID de la version courante sur laquelle démarrer l'instance. */
  currentVersionId: string;
  /** Si true, l'utilisateur peut démarrer un nouveau workflow. */
  canStartWorkflow: boolean;
  /** Optionnel : catégorie du document pour filtrer les templates. */
  documentCategory?: string | null;
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export function WorkflowPanel({
  documentId,
  currentVersionId,
  canStartWorkflow,
  documentCategory,
}: WorkflowPanelProps) {
  const user = useAuthStore(s => s.user);

  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [instance, setInstance] = useState<ActiveInstance | null>(null);

  // État du "démarrage"
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [overrides, setOverrides] = useState<Record<string, string>>({}); // stepId -> userId
  const [userOptions, setUserOptions] = useState<SearchableUser[]>([]);
  const [starting, setStarting] = useState(false);

  // État de décision
  const [decisionComment, setDecisionComment] = useState('');
  const [deciding, setDeciding] = useState(false);

  // -------------------------------------------------------------------------
  // Chargement initial
  // -------------------------------------------------------------------------

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      // 1) Instance active pour ce document (peut être null)
      const instResp = await api
        .get(`/approval-workflows/instance/for-document/${documentId}`)
        .catch((err) => {
          if (err?.response?.status === 404) return { data: null } as { data: null };
          throw err;
        });
      const inst = (instResp?.data as ActiveInstance | null) ?? null;
      setInstance(inst);

      // 2) Templates disponibles (filtrés côté client par catégorie si possible)
      if (!inst) {
        const { data } = await api.get('/approval-workflows');
        const list: WorkflowTemplate[] = Array.isArray(data) ? data : [];
        const filtered = documentCategory
          ? list.filter(
              (t) =>
                t.isActive &&
                (!t.documentCategory || t.documentCategory === documentCategory),
            )
          : list.filter((t) => t.isActive);
        setTemplates(filtered);

        // Auto-sélection du default si présent
        const def = filtered.find((t) => t.isDefault);
        if (def) setSelectedTemplateId(def.id);
        else if (filtered[0]) setSelectedTemplateId(filtered[0].id);
      }

      // 3) Liste d'utilisateurs (pour les overrides d'approbateur)
      try {
        const { data: usersData } = await api.get('/users/directory', {
          params: { limit: 50 },
        });
        const raw = Array.isArray(usersData) ? usersData : usersData?.data || [];
        setUserOptions(raw);
      } catch {
        // /users est admin-only — non bloquant, on laisse vide
        setUserOptions([]);
      }
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          'Impossible de charger les informations de workflow',
      );
    } finally {
      setLoading(false);
    }
  }, [documentId, documentCategory]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // -------------------------------------------------------------------------
  // Sélection du template
  // -------------------------------------------------------------------------

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) || null,
    [templates, selectedTemplateId],
  );

  // Réinitialise les overrides quand on change de template
  useEffect(() => {
    if (!selectedTemplate) {
      setOverrides({});
      return;
    }
    const next: Record<string, string> = {};
    for (const step of selectedTemplate.steps) {
      if (step.approverUserId) next[step.id] = step.approverUserId;
    }
    setOverrides(next);
  }, [selectedTemplate]);

  // -------------------------------------------------------------------------
  // Démarrage
  // -------------------------------------------------------------------------

  const handleStart = async () => {
    if (!selectedTemplate) {
      toast.error('Sélectionnez un workflow');
      return;
    }
    setStarting(true);
    try {
      const stepOverrides = Object.entries(overrides)
        .filter(([, userId]) => !!userId)
        .map(([stepId, approverUserId]) => ({ stepId, approverUserId }));

      await api.post(`/approval-workflows/documents/${documentId}/start`, {
        workflowId: selectedTemplate.id,
        documentVersionId: currentVersionId,
        stepOverrides,
      });
      toast.success('Workflow démarré');
      await loadAll();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || 'Erreur lors du démarrage du workflow',
      );
    } finally {
      setStarting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Décision
  // -------------------------------------------------------------------------

  /** Retourne le StepResult correspondant à l'étape courante de l'instance. */
  const currentStepResult = useMemo<StepResult | null>(() => {
    if (!instance) return null;
    const current = instance.workflow.steps.find(
      (s) => s.order === instance.currentStepOrder,
    );
    if (!current) return null;
    return (
      instance.stepResults.find((sr) => sr.stepId === current.id) || null
    );
  }, [instance]);

  /**
   * Détermine si l'utilisateur courant est approbateur de l'étape courante.
   * Priorité : override (stocké dans le comment "__override_approver__:uid")
   * > approverUserId du template > approverRole.
   */
  const isCurrentApprover = useMemo(() => {
    if (!instance || !currentStepResult || !user) return false;
    const step = currentStepResult.step;

    // Override : comment encodé "__override_approver__:<uid>"
    const cm = currentStepResult.comment || '';
    const ovMatch = cm.match(/^__override_approver__:(.+)$/);
    if (ovMatch) return ovMatch[1] === user.id;

    if (step.approverUserId) return step.approverUserId === user.id;
    if (step.approverRole) return (user as any).role === step.approverRole;
    return false;
  }, [instance, currentStepResult, user]);

  const handleDecide = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!currentStepResult) return;
    setDeciding(true);
    try {
      await api.post(
        `/approval-workflows/steps/${currentStepResult.id}/decide`,
        { decision, comment: decisionComment || undefined },
      );
      toast.success(
        decision === 'APPROVED' ? 'Étape approuvée' : 'Étape rejetée',
      );
      setDecisionComment('');
      await loadAll();
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || "Erreur lors de l'enregistrement",
      );
    } finally {
      setDeciding(false);
    }
  };

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <Card className="shadow-sm rounded-xl">
        <CardHeader>
          <h3 className="text-sm font-medium text-seal-navy dark:text-white">
            Workflow d'approbation
          </h3>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-seal-gray-500 dark:text-slate-400 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </div>
        </CardContent>
      </Card>
    );
  }

  // ---- Cas : instance active -> timeline + actions ------------------------
  if (instance) {
    const steps = instance.workflow.steps;

    return (
      <Card className="shadow-sm rounded-xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-seal-navy dark:text-white">
              Workflow : {instance.workflow.name}
            </h3>
            <Badge variant={statusVariant(instance.status)}>
              {labelStatus(instance.status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {steps.map((step) => {
              const result = instance.stepResults.find(
                (sr) => sr.stepId === step.id,
              );
              const state: 'past' | 'current' | 'future' =
                step.order < instance.currentStepOrder
                  ? 'past'
                  : step.order === instance.currentStepOrder
                    ? 'current'
                    : 'future';

              // Affichage de l'approbateur : override > template > rôle
              const overrideMatch = result?.comment?.match(
                /^__override_approver__:(.+)$/,
              );
              const overrideUser =
                overrideMatch &&
                userOptions.find((u) => u.id === overrideMatch[1]);
              const templateUser = step.approverUser;
              const approverLabel = overrideUser
                ? `${overrideUser.firstName} ${overrideUser.lastName}`
                : templateUser
                  ? `${templateUser.firstName} ${templateUser.lastName}`
                  : step.approverRole || 'Non assigné';

              // Commentaire "réel" (hors marqueur override)
              const realComment =
                result?.comment && !overrideMatch ? result.comment : null;

              return (
                <li
                  key={step.id}
                  className="flex items-start gap-3 border-l-2 pl-3 py-1 rounded-r"
                  style={{
                    borderColor:
                      state === 'past'
                        ? '#10b981'
                        : state === 'current'
                          ? '#f59e0b'
                          : '#cbd5e1',
                  }}
                >
                  <div className="mt-0.5">
                    {result?.decision === 'APPROVED' && (
                      <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    )}
                    {result?.decision === 'REJECTED' && (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    {(!result || result.decision === 'PENDING') && (
                      <Clock
                        className={`h-5 w-5 ${
                          state === 'current'
                            ? 'text-amber-500 animate-pulse'
                            : 'text-slate-400'
                        }`}
                      />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-seal-navy dark:text-white">
                      {step.order}. {step.name}
                    </p>
                    <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                      Approbateur : {approverLabel}
                      {step.mode !== 'SINGLE' && ` — ${step.mode}`}
                    </p>
                    {result?.decidedBy && result.decidedAt && (
                      <p className="text-[11px] text-seal-gray-500 dark:text-slate-500">
                        Décidé par {result.decidedBy.firstName}{' '}
                        {result.decidedBy.lastName} le{' '}
                        {new Date(result.decidedAt).toLocaleString('fr-FR')}
                      </p>
                    )}
                    {realComment && (
                      <p className="mt-1 text-xs italic text-gray-700 dark:text-slate-300">
                        « {realComment} »
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {/* Zone de décision pour l'approbateur courant */}
          {instance.status === 'PENDING' &&
            isCurrentApprover &&
            currentStepResult?.decision === 'PENDING' && (
              <div className="mt-4 border-t pt-3 border-gray-200 dark:border-slate-700">
                <p className="text-xs font-medium text-seal-navy dark:text-white mb-2">
                  Votre décision
                </p>
                <MentionTextarea
                  value={decisionComment}
                  onChange={setDecisionComment}
                  placeholder="Commentaire (optionnel, @mention possible)…"
                  rows={3}
                />
                <div className="mt-2 flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => handleDecide('APPROVED')}
                    loading={deciding}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Approuver
                  </Button>
                  <Button
                    className="flex-1"
                    variant="danger"
                    onClick={() => handleDecide('REJECTED')}
                    loading={deciding}
                  >
                    <XCircle className="h-4 w-4" />
                    Rejeter
                  </Button>
                </div>
              </div>
            )}
        </CardContent>
      </Card>
    );
  }

  // ---- Cas : pas d'instance -> sélection de template ----------------------
  return (
    <Card className="shadow-sm rounded-xl">
      <CardHeader>
        <h3 className="text-sm font-medium text-seal-navy dark:text-white">
          Workflow d'approbation
        </h3>
      </CardHeader>
      <CardContent>
        {!canStartWorkflow ? (
          <p className="text-sm text-seal-gray-500 dark:text-slate-400">
            Aucun workflow en cours pour ce document.
          </p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-seal-gray-500 dark:text-slate-400">
            Aucun workflow template disponible
            {documentCategory ? ` pour la catégorie ${documentCategory}` : ''}.
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-seal-navy dark:text-white">
                Workflow à démarrer
              </label>
              <select
                className="mt-1 w-full rounded-md border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-seal-navy dark:text-white"
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.isDefault ? ' (défaut)' : ''}
                  </option>
                ))}
              </select>
              {selectedTemplate?.description && (
                <p className="mt-1 text-xs text-seal-gray-500 dark:text-slate-400">
                  {selectedTemplate.description}
                </p>
              )}
            </div>

            {selectedTemplate && selectedTemplate.steps.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-seal-navy dark:text-white">
                  Approbateurs par étape
                </p>
                {selectedTemplate.steps.map((step, stepIdx) => {
                  const stepDescriptions: Record<string, string> = {
                    SINGLE: 'Un seul approbateur doit valider cette etape.',
                    PARALLEL_ALL: 'Tous les approbateurs doivent valider pour passer a l\'etape suivante.',
                    PARALLEL_ANY: 'Un seul approbateur parmi le groupe suffit pour valider.',
                  };
                  const isLast = stepIdx === selectedTemplate.steps.length - 1;
                  return (
                    <div
                      key={step.id}
                      className="relative rounded-lg border border-gray-200 dark:border-slate-700 p-3"
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Step number indicator */}
                        <div className="flex flex-col items-center flex-shrink-0">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                            {step.order}
                          </div>
                          {!isLast && (
                            <div className="w-0.5 h-4 bg-gray-200 dark:bg-slate-700 mt-1" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-seal-navy dark:text-white">
                            {step.name}
                            {step.mode !== 'SINGLE' && (
                              <span className="ml-1 text-[10px] text-amber-600 font-medium">
                                ({step.mode === 'PARALLEL_ALL' ? 'Tous' : 'Un parmi'})
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 mt-0.5 leading-snug">
                            {stepDescriptions[step.mode] || stepDescriptions.SINGLE}
                            {step.slaHours ? ` Delai : ${step.slaHours}h.` : ''}
                          </p>
                          <select
                            className="mt-1.5 w-full rounded border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-seal-navy dark:text-white"
                            value={overrides[step.id] || ''}
                            onChange={(e) =>
                              setOverrides((prev) => ({
                                ...prev,
                                [step.id]: e.target.value,
                              }))
                            }
                          >
                            <option value="">
                              {step.approverUser
                                ? `(défaut) ${step.approverUser.firstName} ${step.approverUser.lastName}`
                                : step.approverRole
                                  ? `(défaut) rôle ${step.approverRole}`
                                  : '— Choisir un approbateur —'}
                            </option>
                            {userOptions.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.firstName} {u.lastName} — {u.email}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleStart}
              loading={starting}
              disabled={!selectedTemplate}
            >
              <PlayCircle className="h-4 w-4" />
              Démarrer le workflow
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function labelStatus(s: string): string {
  switch (s) {
    case 'PENDING':
      return 'En cours';
    case 'APPROVED':
      return 'Approuvé';
    case 'REJECTED':
      return 'Rejeté';
    case 'CANCELLED':
      return 'Annulé';
    default:
      return s;
  }
}

function statusVariant(s: string): any {
  switch (s) {
    case 'APPROVED':
      return 'success';
    case 'REJECTED':
      return 'error';
    case 'CANCELLED':
      return 'archived';
    default:
      return 'warning';
  }
}
