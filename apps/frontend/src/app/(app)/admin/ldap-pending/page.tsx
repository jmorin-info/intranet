"use client";

/**
 * Admin : validation des utilisateurs AD détectés lors de la synchro LDAP.
 * ISO 27001 A.5.15 — contrôle d'accès à la création de compte.
 *
 * Workflow :
 *   1. La synchro LDAP détecte de nouveaux utilisateurs dans AD
 *   2. Ils apparaissent ici avec statut PENDING
 *   3. L'admin choisit département + rôle → Approuver
 *   4. Ou Rejeter avec une raison (pour l'audit)
 *
 * Les utilisateurs rejetés qui réapparaissent en AD sont remis en PENDING à
 * la synchro suivante (pour permettre un re-arbitrage).
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import { formatDate as formatDateUtil } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { toast } from "sonner";
import { AdminGroupTabs } from "@/components/layout/admin-group-tabs";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, Skeleton } from "@omnitech/ui";
import {
  UserPlus,
  RefreshCw,
  Check,
  X,
  Building2,
  Briefcase,
  Phone,
  Clock,
  AlertCircle,
} from "lucide-react";

interface PendingUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  phone: string | null;
  adDepartment: string | null;
  dn: string | null;
  detectedAt: string;
  lastSeenAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED";
  rejectReason: string | null;
}

interface Department {
  id: string;
  name: string;
  code?: string;
}

function formatDateFr(iso: string): string {
  try {
    return formatDateUtil(iso, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function LdapPendingPage() {
  const t = useTranslations("admin.ldapPendingPage");
  const ROLES = [
    { value: "COLLABORATEUR", label: t("roleCollab") },
    { value: "REVIEWER", label: t("roleReviewer") },
    { value: "ADMIN", label: t("roleAdmin") },
    { value: "SUPER_ADMIN", label: t("roleSuperAdmin") },
    { value: "PRESTATAIRE", label: t("rolePrestataire") },
  ];
  const [items, setItems] = useState<PendingUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"PENDING" | "APPROVED" | "REJECTED" | "ALL">(
    "PENDING",
  );
  // Map pendingId → { departmentId, role } pour le form inline
  const [choices, setChoices] = useState<Record<string, { departmentId?: string; role: string }>>(
    {},
  );
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pendingRes, deptRes] = await Promise.allSettled([
        api.get(`/ldap/pending?status=${statusFilter}`),
        api.get("/departments"),
      ]);
      const list: PendingUser[] =
        pendingRes.status === "fulfilled" ? pendingRes.value.data?.data || [] : [];
      if (pendingRes.status === "rejected")
        logger.error(pendingRes.reason, {
          page: "admin/ldap-pending",
          context: "load pending",
        });
      setItems(list);
      if (deptRes.status === "fulfilled") {
        const deptList: Department[] = Array.isArray(deptRes.value.data)
          ? deptRes.value.data
          : deptRes.value.data?.data || [];
        setDepartments(deptList);
      } else
        logger.error(deptRes.reason, {
          page: "admin/ldap-pending",
          context: "load departments",
        });
      // Initialiser les choix par défaut : rôle COLLABORATEUR
      const next: Record<string, { departmentId?: string; role: string }> = {};
      for (const item of list) {
        if (!choices[item.id]) {
          next[item.id] = { role: "COLLABORATEUR" };
        } else {
          next[item.id] = choices[item.id]!;
        }
      }
      setChoices(next);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("loadError"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const triggerSync = async () => {
    try {
      toast.info(t("syncing"));
      await api.post("/ldap/sync-all", { deactivateMissing: false });
      toast.success(t("syncSuccess"));
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("syncError"));
    }
  };

  const approve = async (item: PendingUser) => {
    const choice = choices[item.id];
    if (!choice || !choice.role) {
      toast.error(t("selectRole"));
      return;
    }
    try {
      const res = await api.post(`/ldap/pending/${item.id}/approve`, {
        pendingId: item.id,
        departmentId: choice.departmentId || undefined,
        role: choice.role,
      });
      if (res.data?.success) {
        toast.success(
          t("approveSuccess", {
            name: `${item.firstName} ${item.lastName}`,
          }),
        );
        await load();
      } else {
        toast.error(res.data?.message || t("approveError"));
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("approveError"));
    }
  };

  const reject = async () => {
    if (!rejectingId) return;
    if (!rejectReason.trim()) {
      toast.error(t("rejectReasonRequired"));
      return;
    }
    try {
      const res = await api.post(`/ldap/pending/${rejectingId}/reject`, {
        pendingId: rejectingId,
        reason: rejectReason,
      });
      if (res.data?.success) {
        toast.success(t("rejectSuccess"));
        setRejectingId(null);
        setRejectReason("");
        await load();
      } else {
        toast.error(res.data?.message || t("rejectError"));
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t("rejectError"));
    }
  };

  const pendingCount = items.filter((i) => i.status === "PENDING").length;

  return (
    <div className="space-y-6">
      <AdminGroupTabs group="identity" />

      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        icon={UserPlus}
        hub="admin"
        actions={
          <>
            {pendingCount > 0 && (
              <span className="inline-flex items-center justify-center h-6 min-w-[24px] px-2 rounded-full bg-amber-500 text-white text-xs font-bold">
                {t("pendingBadge", { count: pendingCount })}
              </span>
            )}
            <button
              onClick={triggerSync}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90"
            >
              <RefreshCw className="h-4 w-4" />
              {t("sync")}
            </button>
          </>
        }
      />

      {/* Filtres statut */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 dark:border-slate-700 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {(["PENDING", "APPROVED", "REJECTED", "ALL"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 ${
                statusFilter === s
                  ? "border-primary text-primary"
                  : "border-transparent text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white"
              }`}
            >
              {s === "PENDING"
                ? t("filterPending")
                : s === "APPROVED"
                  ? t("filterApproved")
                  : s === "REJECTED"
                    ? t("filterRejected")
                    : t("filterAll")}
            </button>
          ))}
        </div>
        <span className="text-xs text-seal-gray-500 dark:text-slate-400 px-2">
          {t("resultsCount", { count: items.length })}
        </span>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          type="success"
          title={statusFilter === "PENDING" ? t("emptyPendingTitle") : t("emptyTitle")}
          description={statusFilter === "PENDING" ? t("emptyPendingDesc") : t("emptyDesc")}
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const choice = choices[item.id] || { role: "COLLABORATEUR" };
            const isPending = item.status === "PENDING";
            return (
              <div
                key={item.id}
                className={`rounded-xl border p-4 ${
                  isPending
                    ? "border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10"
                    : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                }`}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-seal-navy dark:text-white">
                        {item.firstName} {item.lastName}
                      </h3>
                      <span className="text-xs text-seal-gray-500 dark:text-slate-500">
                        {item.email}
                      </span>
                      <span
                        className={`text-[10px] uppercase px-2 py-0.5 rounded-full font-bold ${
                          item.status === "PENDING"
                            ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                            : item.status === "APPROVED"
                              ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                              : item.status === "REJECTED"
                                ? "bg-red-500/20 text-red-700 dark:text-red-300"
                                : "bg-gray-400/20 text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-seal-gray-500 dark:text-slate-400">
                      {item.jobTitle && (
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          {item.jobTitle}
                        </span>
                      )}
                      {item.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {item.phone}
                        </span>
                      )}
                      {item.adDepartment && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {t("adPrefix")} {item.adDepartment}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {t("detected")} {formatDateFr(item.detectedAt)}
                      </span>
                    </div>
                    {item.rejectReason && (
                      <div className="mt-2 flex items-start gap-1 text-xs text-red-600 dark:text-red-400">
                        <AlertCircle className="h-3 w-3 mt-0.5" />
                        {t("rejectReasonLabel")} {item.rejectReason}
                      </div>
                    )}
                  </div>
                </div>

                {isPending && (
                  <div className="mt-4 flex items-end gap-3 flex-wrap pt-3 border-t border-amber-200 dark:border-amber-900/40">
                    <div className="flex-1 min-w-[180px]">
                      <label className="block text-[10px] uppercase font-semibold text-seal-gray-500 dark:text-slate-500 mb-1">
                        {t("department")}
                      </label>
                      <select
                        value={choice.departmentId || ""}
                        onChange={(e) =>
                          setChoices({
                            ...choices,
                            [item.id]: {
                              ...choice,
                              departmentId: e.target.value || undefined,
                            },
                          })
                        }
                        className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-seal-navy dark:text-white"
                      >
                        <option value="">{t("noneOption")}</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                            {d.code ? ` (${d.code})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[180px]">
                      <label className="block text-[10px] uppercase font-semibold text-seal-gray-500 dark:text-slate-500 mb-1">
                        {t("role")}
                      </label>
                      <select
                        value={choice.role}
                        onChange={(e) =>
                          setChoices({
                            ...choices,
                            [item.id]: { ...choice, role: e.target.value },
                          })
                        }
                        className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-seal-navy dark:text-white"
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => approve(item)}
                        className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600"
                      >
                        <Check className="h-4 w-4" />
                        {t("approve")}
                      </button>
                      <button
                        onClick={() => {
                          setRejectingId(item.id);
                          setRejectReason("");
                        }}
                        className="inline-flex items-center gap-1 px-4 py-2 rounded-lg border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <X className="h-4 w-4" />
                        {t("reject")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog de rejet */}
      {rejectingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setRejectingId(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl shadow-xl p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-seal-navy dark:text-white mb-2">
              {t("rejectDialogTitle")}
            </h3>
            <p className="text-xs text-seal-gray-500 dark:text-slate-400 mb-3">
              {t("rejectDialogDesc")}
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-seal-navy dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={t("rejectPlaceholder")}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setRejectingId(null)}
                className="px-4 py-2 rounded-lg text-sm text-seal-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800"
              >
                {t("cancel")}
              </button>
              <button
                onClick={reject}
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600"
              >
                {t("confirmReject")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
