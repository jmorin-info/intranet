"use client";

/**
 * Wave D — Item 28 — Page admin alertes UEBA.
 *
 * RSSI / SUPER_ADMIN-only (le RoleGuard impose minRole=ADMIN ; les actions
 * de transition ACK/RESOLVE sont exposées seulement si l'utilisateur est
 * ADMIN+, ce qui est aligné avec le backend /admin/behavior-alerts).
 *
 * - Liste filtrable (status, severity, ruleCode)
 * - Compteurs en haut
 * - Modale détail avec evidence JSON + actions
 * - Trigger run-now (SUPER_ADMIN seulement)
 *
 * Cette page est volontairement compacte : la mise en forme finale (charte
 * SEAL .seal-*, animations) sera affinée dans un wave UI ultérieur.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ShieldAlert, CheckCircle2, X, Clock, RefreshCw } from "lucide-react";
import { Button, Badge, Card, CardContent, EmptyState, Skeleton } from "@omnitech/ui";
import { UserRole } from "@omnitech/shared";
import { PageHeader } from "@/components/layout/page-header";
import { RoleGuard } from "@/components/role-guard";
import { api } from "@/lib/api";

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type Status = "NEW" | "ACKNOWLEDGED" | "RESOLVED" | "FALSE_POSITIVE";

interface AlertItem {
  id: string;
  ruleCode: string;
  severity: Severity;
  status: Status;
  score: number;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  user: { id: string; email: string; firstName: string; lastName: string } | null;
}

interface CountsBlock {
  newCritical: number;
  newHigh: number;
  newMedium: number;
  newLow: number;
  acknowledged: number;
  resolved24h: number;
}

interface ListResponse {
  data: AlertItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  counts: CountsBlock;
}

const SEVERITY_COLORS: Record<Severity, string> = {
  CRITICAL: "bg-red-600 text-white",
  HIGH: "bg-orange-500 text-white",
  MEDIUM: "bg-yellow-500 text-black",
  LOW: "bg-blue-400 text-white",
};

const STATUS_LABELS: Record<Status, string> = {
  NEW: "Nouveau",
  ACKNOWLEDGED: "Acquitté",
  RESOLVED: "Résolu",
  FALSE_POSITIVE: "Faux positif",
};

export default function BehaviorAlertsPage() {
  const [filterStatus, setFilterStatus] = useState<Status | "ALL">("NEW");
  const [filterSeverity, setFilterSeverity] = useState<string>("");
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AlertItem | null>(null);
  const [triggering, setTriggering] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "ALL") params.set("status", filterStatus);
      if (filterSeverity) params.set("severity", filterSeverity);
      params.set("page", String(page));
      const res = await api.get<ListResponse>(
        `/admin/behavior-alerts?${params.toString()}`,
      );
      setData(res.data);
    } catch {
      toast.error("Impossible de charger les alertes");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterSeverity, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const transition = useCallback(
    async (id: string, action: "acknowledge" | "resolve" | "false-positive") => {
      try {
        await api.patch(`/admin/behavior-alerts/${id}/${action}`, {});
        toast.success("Alerte mise à jour");
        setSelected(null);
        await load();
      } catch {
        toast.error("Échec de la mise à jour");
      }
    },
    [load],
  );

  const runNow = useCallback(async () => {
    setTriggering(true);
    try {
      const res = await api.post<{
        rulesEvaluated: number;
        alertsCreated: number;
      }>("/admin/behavior-alerts/run-now");
      toast.success(
        `Cycle terminé : ${res.data.rulesEvaluated} règles, ${res.data.alertsCreated} alerte(s)`,
      );
      await load();
    } catch {
      toast.error("Trigger refusé (SUPER_ADMIN requis ?)");
    } finally {
      setTriggering(false);
    }
  }, [load]);

  const counts = data?.counts;
  const total = data?.meta.total ?? 0;
  const totalPages = data?.meta.totalPages ?? 1;

  const items = useMemo(() => data?.data ?? [], [data]);

  return (
    <RoleGuard minRole={UserRole.ADMIN}>
      <div className="p-6 space-y-6 bg-gray-50 dark:bg-slate-950 min-h-screen">
        <PageHeader
          title="Alertes UEBA"
          subtitle="Détection comportementale — règles R001..R008 (cron 5 min)."
          icon={ShieldAlert}
          hub="rssi"
          actions={
            <div className="flex gap-2">
              <Button onClick={() => void load()} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-1" /> Rafraîchir
              </Button>
              <Button
                onClick={() => void runNow()}
                disabled={triggering}
                size="sm"
              >
                {triggering ? "Exécution…" : "Run-now"}
              </Button>
            </div>
          }
        />

        {/* Counters */}
        {counts && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <CounterCard label="CRITICAL" value={counts.newCritical} severity="CRITICAL" />
            <CounterCard label="HIGH" value={counts.newHigh} severity="HIGH" />
            <CounterCard label="MEDIUM" value={counts.newMedium} severity="MEDIUM" />
            <CounterCard label="LOW" value={counts.newLow} severity="LOW" />
            <CounterCard label="Acquittées" value={counts.acknowledged} />
            <CounterCard label="Résolues 24h" value={counts.resolved24h} />
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="p-4 flex flex-wrap gap-2 items-center">
            <span className="text-sm text-gray-500">Statut :</span>
            {(["NEW", "ACKNOWLEDGED", "RESOLVED", "FALSE_POSITIVE", "ALL"] as const).map(
              (s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={filterStatus === s ? "default" : "outline"}
                  onClick={() => {
                    setFilterStatus(s);
                    setPage(1);
                  }}
                >
                  {s === "ALL" ? "Tous" : STATUS_LABELS[s]}
                </Button>
              ),
            )}
            <span className="text-sm text-gray-500 ml-4">Sévérité :</span>
            {["", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => (
              <Button
                key={s || "any"}
                size="sm"
                variant={filterSeverity === s ? "default" : "outline"}
                onClick={() => {
                  setFilterSeverity(s);
                  setPage(1);
                }}
              >
                {s || "Toutes"}
              </Button>
            ))}
          </CardContent>
        </Card>

        {/* List */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="h-12 w-12 text-green-500" />}
                title="Aucune alerte ouverte"
                description="Tous les comportements sont conformes aux baselines actuelles."
              />
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-slate-800">
                {items.map((alert) => (
                  <li
                    key={alert.id}
                    className="p-4 hover:bg-gray-50 dark:hover:bg-slate-900 cursor-pointer"
                    onClick={() => setSelected(alert)}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={SEVERITY_COLORS[alert.severity]}>
                            {alert.severity}
                          </Badge>
                          <span className="text-xs text-gray-500 font-mono">
                            {alert.ruleCode}
                          </span>
                          <Badge variant="outline">{STATUS_LABELS[alert.status]}</Badge>
                        </div>
                        <p className="font-medium truncate">{alert.title}</p>
                        <p className="text-sm text-gray-500 truncate">
                          {alert.description}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {alert.user
                            ? `${alert.user.firstName} ${alert.user.lastName} (${alert.user.email})`
                            : "Acteur anonyme"}
                          {" · "}
                          {new Date(alert.createdAt).toLocaleString("fr-FR")}
                          {" · score "}
                          {alert.score.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Précédent
            </Button>
            <span className="text-sm flex items-center px-3">
              Page {page} / {totalPages} ({total} alertes)
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
            </Button>
          </div>
        )}

        {/* Detail modal */}
        {selected && (
          <DetailModal
            alert={selected}
            onClose={() => setSelected(null)}
            onTransition={transition}
          />
        )}
      </div>
    </RoleGuard>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

interface CounterCardProps {
  label: string;
  value: number;
  severity?: Severity;
}

function CounterCard({ label, value, severity }: CounterCardProps) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-gray-500 flex items-center justify-center gap-1">
          {severity && (
            <span className={`inline-block w-2 h-2 rounded-full ${SEVERITY_COLORS[severity].split(" ")[0]}`} />
          )}
          {label}
        </div>
      </CardContent>
    </Card>
  );
}

interface DetailModalProps {
  alert: AlertItem;
  onClose: () => void;
  onTransition: (
    id: string,
    action: "acknowledge" | "resolve" | "false-positive",
  ) => Promise<void>;
}

function DetailModal({ alert, onClose, onTransition }: DetailModalProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-200 dark:border-slate-800 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge className={SEVERITY_COLORS[alert.severity]}>
                {alert.severity}
              </Badge>
              <span className="text-xs font-mono text-gray-500">
                {alert.ruleCode}
              </span>
              <Badge variant="outline">{STATUS_LABELS[alert.status]}</Badge>
            </div>
            <h2 className="text-xl font-semibold">{alert.title}</h2>
            <p className="text-sm text-gray-500 mt-1">
              <Clock className="h-3 w-3 inline mr-1" />
              {new Date(alert.createdAt).toLocaleString("fr-FR")}
            </p>
          </div>
          <Button onClick={onClose} variant="ghost" size="sm">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <h3 className="font-medium mb-1">Description</h3>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {alert.description}
            </p>
          </div>

          {alert.user && (
            <div>
              <h3 className="font-medium mb-1">Utilisateur concerné</h3>
              <p className="text-sm">
                {alert.user.firstName} {alert.user.lastName} ({alert.user.email})
              </p>
            </div>
          )}

          <div>
            <h3 className="font-medium mb-1">Preuves (evidence)</h3>
            <pre className="bg-gray-100 dark:bg-slate-800 p-3 rounded text-xs overflow-auto max-h-64">
              {JSON.stringify(alert.evidence, null, 2)}
            </pre>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-slate-800 flex gap-2 justify-end">
          {alert.status === "NEW" && (
            <Button
              variant="outline"
              onClick={() => void onTransition(alert.id, "acknowledge")}
            >
              Acquitter
            </Button>
          )}
          {alert.status !== "RESOLVED" && alert.status !== "FALSE_POSITIVE" && (
            <>
              <Button
                variant="outline"
                onClick={() => void onTransition(alert.id, "false-positive")}
              >
                Faux positif
              </Button>
              <Button onClick={() => void onTransition(alert.id, "resolve")}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Résoudre
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
