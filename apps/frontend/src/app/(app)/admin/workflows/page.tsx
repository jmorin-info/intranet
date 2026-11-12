"use client";

/**
 * Page admin — Liste des workflows d'approbation configurables (ISO 27001 A.5.1).
 * Scaffold : permet de lister, créer et naviguer vers le détail d'un workflow.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { Button, Card, CardContent, Dialog, Skeleton, EmptyState, SearchInput } from "@omnitech/ui";
import {
  Plus,
  Workflow as WorkflowIcon,
  CheckCircle2,
  Circle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { AdminGroupTabs } from "@/components/layout/admin-group-tabs";
import { PageHeader } from "@/components/layout/page-header";
import { DocumentCategory } from "@omnitech/shared";
import { approvalRequestError } from "@/lib/approvals";

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

const CATEGORY_KEYS: Array<DocumentCategory | "ALL"> = [
  "ALL",
  DocumentCategory.POLICY,
  DocumentCategory.PROCEDURE,
  DocumentCategory.PLAN,
  DocumentCategory.RECORD,
  DocumentCategory.FORM,
  DocumentCategory.GUIDE,
  DocumentCategory.REPORT,
  DocumentCategory.CONTRACT,
  DocumentCategory.OTHER,
];

export default function WorkflowsAdminPage() {
  const t = useTranslations("admin.workflowsPage");
  const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    documentCategory: "" as DocumentCategory | "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await api.get<ApprovalWorkflow[]>("/approval-workflows");
      setWorkflows(data);
    } catch (err: unknown) {
      setLoadError(approvalRequestError(err, t("errors.load")));
      logger.error(err, { page: "admin/workflows", context: "load" });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error(t("errors.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      await api.post("/approval-workflows", {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        documentCategory: form.documentCategory || null,
      });
      toast.success(t("toasts.created"));
      setDialogOpen(false);
      setForm({ name: "", description: "", documentCategory: "" });
      await load();
    } catch (err: unknown) {
      toast.error(approvalRequestError(err, t("errors.createFailed")));
    } finally {
      setSaving(false);
    }
  };

  const visible = useMemo(() => {
    const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
    const needle = normalize(query.trim());
    return workflows.filter((workflow) => (status === 'all' || workflow.isActive === (status === 'active'))
      && normalize([workflow.name, workflow.description, ...workflow.steps.map((step) => step.name)].filter(Boolean).join(' ')).includes(needle));
  }, [workflows, query, status]);

  return (
    <div className="p-6 space-y-6">
      <AdminGroupTabs group="compliance" />
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        icon={WorkflowIcon}
        hub="admin"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const { data } = await api.post("/approval-workflows/seed-presets");
                  if (data.created?.length > 0) {
                    toast.success(t("toasts.presetsAdded", { count: data.created.length }));
                    void load();
                  } else {
                    toast.info(t("toasts.presetsAlreadyInPlace"));
                  }
                } catch {
                  toast.error(t("errors.loadPresets"));
                }
              }}
            >
              <Sparkles className="h-4 w-4" />
              {t("actions.loadPresets")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {t("actions.refresh")}
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              {t("actions.newWorkflow")}
            </Button>
          </div>
        }
      />

      <p className="text-sm text-seal-gray-500 dark:text-slate-400">Un circuit définit les étapes de validation d’un document. Les étapes d’un circuit déjà utilisé sont protégées ; dupliquez-le pour faire évoluer le parcours.</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1"><label htmlFor="workflow-search" className="mb-1 block text-sm font-medium">Rechercher un circuit</label>
          <SearchInput id="workflow-search" value={query} onChange={setQuery} placeholder="Nom, description ou étape" /></div>
        <div><label htmlFor="workflow-status" className="mb-1 block text-sm font-medium">État du circuit</label>
          <select id="workflow-status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800">
            <option value="all">Tous les circuits</option><option value="active">Actifs</option><option value="inactive">Désactivés</option></select></div>
      </div>
      {loadError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{loadError} <button type="button" className="font-semibold underline" onClick={() => void load()}>Réessayer</button></div>}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : loadError && workflows.length === 0 ? null : workflows.length === 0 ? (
        <EmptyState type="general" title={t("empty.title")} description={t("empty.description")} />
      ) : visible.length === 0 ? (
        <EmptyState title="Aucun circuit ne correspond aux filtres" description="Modifiez la recherche ou l’état sélectionné." cta={{ label: 'Réinitialiser les filtres', onClick: () => { setQuery(''); setStatus('all'); } }} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            {
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700">
                    <th className="sticky top-0 bg-white dark:bg-slate-900 z-10 p-3 text-left text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">
                      {t("table.name")}
                    </th>
                    <th className="sticky top-0 bg-white dark:bg-slate-900 z-10 p-3 text-left text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">
                      {t("table.category")}
                    </th>
                    <th className="sticky top-0 bg-white dark:bg-slate-900 z-10 p-3 text-left text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">
                      {t("table.steps")}
                    </th>
                    <th className="sticky top-0 bg-white dark:bg-slate-900 z-10 p-3 text-left text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">
                      {t("table.instances")}
                    </th>
                    <th className="sticky top-0 bg-white dark:bg-slate-900 z-10 p-3 text-left text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">
                      {t("table.default")}
                    </th>
                    <th className="sticky top-0 bg-white dark:bg-slate-900 z-10 p-3 text-left text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">
                      {t("table.active")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {visible.map((wf) => (
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
                        {t(`categories.${wf.documentCategory ?? "ALL"}`)}
                      </td>
                      <td className="p-3 text-seal-navy dark:text-slate-200">
                        <span>{wf.steps.length}</span>
                        {wf.steps.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {[...wf.steps]
                              .sort((a, b) => a.order - b.order)
                              .map((step, idx) => (
                                <span
                                  key={step.id}
                                  className="inline-flex items-center text-[10px]"
                                >
                                  <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-seal-gray-500 dark:text-slate-300 font-medium">
                                    {step.name}
                                  </span>
                                  {idx < wf.steps.length - 1 && (
                                    <span className="mx-0.5 text-seal-gray-500 dark:text-slate-500">
                                      →
                                    </span>
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
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-label="Circuit par défaut" />
                        ) : (
                          <Circle className="w-4 h-4 text-gray-400 dark:text-slate-500" aria-label="Circuit non défini par défaut" />
                        )}
                      </td>
                      <td className="p-3">
                        {wf.isActive ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs">
                            {t("status.active")}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-slate-300 text-xs">
                            {t("status.inactive")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          </CardContent>
        </Card>
      )}

      {dialogOpen && (
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={t("dialog.title")}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-seal-navy dark:text-white mb-1">
                {t("dialog.nameLabel")}
              </label>
              <input
                type="text"
                className="w-full border rounded px-3 py-2 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t("dialog.namePlaceholder")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-seal-navy dark:text-white mb-1">
                {t("dialog.descriptionLabel")}
              </label>
              <textarea
                className="w-full border rounded px-3 py-2 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-seal-navy dark:text-white mb-1">
                {t("dialog.categoryLabel")}
              </label>
              <select
                className="w-full border rounded px-3 py-2 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                value={form.documentCategory}
                onChange={(e) =>
                  setForm({
                    ...form,
                    documentCategory: e.target.value as DocumentCategory | "",
                  })
                }
              >
                <option value="">{t("categories.ALL")}</option>
                {CATEGORY_KEYS.filter((k) => k !== "ALL").map((k) => (
                  <option key={k} value={k}>
                    {t(`categories.${k}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {t("dialog.cancel")}
              </Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? t("dialog.creating") : t("dialog.create")}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
