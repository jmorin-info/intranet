'use client';

/**
 * Page admin — Détail d'un workflow d'approbation.
 * Permet d'éditer le nom/description/actif, de réordonner les étapes et d'en ajouter.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Button, Card, CardContent, Dialog } from '@omnitech/ui';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Save,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import { approvalRequestError } from '@/lib/approvals';
import { UserRole } from '@omnitech/shared';

type StepMode = 'SINGLE' | 'PARALLEL_ALL' | 'PARALLEL_ANY';

interface WorkflowStep {
  id: string;
  order: number;
  name: string;
  mode: StepMode;
  approverRole: string | null;
  approverUserId: string | null;
  approverDeptId: string | null;
  slaHours: number | null;
  escalateToUserId: string | null;
  autoApproveOnTimeout: boolean;
  approverUser?: { firstName: string; lastName: string } | null;
}

interface WorkflowDetail {
  id: string;
  name: string;
  description: string | null;
  documentCategory: string | null;
  isActive: boolean;
  isDefault: boolean;
  steps: WorkflowStep[];
  definitionLocked?: boolean;
  _count?: { instances: number };
}

const ROLES = [UserRole.COLLABORATEUR, UserRole.REVIEWER, UserRole.MANAGER,
  UserRole.DIRECTION, UserRole.ADMIN, UserRole.SUPER_ADMIN];

const MODE_LABELS: Record<StepMode, string> = {
  SINGLE: 'Un seul approbateur',
  PARALLEL_ALL: 'Tous en parallèle (unanimité)',
  PARALLEL_ANY: 'Parallèle — premier valide',
};

export default function WorkflowDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [wf, setWf] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [stepSaving, setStepSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const locked = wf?.definitionLocked === true || (wf?._count?.instances ?? 0) > 0;

  // Form state for header edit
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);

  // Step dialog
  const [stepDialogOpen, setStepDialogOpen] = useState(false);
  const [stepForm, setStepForm] = useState({
    name: '',
    mode: 'SINGLE' as StepMode,
    approverRole: '',
    approverUserId: '',
    slaHours: '',
    escalateToUserId: '',
    autoApproveOnTimeout: false,
  });

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await api.get<WorkflowDetail>(`/approval-workflows/${id}`);
      setWf(data);
      setName(data.name);
      setDescription(data.description ?? '');
      setIsActive(data.isActive);
      setIsDefault(data.isDefault);
    } catch (err) {
      setLoadError(approvalRequestError(err, 'Impossible de charger le circuit. Réessayez dans un instant.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaveHeader = async () => {
    if (!name.trim()) { toast.error('Le nom du circuit est obligatoire.'); return; }
    setSaving(true);
    try {
      await api.patch(`/approval-workflows/${id}`, {
        ...(!locked ? { name: name.trim(), description: description.trim() || null } : {}),
        isActive,
        isDefault,
      });
      toast.success('Workflow mis à jour');
      await load();
    } catch (err: unknown) {
      toast.error(approvalRequestError(err, 'Impossible d’enregistrer le circuit.'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddStep = async () => {
    if (locked || stepSaving) return;
    if (!stepForm.name.trim()) {
      toast.error('Le nom de l\'étape est obligatoire');
      return;
    }
    if (!stepForm.approverRole && !stepForm.approverUserId) {
      toast.error('Définir au moins un approbateur (rôle ou utilisateur)');
      return;
    }
    if (stepForm.slaHours && (!Number.isInteger(Number(stepForm.slaHours)) || Number(stepForm.slaHours) < 1 || Number(stepForm.slaHours) > 8760)) {
      toast.error('Le délai doit être un nombre entier entre 1 et 8 760 heures.');
      return;
    }
    setStepSaving(true);
    try {
      await api.post(`/approval-workflows/${id}/steps`, {
        name: stepForm.name.trim(),
        mode: stepForm.mode,
        approverRole: stepForm.approverRole || null,
        approverUserId: stepForm.approverUserId || null,
        slaHours: stepForm.slaHours ? Number(stepForm.slaHours) : null,
        escalateToUserId: stepForm.escalateToUserId || null,
        autoApproveOnTimeout: false,
      });
      toast.success('Étape ajoutée');
      setStepDialogOpen(false);
      setStepForm({
        name: '',
        mode: 'SINGLE',
        approverRole: '',
        approverUserId: '',
        slaHours: '',
        escalateToUserId: '',
        autoApproveOnTimeout: false,
      });
      await load();
    } catch (err: unknown) {
      toast.error(approvalRequestError(err, 'Impossible d’ajouter cette étape.'));
    } finally { setStepSaving(false); }
  };

  const handleRemoveStep = async (stepId: string) => {
    if (locked) return;
    if (!confirm('Supprimer cette étape ?')) return;
    try {
      await api.delete(`/approval-workflows/steps/${stepId}`);
      toast.success('Étape supprimée');
      await load();
    } catch (err: unknown) {
      toast.error(approvalRequestError(err, 'Impossible de supprimer cette étape.'));
    }
  };

  const handleMove = async (index: number, direction: -1 | 1) => {
    if (!wf || locked) return;
    const newSteps = [...wf.steps];
    const target = index + direction;
    if (target < 0 || target >= newSteps.length) return;
    const a = newSteps[index]!;
    const b = newSteps[target]!;
    newSteps[index] = b;
    newSteps[target] = a;
    try {
      await api.post(`/approval-workflows/${id}/steps/reorder`, {
        orderedStepIds: newSteps.map((s) => s.id),
      });
      await load();
    } catch (err: unknown) {
      toast.error(approvalRequestError(err, 'Impossible de réordonner les étapes.'));
    }
  };

  const handleDuplicate = async () => {
    if (duplicating) return;
    setDuplicating(true);
    try {
      const { data } = await api.post<{ id: string }>(`/approval-workflows/${id}/duplicate`);
      toast.success('Copie créée et désactivée. Vérifiez ses étapes avant de l’activer.');
      router.push(`/admin/workflows/${encodeURIComponent(data.id)}`);
    } catch (err: unknown) { toast.error(approvalRequestError(err, 'Impossible de dupliquer le circuit.')); }
    finally { setDuplicating(false); }
  };

  if (loadError) return <div className="space-y-4 p-6"><Link href="/admin/workflows" className="text-seal-blue underline">Retour aux circuits</Link>
    <p role="alert" className="text-red-700 dark:text-red-300">{loadError}</p><Button onClick={() => void load()}>Réessayer</Button></div>;

  if (loading || !wf) {
    return (
      <div className="p-6 text-gray-500 dark:text-gray-400">Chargement…</div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Link
        href="/admin/workflows"
        className="inline-flex items-center text-sm text-seal-blue hover:underline"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Retour à la liste
      </Link>

      {locked && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-seal-navy dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
        <p className="font-semibold">Ce circuit a déjà été utilisé : ses étapes sont protégées.</p>
        <p className="mt-1">Dupliquez-le pour modifier le parcours des prochaines demandes. L’historique et les demandes existantes restent rattachés à leur circuit d’origine.</p>
        <Button className="mt-3" variant="outline" onClick={() => void handleDuplicate()} loading={duplicating}>Dupliquer le circuit</Button>
      </div>}

      <Card>
        <CardContent className="p-6 space-y-4">
          <h1 className="text-xl font-bold text-seal-navy dark:text-white">
            Configuration du circuit d’approbation
          </h1>
          <div>
            <label className="block text-sm font-medium text-seal-navy dark:text-white mb-1">
              Nom
            </label>
            <input
              type="text"
              className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              value={name}
              disabled={locked}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-seal-navy dark:text-white mb-1">
              Description
            </label>
            <textarea
              className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
              rows={2}
              value={description}
              disabled={locked}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-seal-navy dark:text-white">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              Actif
            </label>
            <label className="flex items-center gap-2 text-sm text-seal-navy dark:text-white">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              Workflow par défaut pour cette catégorie
            </label>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {!locked && <Button variant="outline" onClick={() => void handleDuplicate()} loading={duplicating}>Dupliquer</Button>}
            <Button onClick={handleSaveHeader} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-seal-navy dark:text-white">
              Étapes du workflow
            </h2>
            <Button disabled={locked} onClick={() => setStepDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Ajouter une étape
            </Button>
          </div>

          {wf.steps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 animate-fade-in-up">
              <div className="rounded-2xl p-5 mb-4 bg-gray-100 dark:bg-slate-800 ring-1 ring-black/5 dark:ring-white/5">
                <Plus className="h-8 w-8 text-seal-gray-500/40" />
              </div>
              <p className="text-sm font-medium text-seal-navy dark:text-white mb-1">
                Aucune étape définie
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 text-center max-w-xs">
                Ajoutez une première étape pour activer ce workflow d&apos;approbation.
              </p>
              <Button disabled={locked} onClick={() => setStepDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Ajouter une première étape
              </Button>
            </div>
          ) : (
            <ol className="space-y-2">
              {wf.steps.map((step, idx) => (
                <li
                  key={step.id}
                  className="flex items-start gap-3 p-3 border rounded dark:border-gray-700"
                >
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => handleMove(idx, -1)}
                      disabled={locked || idx === 0}
                      className="p-1 disabled:opacity-30 text-gray-600 dark:text-gray-300"
                      aria-label="Monter"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(idx, 1)}
                      disabled={locked || idx === wf.steps.length - 1}
                      className="p-1 disabled:opacity-30 text-gray-600 dark:text-gray-300"
                      aria-label="Descendre"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-seal-navy dark:text-white">
                      {step.order}. {step.name}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 space-x-2">
                      <span>{MODE_LABELS[step.mode]}</span>
                      {step.approverRole && <span>· Rôle : {step.approverRole}</span>}
                      {step.approverUser && (
                        <span>
                          · {step.approverUser.firstName} {step.approverUser.lastName}
                        </span>
                      )}
                      {step.slaHours != null && (
                        <span>· Délai de traitement : {step.slaHours} h</span>
                      )}
                      {step.autoApproveOnTimeout && (
                        <span>· Ancienne option d’auto-approbation : décision humaine requise</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveStep(step.id)}
                    disabled={locked}
                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {stepDialogOpen && (
        <Dialog
          open={stepDialogOpen}
          onClose={() => setStepDialogOpen(false)}
          title="Ajouter une étape"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-seal-navy dark:text-white mb-1">
                Nom de l'étape *
              </label>
              <input
                type="text"
                className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                value={stepForm.name}
                onChange={(e) =>
                  setStepForm({ ...stepForm, name: e.target.value })
                }
                placeholder="Relecture juridique"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-seal-navy dark:text-white mb-1">
                Mode
              </label>
              <select
                className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                value={stepForm.mode}
                onChange={(e) =>
                  setStepForm({ ...stepForm, mode: e.target.value as StepMode })
                }
              >
                {(Object.keys(MODE_LABELS) as StepMode[]).map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-seal-navy dark:text-white mb-1">
                  Rôle approbateur
                </label>
                <select
                  className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                  value={stepForm.approverRole}
                  onChange={(e) =>
                    setStepForm({ ...stepForm, approverRole: e.target.value })
                  }
                >
                  <option value="">— Aucun —</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-seal-navy dark:text-white mb-1">
                  OU UserId explicite
                </label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                  value={stepForm.approverUserId}
                  onChange={(e) =>
                    setStepForm({ ...stepForm, approverUserId: e.target.value })
                  }
                  placeholder="uuid"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-seal-navy dark:text-white mb-1">
                  SLA (heures)
                </label>
                <input
                  type="number"
                  className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                  value={stepForm.slaHours}
                  onChange={(e) =>
                    setStepForm({ ...stepForm, slaHours: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-seal-navy dark:text-white mb-1">
                  Escalade vers (userId)
                </label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                  value={stepForm.escalateToUserId}
                  onChange={(e) =>
                    setStepForm({
                      ...stepForm,
                      escalateToUserId: e.target.value,
                    })
                  }
                />
              </div>
            </div>
            <p className="rounded-lg bg-blue-50 p-3 text-sm text-seal-navy dark:bg-blue-950/40 dark:text-blue-100">Le délai commence à l’ouverture de l’étape. Une échéance dépassée peut déclencher une relance ou une escalade ; la décision reste humaine.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setStepDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleAddStep} loading={stepSaving} disabled={locked}>Ajouter l’étape</Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
