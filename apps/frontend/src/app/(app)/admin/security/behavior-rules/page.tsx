"use client";

/**
 * Wave D — Item 28 — Page admin règles UEBA.
 *
 * SUPER_ADMIN seulement (la modification d'une règle a un impact direct sur
 * la sensibilité du système). Toggle enabled, ajustement des seuils, vue de
 * la sévérité.
 */

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Sliders, Save } from "lucide-react";
import { Button, Badge, Card, CardContent, Skeleton } from "@omnitech/ui";
import { UserRole } from "@omnitech/shared";
import { PageHeader } from "@/components/layout/page-header";
import { RoleGuard } from "@/components/role-guard";
import { api } from "@/lib/api";

interface RuleItem {
  id: string;
  code: string;
  name: string;
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  enabled: boolean;
  threshold: Record<string, unknown>;
}

const SEVERITY_COLORS: Record<RuleItem["severity"], string> = {
  CRITICAL: "bg-red-600 text-white",
  HIGH: "bg-orange-500 text-white",
  MEDIUM: "bg-yellow-500 text-black",
  LOW: "bg-blue-400 text-white",
};

export default function BehaviorRulesPage() {
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftThreshold, setDraftThreshold] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<RuleItem[]>("/admin/behavior-rules");
      setRules(res.data);
    } catch {
      toast.error("Impossible de charger les règles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(
    async (rule: RuleItem) => {
      try {
        await api.patch(`/admin/behavior-rules/${rule.code}`, {
          enabled: !rule.enabled,
        });
        toast.success(`Règle ${rule.code} ${!rule.enabled ? "activée" : "désactivée"}`);
        await load();
      } catch {
        toast.error("Toggle refusé (SUPER_ADMIN requis)");
      }
    },
    [load],
  );

  const startEdit = useCallback((rule: RuleItem) => {
    setEditing(rule.code);
    setDraftThreshold(JSON.stringify(rule.threshold, null, 2));
  }, []);

  const saveThreshold = useCallback(
    async (code: string) => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(draftThreshold);
      } catch {
        toast.error("JSON invalide");
        return;
      }
      setSaving(true);
      try {
        await api.patch(`/admin/behavior-rules/${code}`, { threshold: parsed });
        toast.success("Seuils mis à jour");
        setEditing(null);
        await load();
      } catch {
        toast.error("Échec (SUPER_ADMIN requis)");
      } finally {
        setSaving(false);
      }
    },
    [draftThreshold, load],
  );

  return (
    <RoleGuard minRole={UserRole.ADMIN}>
      <div className="p-6 space-y-6 bg-gray-50 dark:bg-slate-950 min-h-screen">
        <PageHeader
          title="Règles UEBA"
          subtitle="Toggle / ajustement des règles R001..R008. Modification = SUPER_ADMIN."
          icon={Sliders}
          hub="rssi"
        />

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {rules.map((rule) => (
              <Card key={rule.id}>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-mono text-sm text-gray-500">
                          {rule.code}
                        </span>
                        <Badge className={SEVERITY_COLORS[rule.severity]}>
                          {rule.severity}
                        </Badge>
                        <Badge variant={rule.enabled ? "default" : "outline"}>
                          {rule.enabled ? "Activée" : "Désactivée"}
                        </Badge>
                      </div>
                      <h3 className="font-semibold">{rule.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {rule.description}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <Button
                        size="sm"
                        variant={rule.enabled ? "outline" : "default"}
                        onClick={() => void toggle(rule)}
                      >
                        {rule.enabled ? "Désactiver" : "Activer"}
                      </Button>
                      {editing !== rule.code ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(rule)}
                        >
                          Éditer seuils
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {editing === rule.code ? (
                    <div className="mt-4 space-y-2">
                      <label className="text-xs text-gray-500">
                        Threshold JSON
                      </label>
                      <textarea
                        value={draftThreshold}
                        onChange={(e) => setDraftThreshold(e.target.value)}
                        className="w-full h-40 font-mono text-xs p-2 border rounded bg-gray-50 dark:bg-slate-800"
                      />
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing(null)}
                          disabled={saving}
                        >
                          Annuler
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => void saveThreshold(rule.code)}
                          disabled={saving}
                        >
                          <Save className="h-4 w-4 mr-1" />
                          {saving ? "Enregistrement…" : "Enregistrer"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <details className="mt-3">
                      <summary className="text-xs text-gray-500 cursor-pointer">
                        Voir les seuils actuels
                      </summary>
                      <pre className="mt-2 bg-gray-100 dark:bg-slate-800 p-3 rounded text-xs overflow-auto">
                        {JSON.stringify(rule.threshold, null, 2)}
                      </pre>
                    </details>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
