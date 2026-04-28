"use client";

/**
 * Wave D — Item 31 — Page user mémoire Noa.
 *
 * Liste les mémoires extraites par Ollama après chaque conversation.
 * - Toggle global noaMemoryEnabled (User.noaMemoryEnabled).
 * - Forget unitaire ou complet (RGPD article 17).
 * - Export JSON (RGPD article 15).
 *
 * UX :
 * - Pas d'admin cross-user (mémoire personnelle privée).
 * - Avertissement clair sur l'opt-out : Noa n'apprendra plus rien jusqu'à
 *   réactivation, mais l'historique existant reste consultable.
 *
 * Wave G : réactivée depuis worktree-agent-a5e0dc5966c26228f avec adaptation
 *  des types UI (Button primary, EmptyState icon LucideIcon).
 */

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Brain, Download, Trash2, AlertTriangle } from "lucide-react";
import { Button, Badge, Card, CardContent, EmptyState, Skeleton } from "@omnitech/ui";
import { PageHeader } from "@/components/layout/page-header";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";

interface MemoryItem {
  id: string;
  key: string;
  value: string;
  importanceScore: number;
  recallCount: number;
  createdAt: string;
}

interface ListResponse {
  data: MemoryItem[];
  total: number;
  page: number;
  limit: number;
}

export default function NoaMemoryPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const memoryEnabled = Boolean(user?.noaMemoryEnabled ?? true);

  const [items, setItems] = useState<MemoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingToggle, setSavingToggle] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ListResponse>("/noa/memory?page=1&limit=50");
      setItems(res.data.data);
      setTotal(res.data.total);
    } catch {
      toast.error("Impossible de charger la mémoire Noa");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleMemory = useCallback(async () => {
    if (!user || savingToggle) return;
    const next = !memoryEnabled;
    setSavingToggle(true);
    try {
      await api.patch("/users/me", { noaMemoryEnabled: next });
      setUser({ ...user, noaMemoryEnabled: next });
      toast.success(
        next
          ? "Mémoire Noa réactivée — Noa pourra à nouveau apprendre."
          : "Mémoire Noa désactivée — aucune nouvelle mémoire ne sera créée.",
      );
    } catch {
      toast.error("Impossible de modifier la préférence");
    } finally {
      setSavingToggle(false);
    }
  }, [user, memoryEnabled, savingToggle, setUser]);

  const forget = useCallback(
    async (id: string) => {
      try {
        await api.delete(`/noa/memory/${id}`);
        toast.success("Mémoire oubliée");
        await load();
      } catch {
        toast.error("Échec de la suppression");
      }
    },
    [load],
  );

  const forgetAll = useCallback(async () => {
    if (
      !window.confirm(
        "Tout oublier ? Cette action est irréversible : Noa redémarre à zéro pour vous.",
      )
    )
      return;
    try {
      const res = await api.delete<{ deleted: number }>("/noa/memory/all");
      toast.success(`${res.data.deleted} mémoire(s) supprimée(s)`);
      await load();
    } catch {
      toast.error("Échec de la suppression");
    }
  }, [load]);

  const exportJson = useCallback(async () => {
    try {
      const res = await api.get<Blob>("/noa/memory/export", {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "noa-memory-export.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export téléchargé");
    } catch {
      toast.error("Échec de l'export");
    }
  }, []);

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-slate-950 min-h-screen">
      <PageHeader
        title="Mémoire de Noa"
        subtitle="Faits que Noa a retenus de vos conversations pour personnaliser ses réponses."
        icon={Brain}
        hub="monEspace"
        actions={
          <div className="flex gap-2">
            <Button onClick={() => void exportJson()} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-1" /> Exporter (RGPD)
            </Button>
            <Button
              onClick={() => void forgetAll()}
              variant="outline"
              size="sm"
              className="text-red-600 border-red-300"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Tout oublier
            </Button>
          </div>
        }
      />

      {/* Toggle global */}
      <Card>
        <CardContent className="p-5 flex justify-between items-center gap-4">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Mémoire active
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {memoryEnabled
                ? "Noa apprend de vos échanges et utilise ces faits pour personnaliser ses réponses."
                : "Noa n'apprend rien de nouveau. Vos mémoires existantes restent consultables et exportables."}
            </p>
          </div>
          <Button
            onClick={() => void toggleMemory()}
            variant={memoryEnabled ? "outline" : "primary"}
            disabled={savingToggle}
          >
            {memoryEnabled ? "Désactiver" : "Activer"}
          </Button>
        </CardContent>
      </Card>

      {!memoryEnabled && (
        <Card className="border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="text-sm text-yellow-900 dark:text-yellow-200">
              La mémoire est désactivée — aucune nouvelle information ne sera
              extraite de vos prochaines conversations. Pour effacer
              définitivement, utilisez « Tout oublier » ci-dessus.
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Brain}
              title="Aucune mémoire pour l'instant"
              description="Continuez à discuter avec Noa pour qu'elle commence à mémoriser vos préférences."
            />
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-slate-800">
              {items.map((item) => (
                <li key={item.id} className="p-4">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-gray-500">
                          {item.key}
                        </span>
                        <Badge variant="navy">
                          Importance {(item.importanceScore * 100).toFixed(0)}%
                        </Badge>
                        {item.recallCount > 0 && (
                          <Badge variant="navy">
                            Rappelée {item.recallCount}×
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm">{item.value}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(item.createdAt).toLocaleString("fr-FR")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void forget(item.id)}
                      className="text-red-600"
                      title="Oublier ce fait"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {total > items.length && (
        <p className="text-sm text-gray-500 text-center">
          {items.length} sur {total} mémoires affichées.
        </p>
      )}
    </div>
  );
}
