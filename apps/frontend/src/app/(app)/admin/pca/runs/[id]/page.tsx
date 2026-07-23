"use client";

/**
 * Page détail d'un run PCA — /admin/pca/runs/[id]
 *
 * Affiche le statut (polling 2s tant que RUNNING), une timeline start/end,
 * les logs terminal-style et des boutons rapides (relancer, télécharger le
 * rapport JSON).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatDate as formatDateUtil } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, Download, Loader2, Play, ShieldCheck, Terminal } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { RoleGuard } from "@/components/role-guard";
import { UserRole } from "@omnitech/shared";
import { Badge, Button, Card, CardContent, EmptyState } from "@omnitech/ui";

type RunStatus = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";

interface PcaRunDetail {
  id: string;
  scenarioId: string;
  scenarioName: string;
  scenarioDescription: string | null;
  scenarioIso: string | null;
  status: RunStatus;
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
  result: Record<string, unknown> | null;
  logs: string | null;
  triggeredBy: string;
  triggeredByUser?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
}

const STATUS_CLASSES: Record<RunStatus, string> = {
  PENDING: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  RUNNING: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  SUCCESS: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  CANCELLED: "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300",
};

const STATUS_LABELS: Record<RunStatus, string> = {
  PENDING: "En attente",
  RUNNING: "En cours",
  SUCCESS: "Succès",
  FAILED: "Échec",
  CANCELLED: "Annulé",
};

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)} s`;
  const min = Math.floor(sec / 60);
  const rem = Math.round(sec - min * 60);
  return `${min} min ${rem} s`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return formatDateUtil(iso, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function PcaRunDetailPage() {
  return (
    <RoleGuard minRole={UserRole.SUPER_ADMIN}>
      <PcaRunDetailInner />
    </RoleGuard>
  );
}

function PcaRunDetailInner() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [run, setRun] = useState<PcaRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [rerunning, setRerunning] = useState(false);
  const logsRef = useRef<HTMLPreElement>(null);

  const loadRun = useCallback(async () => {
    try {
      const { data } = await api.get<PcaRunDetail>(`/pca/runs/${id}`);
      setRun(data);
    } catch {
      toast.error("Impossible de charger le run");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadRun();
  }, [loadRun]);

  // Polling 2 s tant que le run est en cours
  useEffect(() => {
    if (!run) return;
    if (run.status !== "RUNNING" && run.status !== "PENDING") return;
    const t = setInterval(() => {
      loadRun();
    }, 2000);
    return () => clearInterval(t);
  }, [run, loadRun]);

  // Autoscroll logs vers le bas à chaque refresh pendant un run actif
  useEffect(() => {
    if (!logsRef.current) return;
    if (run?.status === "RUNNING" || run?.status === "PENDING") {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [run?.logs, run?.status]);

  const handleRerun = async () => {
    if (!run) return;
    setRerunning(true);
    try {
      const { data } = await api.post<{ runId: string }>("/pca/runs", {
        scenarioId: run.scenarioId,
      });
      toast.success("Nouveau run démarré");
      router.push(`/admin/pca/runs/${data.runId}`);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || "Impossible de relancer le scénario");
    } finally {
      setRerunning(false);
    }
  };

  const handleDownloadReport = () => {
    if (!run) return;
    const report = {
      id: run.id,
      scenarioId: run.scenarioId,
      scenarioName: run.scenarioName,
      iso: run.scenarioIso,
      status: run.status,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      durationMs: run.duration,
      triggeredBy: run.triggeredByUser
        ? `${run.triggeredByUser.firstName} ${run.triggeredByUser.lastName} <${run.triggeredByUser.email}>`
        : run.triggeredBy,
      result: run.result,
      logs: run.logs,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pca-run-${run.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="shimmer h-16 rounded-xl" />
        <div className="shimmer h-64 rounded-xl" />
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6">
        <EmptyState
          type="general"
          title="Run introuvable"
          description="Ce run a peut-être été supprimé ou l'identifiant est incorrect."
        />
        <div className="mt-4">
          <Link href="/admin/pca">
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour à la liste
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isActive = run.status === "RUNNING" || run.status === "PENDING";

  return (
    <div className="animate-fade-in-up space-y-6 p-6">
      <PageHeader
        title={run.scenarioName}
        subtitle={run.scenarioDescription || "Détail du run PCA"}
        icon={ShieldCheck}
        hub="admin"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/pca">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Retour
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={handleDownloadReport} disabled={isActive}>
              <Download className="mr-2 h-4 w-4" />
              Télécharger rapport
            </Button>
            <Button size="sm" onClick={handleRerun} disabled={rerunning || isActive}>
              {rerunning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Relancer
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-6 md:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
              Statut
            </p>
            <span
              className={`mt-1 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${STATUS_CLASSES[run.status]}`}
            >
              {isActive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {STATUS_LABELS[run.status]}
            </span>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
              Démarré à
            </p>
            <p className="mt-1 text-sm text-seal-navy dark:text-white">
              {formatDate(run.startedAt)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
              Terminé à
            </p>
            <p className="mt-1 text-sm text-seal-navy dark:text-white">
              {formatDate(run.completedAt)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
              Durée
            </p>
            <p className="mt-1 text-sm text-seal-navy dark:text-white">
              {formatDuration(run.duration)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="mb-3 flex items-center gap-2">
            <Badge variant="info" className="text-xs">
              {run.scenarioIso || "ISO 27001"}
            </Badge>
            {run.triggeredByUser && (
              <span className="text-xs text-seal-gray-500 dark:text-slate-400">
                Déclenché par {run.triggeredByUser.firstName} {run.triggeredByUser.lastName}
              </span>
            )}
          </div>
          {run.result ? (
            <dl className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
              {Object.entries(run.result).map(([key, value]) => (
                <div key={key} className="rounded-lg bg-gray-50 p-3 dark:bg-slate-800/50">
                  <dt className="text-xs uppercase tracking-wider text-seal-gray-500 dark:text-slate-500">
                    {key}
                  </dt>
                  <dd className="mt-1 break-words font-mono text-xs text-seal-navy dark:text-white">
                    {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-seal-gray-500 dark:text-slate-400">
              Aucun résultat structuré pour ce run (encore en cours ou échec précoce).
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3 dark:border-slate-700">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-seal-navy dark:text-white">
              <Terminal className="h-4 w-4" />
              Logs d&apos;exécution
            </h2>
            {isActive && (
              <span className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                Mise à jour auto (2 s)
              </span>
            )}
          </div>
          <pre
            ref={logsRef}
            className="max-h-[500px] overflow-auto rounded-b-lg bg-slate-950 p-4 font-mono text-xs leading-relaxed text-emerald-200"
          >
            {run.logs && run.logs.length > 0
              ? run.logs
              : "// Aucun log pour le moment — l'exécution va démarrer…"}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
