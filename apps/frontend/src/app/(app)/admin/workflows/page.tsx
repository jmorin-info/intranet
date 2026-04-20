'use client';

/**
 * Page admin — Liste des workflows d'approbation configurables (ISO 27001 A.5.1).
 * Scaffold : permet de lister, créer et naviguer vers le détail d'un workflow.
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Button, Card, CardContent, Dialog, Skeleton, EmptyState } from '@omnitech/ui';
import { Plus, Workflow as WorkflowIcon, CheckCircle2, Circle, RefreshCw, Sparkles } from 'lucide-react';
import { AdminGroupTabs } from '@/components/layout/admin-group-tabs';
import { PageHeader } from '@/components/layout/page-header';
import { useTranslation } from '@/lib/i18n';

type DocumentCategory =
  | 'POLICY'
  | 'PROCEDURE'
  | 'PLAN'
  | 'RECORD'
  | 'FORM'
  | 'GUIDE'
  | 'REPORT'
  | 'CONTRACT'
  | 'OTHER';

interface ApprovalWorkflow {
  id: string;
  name: string;
  description: string | null;
  documentCategory: DocumentCategory | null;
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  steps: Array<{ id: string; order: number; name: string }>;
  _count?: { instances: number };
}

const CATEGORY_LABELS: Record<DocumentCategory | 'ALL', string> = {
  ALL: 'Toutes catégories',
  POLICY: 'Politique',
  PROCEDURE: 'Procédure',
  PLAN: 'Plan',
  RECORD: 'Enregistrement',
  FORM: 'Formulaire',
  GUIDE: 'Guide',
  REPORT: 'Rapport',
  CONTRACT: 'Contrat',
  OTHER: 'Autre',
};

export default function WorkflowsAdminPage() {
  const { t } = useTranslation();
  const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    documentCategory: '' as DocumentCategory | '',
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ApprovalWorkflow[]>('/approval-workflows');
      setWorkflows(data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Impossible de charger les workflows');
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error('Le nom est obligatoire');
      return;
    }
    setSaving(true);
    try {
      await api.post('/approval-workflows', {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        documentCategory: form.documentCategory || null,
      });
      toast.success('Workflow créé');
      setDialogOpen(false);
      setForm({ name: '', description: '', documentCategory: '' });
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <AdminGroupTabs group="compliance" />
      <PageHeader
        title="Workflows d'approbation"
        subtitle={t('admin.workflows.subtitle')}
        icon={WorkflowIcon}
        hub="admin"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const { data } = await api.post('/approval-workflows/seed-presets');
                  if (data.created?.length > 0) {
                    toast.success(`${data.created.length} workflow(s) prédéfini(s) ajouté(s)`);
                    void load();
                  } else {
                    toast.info('Tous les presets sont déjà en place');
                  }
                } catch {
                  toast.error('Échec du chargement des presets');
                }
              }}
            >
              <Sparkles className="h-4 w-4" />
              Charger les presets
            </Button>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Rafraîchir
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nouveau workflow
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : workflows.length === 0 ? (
        <EmptyState
          type="general"
          title="Aucun workflow configuré"
          description="Créez un workflow d'approbation pour valider les documents selon vos règles internes."
        />
      ) : (
      <Card>
        <CardContent className="p-0">
          {(
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700">
                  <th className="sticky top-0 bg-white dark:bg-slate-900 z-10 p-3 text-left text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">Nom</th>
                  <th className="sticky top-0 bg-white dark:bg-slate-900 z-10 p-3 text-left text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">Catégorie</th>
                  <th className="sticky top-0 bg-white dark:bg-slate-900 z-10 p-3 text-left text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">Étapes</th>
                  <th className="sticky top-0 bg-white dark:bg-slate-900 z-10 p-3 text-left text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">Instances</th>
                  <th className="sticky top-0 bg-white dark:bg-slate-900 z-10 p-3 text-left text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">Défaut</th>
                  <th className="sticky top-0 bg-white dark:bg-slate-900 z-10 p-3 text-left text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">Actif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {workflows.map((wf) => (
                  <tr
                    key={wf.id}
                    className="even:bg-gray-50/50 dark:even:bg-slate-800/30 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="p-3">
                      <Link
                        href={`/admin/workflows/${wf.id}`}
                        className="text-primary hover:underline font-medium"
                      >
                        {wf.name}
                      </Link>
                      {wf.description ? (
                        <div className="text-xs text-seal-gray-500 dark:text-slate-400">
                          {wf.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-3 text-seal-navy dark:text-slate-200">
                      {CATEGORY_LABELS[wf.documentCategory ?? 'ALL']}
                    </td>
                    <td className="p-3 text-seal-navy dark:text-slate-200">
                      <span>{wf.steps.length}</span>
                      {wf.steps.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {wf.steps
                            .sort((a, b) => a.order - b.order)
                            .map((step, idx) => (
                              <span key={step.id} className="inline-flex items-center text-[10px]">
                                <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300 font-medium">
                                  {step.name}
                                </span>
                                {idx < wf.steps.length - 1 && (
                                  <span className="mx-0.5 text-seal-gray-500 dark:text-slate-500">→</span>
                                )}
                              </span>
                            ))}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-seal-navy dark:text-slate-200">
                      {wf._count?.instances ?? 0}
                    </td>
                    <td className="p-3">
                      {wf.isDefault ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Circle className="w-4 h-4 text-gray-300 dark:text-slate-600" />
                      )}
                    </td>
                    <td className="p-3">
                      {wf.isActive ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs">
                          Actif
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-slate-300 text-xs">
                          Inactif
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      )}

      {dialogOpen && (
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Nouveau workflow"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-seal-navy dark:text-white mb-1">
                Nom *
              </label>
              <input
                type="text"
                className="w-full border rounded px-3 py-2 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Validation politiques RSSI"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-seal-navy dark:text-white mb-1">
                Description
              </label>
              <textarea
                className="w-full border rounded px-3 py-2 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-seal-navy dark:text-white mb-1">
                Catégorie de document
              </label>
              <select
                className="w-full border rounded px-3 py-2 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                value={form.documentCategory}
                onChange={(e) =>
                  setForm({
                    ...form,
                    documentCategory: e.target.value as DocumentCategory | '',
                  })
                }
              >
                <option value="">Toutes catégories</option>
                {(Object.keys(CATEGORY_LABELS) as Array<DocumentCategory | 'ALL'>)
                  .filter((k) => k !== 'ALL')
                  .map((k) => (
                    <option key={k} value={k}>
                      {CATEGORY_LABELS[k]}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? 'Création…' : 'Créer'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
