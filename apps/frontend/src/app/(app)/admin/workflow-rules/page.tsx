"use client";

/**
 * Page admin — Règles d'approbation N+1 dynamiques (ISO 27001 A.5.1).
 * Permet de :
 *  - Lister les règles existantes (priorité ↑, isActive en évidence)
 *  - Créer une nouvelle règle (modale form : nom, priorité, condition, steps)
 *  - Désactiver / supprimer une règle (PATCH / DELETE)
 *  - Tester la règle qui matcherait pour un contexte donné (dry-run)
 */

import React, { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import {
  Button,
  Card,
  CardContent,
  Dialog,
  Input,
  Select,
  Skeleton,
  EmptyState,
  Badge,
} from "@omnitech/ui";
import {
  Plus,
  GitBranch,
  RefreshCw,
  Trash2,
  Beaker,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

interface WorkflowRule {
  id: string;
  name: string;
  priority: number;
  isActive: boolean;
  condition: Record<string, unknown>;
  steps: Array<{
    level: number;
    name?: string;
    approverRole?: string;
    approverUserId?: string;
    approverDeptId?: string;
    deadlineHours?: number;
    parallel?: boolean;
  }>;
  createdAt: string;
}

const ROLE_OPTIONS = [
  { value: "REVIEWER", label: "Reviewer" },
  { value: "MANAGER", label: "Manager" },
  { value: "ADMIN", label: "Admin" },
  { value: "SUPER_ADMIN", label: "Super admin" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "Toutes catégories" },
  { value: "POLICY", label: "Politique" },
  { value: "PROCEDURE", label: "Procédure" },
  { value: "PLAN", label: "Plan" },
  { value: "RECORD", label: "Enregistrement" },
  { value: "FORM", label: "Formulaire" },
  { value: "GUIDE", label: "Guide" },
  { value: "REPORT", label: "Rapport" },
  { value: "CONTRACT", label: "Contrat" },
  { value: "OTHER", label: "Autre" },
];

const CLASSIFICATION_OPTIONS = [
  { value: "", label: "Toutes classifications" },
  { value: "PUBLIC", label: "Public" },
  { value: "INTERNE", label: "Interne" },
  { value: "CONFIDENTIEL", label: "Confidentiel" },
  { value: "SECRET", label: "Secret" },
];

interface RuleStepForm {
  level: number;
  approverRole: string;
  deadlineHours: number;
}

export default function WorkflowRulesAdminPage() {
  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [evalOpen, setEvalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [evalResult, setEvalResult] = useState<unknown>(null);

  const [form, setForm] = useState({
    name: "",
    priority: 100,
    classification: "",
    category: "",
    departmentId: "",
    minAmount: 0,
    steps: [
      { level: 1, approverRole: "REVIEWER", deadlineHours: 72 },
    ] as RuleStepForm[],
  });

  const [evalForm, setEvalForm] = useState({
    classification: "",
    category: "",
    departmentId: "",
    amount: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<WorkflowRule[]>("/workflow-rules");
      setRules(data);
    } catch (err) {
      const e = err as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      toast.error(
        e?.response?.data?.message ??
          e?.message ??
          "Impossible de charger les règles",
      );
      logger.error(err as Error, {
        page: "admin/workflow-rules",
        context: "load",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () =>
    setForm({
      name: "",
      priority: 100,
      classification: "",
      category: "",
      departmentId: "",
      minAmount: 0,
      steps: [{ level: 1, approverRole: "REVIEWER", deadlineHours: 72 }],
    });

  const addStep = () =>
    setForm((f) => ({
      ...f,
      steps: [
        ...f.steps,
        {
          level: f.steps.length + 1,
          approverRole: "ADMIN",
          deadlineHours: 72,
        },
      ],
    }));

  const removeStep = (idx: number) =>
    setForm((f) => ({ ...f, steps: f.steps.filter((_, i) => i !== idx) }));

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error("Le nom est obligatoire");
      return;
    }
    if (form.steps.length === 0) {
      toast.error("Au moins un palier est requis");
      return;
    }
    setSaving(true);
    try {
      const condition: Record<string, unknown> = {};
      if (form.classification) condition.classification = form.classification;
      if (form.category) condition.category = form.category;
      if (form.departmentId.trim()) {
        const ids = form.departmentId
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (ids.length === 1) condition.departmentId = ids[0];
        else if (ids.length > 1) condition.departmentId = ids;
      }
      if (form.minAmount > 0) condition.minAmount = form.minAmount;

      await api.post("/workflow-rules", {
        name: form.name.trim(),
        priority: form.priority,
        condition,
        steps: form.steps.map((s) => ({
          level: s.level,
          approverRole: s.approverRole,
          deadlineHours: s.deadlineHours,
        })),
      });
      toast.success("Règle créée");
      setDialogOpen(false);
      resetForm();
      await load();
    } catch (err) {
      const e = err as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      toast.error(
        e?.response?.data?.message ?? e?.message ?? "Erreur création",
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (rule: WorkflowRule) => {
    try {
      await api.patch(`/workflow-rules/${rule.id}`, {
        isActive: !rule.isActive,
      });
      toast.success(rule.isActive ? "Règle désactivée" : "Règle activée");
      await load();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message ?? "Erreur de mise à jour");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer définitivement cette règle ?")) return;
    try {
      await api.delete(`/workflow-rules/${id}`);
      toast.success("Règle supprimée");
      await load();
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message ?? "Erreur suppression");
    }
  };

  const runEvaluate = async () => {
    try {
      const { data } = await api.post("/workflow-rules/evaluate", {
        classification: evalForm.classification || undefined,
        category: evalForm.category || undefined,
        departmentId: evalForm.departmentId.trim() || undefined,
        amount: evalForm.amount || undefined,
      });
      setEvalResult(data);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message ?? "Erreur évaluation");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Règles d'approbation N+1"
        subtitle="Routage dynamique des documents selon catégorie, classification, département et seuil"
        icon={GitBranch}
        hub="admin"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEvalResult(null);
                setEvalOpen(true);
              }}
            >
              <Beaker className="h-4 w-4 mr-2" />
              Tester
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Nouvelle règle
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
      ) : rules.length === 0 ? (
        <EmptyState
          type="general"
          title="Aucune règle configurée"
          description="Créez une règle pour router automatiquement les documents vers les bons approbateurs selon leur catégorie, classification ou département."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700">
                  <th className="p-3 text-left text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">
                    Priorité
                  </th>
                  <th className="p-3 text-left text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">
                    Nom
                  </th>
                  <th className="p-3 text-left text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">
                    Condition
                  </th>
                  <th className="p-3 text-left text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">
                    Paliers
                  </th>
                  <th className="p-3 text-left text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">
                    Statut
                  </th>
                  <th className="p-3 text-right text-[10px] uppercase tracking-widest font-medium text-seal-gray-500 dark:text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {rules.map((rule) => (
                  <tr
                    key={rule.id}
                    className="even:bg-gray-50/50 dark:even:bg-slate-800/30 hover:bg-gray-50 dark:hover:bg-slate-800/50"
                  >
                    <td className="p-3 font-mono text-xs">{rule.priority}</td>
                    <td className="p-3 font-medium">{rule.name}</td>
                    <td className="p-3 text-xs text-seal-gray-500 dark:text-slate-400 max-w-xs truncate">
                      {Object.keys(rule.condition).length === 0
                        ? "— toutes —"
                        : Object.entries(rule.condition)
                            .map(
                              ([k, v]) =>
                                `${k}=${Array.isArray(v) ? v.join("|") : String(v)}`,
                            )
                            .join(", ")}
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary">
                        {rule.steps?.length ?? 0}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {rule.isActive ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 text-xs">
                          <CheckCircle2 className="h-3 w-3" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500 text-xs">
                          <XCircle className="h-3 w-3" /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right space-x-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void toggleActive(rule)}
                      >
                        {rule.isActive ? "Désactiver" : "Activer"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void remove(rule.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ----- Dialog : Nouvelle règle ----- */}
      <Dialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          resetForm();
        }}
        title="Nouvelle règle d'approbation"
        description="Définissez le contexte (condition) et les paliers d'approbation à instancier."
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <Input
            label="Nom de la règle"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="ex. Politique CONFIDENTIEL → RSSI"
          />
          <Input
            type="number"
            label="Priorité (plus petit = prioritaire)"
            value={form.priority}
            onChange={(e) =>
              setForm({ ...form, priority: Number(e.target.value) || 100 })
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Classification"
              options={CLASSIFICATION_OPTIONS}
              value={form.classification}
              onChange={(e) =>
                setForm({ ...form, classification: e.target.value })
              }
            />
            <Select
              label="Catégorie"
              options={CATEGORY_OPTIONS}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </div>
          <Input
            label="Département(s) (UUID, virgules)"
            value={form.departmentId}
            onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
            placeholder="(optionnel)"
          />
          <Input
            type="number"
            label="Montant minimum (optionnel)"
            value={form.minAmount}
            onChange={(e) =>
              setForm({ ...form, minAmount: Number(e.target.value) || 0 })
            }
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-seal-navy dark:text-white">
                Paliers d&apos;approbation
              </span>
              <Button variant="outline" size="sm" onClick={addStep}>
                <Plus className="h-3 w-3 mr-1" /> Ajouter
              </Button>
            </div>
            {form.steps.map((step, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 items-end p-2 border border-gray-200 dark:border-slate-700 rounded-md"
              >
                <Input
                  type="number"
                  label="Niveau"
                  value={step.level}
                  onChange={(e) => {
                    const next = [...form.steps];
                    next[idx] = {
                      ...next[idx]!,
                      level: Number(e.target.value) || 1,
                    };
                    setForm({ ...form, steps: next });
                  }}
                  className="col-span-3"
                />
                <Select
                  label="Rôle"
                  options={ROLE_OPTIONS}
                  value={step.approverRole}
                  onChange={(e) => {
                    const next = [...form.steps];
                    next[idx] = { ...next[idx]!, approverRole: e.target.value };
                    setForm({ ...form, steps: next });
                  }}
                  className="col-span-4"
                />
                <Input
                  type="number"
                  label="Délai (h)"
                  value={step.deadlineHours}
                  onChange={(e) => {
                    const next = [...form.steps];
                    next[idx] = {
                      ...next[idx]!,
                      deadlineHours: Number(e.target.value) || 72,
                    };
                    setForm({ ...form, steps: next });
                  }}
                  className="col-span-3"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => removeStep(idx)}
                  className="col-span-2"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setDialogOpen(false);
              resetForm();
            }}
          >
            Annuler
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Création…" : "Créer la règle"}
          </Button>
        </div>
      </Dialog>

      {/* ----- Dialog : Tester la règle ----- */}
      <Dialog
        open={evalOpen}
        onClose={() => setEvalOpen(false)}
        title="Tester une règle"
        description="Saisissez un contexte fictif — le moteur retournera la règle qui matcherait."
      >
        <div className="space-y-3">
          <Select
            label="Classification"
            options={CLASSIFICATION_OPTIONS}
            value={evalForm.classification}
            onChange={(e) =>
              setEvalForm({ ...evalForm, classification: e.target.value })
            }
          />
          <Select
            label="Catégorie"
            options={CATEGORY_OPTIONS}
            value={evalForm.category}
            onChange={(e) =>
              setEvalForm({ ...evalForm, category: e.target.value })
            }
          />
          <Input
            label="Département (UUID)"
            value={evalForm.departmentId}
            onChange={(e) =>
              setEvalForm({ ...evalForm, departmentId: e.target.value })
            }
          />
          <Input
            type="number"
            label="Montant"
            value={evalForm.amount}
            onChange={(e) =>
              setEvalForm({ ...evalForm, amount: Number(e.target.value) || 0 })
            }
          />
          <div className="flex justify-end">
            <Button onClick={() => void runEvaluate()}>Évaluer</Button>
          </div>
          {evalResult ? (
            <pre className="text-xs bg-slate-50 dark:bg-slate-800 p-3 rounded-md overflow-auto max-h-48">
              {JSON.stringify(evalResult, null, 2)}
            </pre>
          ) : null}
        </div>
      </Dialog>
    </div>
  );
}
