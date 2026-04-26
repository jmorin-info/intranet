"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useNotificationStore } from "@/stores/notification-store";
import { useAuthStore } from "@/stores/auth-store";
import { isRoleAtLeast, UserRole } from "@omnitech/shared";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  Button,
  Badge,
  EmptyState,
  Select,
  Dialog,
  Input,
  Textarea,
} from "@omnitech/ui";
import { formatRelativeTime } from "@/lib/utils";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  FileText,
  PenLine,
  Eye,
  UserCheck,
  Newspaper,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Ticket,
  ExternalLink,
  ArrowRight,
  Send,
  Settings,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { ExportButton } from "@/components/ui/export-button";
import { PageHeader } from "@/components/layout/page-header";
import { logger } from "@/lib/logger";

const typeIcons: Record<string, React.ElementType> = {
  DOC_PUBLISHED: FileText,
  DOC_REVIEW_NEEDED: Eye,
  DOC_APPROVAL_NEEDED: CheckCircle2,
  DOC_APPROVED: CheckCircle2,
  DOC_REJECTED: AlertTriangle,
  SIGNATURE_NEEDED: PenLine,
  REVIEW_OVERDUE: AlertTriangle,
  ACK_REQUIRED: ClipboardCheck,
  NEWS_POSTED: Newspaper,
  TICKET_CREATED: Ticket,
  EXTERNAL_ACCESS_REVIEW: UserCheck,
};

function getNotificationAction(n: {
  type: string;
  resourceType?: string;
  resourceId?: string;
}) {
  if (n.resourceType === "Document" && n.resourceId) {
    const labels: Record<string, string> = {
      DOC_REVIEW_NEEDED: "Voir le document",
      DOC_APPROVAL_NEEDED: "Approuver",
      DOC_PUBLISHED: "Voir le document",
      DOC_APPROVED: "Voir le document",
      DOC_REJECTED: "Voir le document",
    };
    return {
      label: labels[n.type] || "Voir le document",
      href: `/documents/${n.resourceId}`,
    };
  }
  if (n.resourceType === "Ticket" && n.resourceId) {
    return { label: "Voir le ticket", href: `/tickets/${n.resourceId}` };
  }
  if (n.type === "SIGNATURE_NEEDED") {
    return { label: "Signer la charte", href: "/chartes" };
  }
  if (
    n.type === "ACK_REQUIRED" &&
    n.resourceType === "Document" &&
    n.resourceId
  ) {
    return { label: "Accuser réception", href: `/documents/${n.resourceId}` };
  }
  if (n.resourceType === "NewsPost" && n.resourceId) {
    return { label: "Lire", href: `/news/${n.resourceId}` };
  }
  return null;
}

const notificationTypeLabels: Record<string, string> = {
  DOC_PUBLISHED: "Document publié",
  DOC_REVIEW_NEEDED: "Revue requise",
  DOC_APPROVAL_NEEDED: "Approbation requise",
  DOC_APPROVED: "Document approuvé",
  DOC_REJECTED: "Document rejeté",
  SIGNATURE_NEEDED: "Signature requise",
  REVIEW_OVERDUE: "Revue en retard",
  ACK_REQUIRED: "Accusé de réception requis",
  NEWS_POSTED: "Nouvelle actualité",
  TICKET_CREATED: "Nouveau ticket",
  EXTERNAL_ACCESS_REVIEW: "Revue accès prestataire",
};

export default function NotificationsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user && isRoleAtLeast(user.role, UserRole.ADMIN);
  const { notifications, setNotifications, markAsRead, markAllAsRead } =
    useNotificationStore();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("all");

  // Admin broadcast state
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({
    type: "DOC_PUBLISHED",
    title: "",
    body: "",
    target: "all",
    targetRole: "",
    targetDepartmentId: "",
  });
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [departments, setDepartments] = useState<
    { id: string; name: string }[]
  >([]);

  useEffect(() => {
    if (isAdmin) {
      api
        .get("/departments")
        .then(({ data }) => {
          setDepartments(data?.data || data || []);
        })
        .catch(() => {});
    }
  }, [isAdmin]);

  const PAGE_SIZE = 20;

  useEffect(() => {
    api
      .get("/notifications", { params: { page: 1, limit: PAGE_SIZE } })
      .then(({ data }) => {
        setNotifications(data?.data || []);
        const meta = data?.meta;
        setHasMore(meta ? meta.page < meta.totalPages : false);
        setPage(1);
      })
      .catch((err) =>
        logger.error(err, { page: "notifications", context: "load" }),
      )
      .finally(() => setLoading(false));
  }, [setNotifications]);

  const handleLoadMore = async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const { data } = await api.get("/notifications", {
        params: { page: nextPage, limit: PAGE_SIZE },
      });
      const newItems: typeof notifications = data?.data || [];
      setNotifications([...notifications, ...newItems]);
      const meta = data?.meta;
      setHasMore(meta ? nextPage < meta.totalPages : false);
      setPage(nextPage);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.patch("/notifications/read-all");
      markAllAsRead();
    } catch {
      // ignore
    }
  };

  const handleClick = async (notif: (typeof notifications)[0]) => {
    if (!notif.isRead) {
      try {
        setReadAnimatingIds((prev) => new Set(prev).add(notif.id));
        await api.patch(`/notifications/${notif.id}/read`);
        markAsRead(notif.id);
        setTimeout(() => {
          setReadAnimatingIds((prev) => {
            const next = new Set(prev);
            next.delete(notif.id);
            return next;
          });
        }, 500);
      } catch {
        setReadAnimatingIds((prev) => {
          const next = new Set(prev);
          next.delete(notif.id);
          return next;
        });
      }
    }
    // Navigate to resource
    if (notif.resourceType === "Document" && notif.resourceId) {
      router.push(`/documents/${notif.resourceId}`);
    } else if (notif.resourceType === "NewsPost" && notif.resourceId) {
      router.push(`/news/${notif.resourceId}`);
    } else if (notif.resourceType === "Ticket" && notif.resourceId) {
      router.push(`/tickets/${notif.resourceId}`);
    }
  };

  const handleSendBroadcast = async () => {
    if (!broadcastForm.title.trim()) return;
    setSendingBroadcast(true);
    try {
      const payload: Record<string, string> = {
        type: broadcastForm.type,
        title: broadcastForm.title,
        body: broadcastForm.body,
      };
      if (broadcastForm.target === "role" && broadcastForm.targetRole) {
        payload.targetRole = broadcastForm.targetRole;
      }
      if (
        broadcastForm.target === "department" &&
        broadcastForm.targetDepartmentId
      ) {
        payload.targetDepartmentId = broadcastForm.targetDepartmentId;
      }
      await api.post("/notifications/broadcast", payload);
      toast.success("Notification envoyée avec succès");
      setShowBroadcast(false);
      setBroadcastForm({
        type: "DOC_PUBLISHED",
        title: "",
        body: "",
        target: "all",
        targetRole: "",
        targetDepartmentId: "",
      });
    } catch (err) {
      toast.error(
        (err as any)?.response?.data?.message ||
          (err as any)?.message ||
          "Erreur lors de l'envoi de la notification",
      );
    } finally {
      setSendingBroadcast(false);
    }
  };

  const filteredNotifications = useMemo(() => {
    let filtered = notifications;
    if (typeFilter) {
      filtered = filtered.filter((n) => n.type.startsWith(typeFilter));
    }
    if (dateFilter !== "all") {
      const now = new Date();
      const cutoff = new Date();
      if (dateFilter === "today") cutoff.setHours(0, 0, 0, 0);
      else if (dateFilter === "week") cutoff.setDate(now.getDate() - 7);
      else if (dateFilter === "month") cutoff.setMonth(now.getMonth() - 1);
      filtered = filtered.filter((n) => new Date(n.createdAt) >= cutoff);
    }
    return filtered;
  }, [notifications, typeFilter, dateFilter]);

  const [readAnimatingIds, setReadAnimatingIds] = useState<Set<string>>(
    new Set(),
  );

  const grouped = useMemo(() => {
    const groups: Record<string, typeof filteredNotifications> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    for (const n of filteredNotifications) {
      const d = new Date(n.createdAt);
      d.setHours(0, 0, 0, 0);
      let label: string;
      if (d.getTime() === today.getTime()) label = "Aujourd'hui";
      else if (d.getTime() === yesterday.getTime()) label = "Hier";
      else if (d.getTime() > weekAgo.getTime()) label = "Cette semaine";
      else label = "Plus ancien";
      if (!groups[label]) groups[label] = [];
      groups[label]!.push(n);
    }
    // Ensure order: Aujourd'hui -> Hier -> Cette semaine -> Plus ancien
    const orderedKeys = ["Aujourd'hui", "Hier", "Cette semaine", "Plus ancien"];
    const ordered: Record<string, typeof filteredNotifications> = {};
    for (const key of orderedKeys) {
      if (groups[key]) ordered[key] = groups[key];
    }
    return ordered;
  }, [filteredNotifications]);

  const unreadCount = useNotificationStore((s) => s.unreadCount);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in-up">
      <PageHeader
        title={t("notifications.title")}
        subtitle={
          unreadCount > 0
            ? `${unreadCount} notification${unreadCount > 1 ? "s" : ""} non lue${unreadCount > 1 ? "s" : ""}`
            : "Toutes les notifications sont lues"
        }
        icon={Bell}
        hub="monEspace"
        actions={
          <>
            <Link href="/notifications/preferences">
              <Button variant="outline">
                <Settings className="h-4 w-4" />
                Préférences
              </Button>
            </Link>
            {!loading && notifications.length > 0 && unreadCount === 0 && (
              <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-3 py-1.5 rounded-full text-xs font-semibold">
                <CheckCheck className="h-4 w-4" />
                {t("notifications.allRead")}
              </div>
            )}
            <ExportButton
              filename="notifications"
              rows={
                (notifications || []) as unknown as Array<
                  Record<string, unknown>
                >
              }
              columns={[
                { header: "ID", accessor: (r: any) => r?.id || "" },
                { header: "Type", accessor: (r: any) => r?.type || "" },
                { header: "Titre", accessor: (r: any) => r?.title || "" },
                {
                  header: "Message",
                  accessor: (r: any) =>
                    r?.body ? String(r.body).slice(0, 200) : "",
                },
                {
                  header: "Ressource",
                  accessor: (r: any) => r?.resourceType || "",
                },
                { header: "Créé le", accessor: (r: any) => r?.createdAt || "" },
                {
                  header: "Lu",
                  accessor: (r: any) => (r?.isRead ? "oui" : "non"),
                },
              ]}
            />
            {unreadCount > 0 && (
              <Button variant="primary" onClick={handleMarkAllRead}>
                <CheckCheck className="h-4 w-4" />
                {t("notifications.markAllRead")}
              </Button>
            )}
          </>
        }
      />

      {/* Admin broadcast section */}
      {isAdmin && (
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <h3 className="text-sm font-semibold text-seal-navy dark:text-white">
                {t("notifications.admin")}
              </h3>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                {t("notifications.adminDesc")}
              </p>
            </div>
            <Button onClick={() => setShowBroadcast(true)}>
              <Send className="h-4 w-4" />
              {t("notifications.sendOne")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Broadcast dialog */}
      <Dialog
        open={showBroadcast}
        onClose={() => setShowBroadcast(false)}
        title={t("notifications.sendOne")}
      >
        <div className="space-y-4">
          <Input
            label={t("notifications.form.titleLabel")}
            placeholder={t("notifications.form.titlePh")}
            value={broadcastForm.title}
            onChange={(e) =>
              setBroadcastForm({ ...broadcastForm, title: e.target.value })
            }
          />
          <Textarea
            label={t("notifications.form.messageLabel")}
            placeholder={t("notifications.form.messagePh")}
            value={broadcastForm.body}
            onChange={(e) =>
              setBroadcastForm({ ...broadcastForm, body: e.target.value })
            }
            rows={3}
          />
          <div>
            <label
              htmlFor="broadcast-type"
              className="block text-sm font-semibold text-seal-navy dark:text-white mb-1"
            >
              {t("notifications.form.type")}
            </label>
            <select
              id="broadcast-type"
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-seal-navy dark:text-white focus:border-seal-navy focus:outline-none focus:ring-2 focus:ring-seal-navy/20 transition"
              value={broadcastForm.type}
              onChange={(e) =>
                setBroadcastForm({ ...broadcastForm, type: e.target.value })
              }
            >
              <option value="DOC_PUBLISHED">Document publié</option>
              <option value="SIGNATURE_NEEDED">Signature requise</option>
              <option value="ACK_REQUIRED">Accusé de réception requis</option>
              <option value="NEWS_POSTED">Nouvelle actualité</option>
              <option value="TICKET_CREATED">Nouveau ticket</option>
              <option value="GENERAL">Information</option>
            </select>
          </div>
          <div>
            <label
              htmlFor="broadcast-recipients"
              className="block text-sm font-semibold text-seal-navy dark:text-white mb-1"
            >
              {t("notifications.form.recipients")}
            </label>
            <select
              id="broadcast-recipients"
              className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-seal-navy dark:text-white focus:border-seal-navy focus:outline-none focus:ring-2 focus:ring-seal-navy/20 transition"
              value={broadcastForm.target}
              onChange={(e) =>
                setBroadcastForm({
                  ...broadcastForm,
                  target: e.target.value,
                  targetRole: "",
                  targetDepartmentId: "",
                })
              }
            >
              <option value="all">Tous les utilisateurs</option>
              <option value="role">Par rôle</option>
              <option value="department">Par département</option>
            </select>
          </div>
          {broadcastForm.target === "role" && (
            <div>
              <label
                htmlFor="broadcast-role"
                className="block text-sm font-semibold text-seal-navy dark:text-white mb-1"
              >
                Rôle cible
              </label>
              <select
                id="broadcast-role"
                aria-required="true"
                aria-invalid={!broadcastForm.targetRole}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-seal-navy dark:text-white focus:border-seal-navy focus:outline-none focus:ring-2 focus:ring-seal-navy/20 transition"
                value={broadcastForm.targetRole}
                onChange={(e) =>
                  setBroadcastForm({
                    ...broadcastForm,
                    targetRole: e.target.value,
                  })
                }
              >
                <option value="">Sélectionner un rôle...</option>
                <option value="SUPER_ADMIN">Super Admin</option>
                <option value="ADMIN">Admin</option>
                <option value="QUALITY_MANAGER">Responsable qualité</option>
                <option value="DEPARTMENT_HEAD">Chef de département</option>
                <option value="COLLABORATOR">Collaborateur</option>
                <option value="READER">Lecteur</option>
              </select>
              {!broadcastForm.targetRole && (
                <p
                  role="alert"
                  className="mt-1 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1"
                >
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  Sélectionnez un rôle pour cibler la notification
                </p>
              )}
            </div>
          )}
          {broadcastForm.target === "department" && (
            <div>
              <label
                htmlFor="broadcast-dept"
                className="block text-sm font-semibold text-seal-navy dark:text-white mb-1"
              >
                Département cible
              </label>
              <select
                id="broadcast-dept"
                aria-required="true"
                aria-invalid={!broadcastForm.targetDepartmentId}
                className="w-full rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-seal-navy dark:text-white focus:border-seal-navy focus:outline-none focus:ring-2 focus:ring-seal-navy/20 transition"
                value={broadcastForm.targetDepartmentId}
                onChange={(e) =>
                  setBroadcastForm({
                    ...broadcastForm,
                    targetDepartmentId: e.target.value,
                  })
                }
              >
                <option value="">Sélectionner un département...</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              {!broadcastForm.targetDepartmentId && (
                <p
                  role="alert"
                  className="mt-1 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1"
                >
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  Sélectionnez un département pour cibler la notification
                </p>
              )}
            </div>
          )}
          {/* Preview */}
          {broadcastForm.title.trim() && (
            <div>
              <label className="block text-sm font-semibold text-seal-navy dark:text-white mb-1">
                Apercu
              </label>
              <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-primary-light dark:bg-slate-700 flex-shrink-0">
                    <Bell className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-seal-navy dark:text-white">
                      {broadcastForm.title}
                    </p>
                    {broadcastForm.body && (
                      <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
                        {broadcastForm.body}
                      </p>
                    )}
                    <span className="inline-block mt-1.5 rounded-full bg-gray-200 dark:bg-slate-600 px-2 py-0.5 text-[10px] font-semibold text-seal-gray-500 dark:text-slate-300">
                      {notificationTypeLabels[broadcastForm.type] ||
                        broadcastForm.type}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowBroadcast(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSendBroadcast}
              loading={sendingBroadcast}
              disabled={
                !broadcastForm.title.trim() ||
                (broadcastForm.target === "role" &&
                  !broadcastForm.targetRole) ||
                (broadcastForm.target === "department" &&
                  !broadcastForm.targetDepartmentId)
              }
            >
              <Send className="h-4 w-4" />
              {t("common.send")}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Type filter pills */}
      <div
        className="flex flex-wrap gap-2 mb-2"
        role="tablist"
        aria-label="Filtrer par type"
      >
        {[
          { value: "", label: "Tous" },
          { value: "DOC_", label: "Documents", icon: FileText },
          { value: "TICKET_", label: "Tickets", icon: Ticket },
          { value: "SIGNATURE_", label: "Signatures", icon: PenLine },
          { value: "ACK_", label: "Approbations", icon: ClipboardCheck },
          { value: "NEWS_", label: "Actualités", icon: Newspaper },
          { value: "REVIEW_", label: "Revues", icon: Eye },
        ].map(({ value, label, icon: PillIcon }) => (
          <button
            key={value}
            onClick={() => setTypeFilter(value)}
            role="tab"
            aria-selected={typeFilter === value}
            aria-label={`Filtrer par ${label}`}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal-navy ${
              typeFilter === value
                ? "bg-primary text-white border-primary"
                : "bg-white dark:bg-slate-800 text-seal-gray-500 dark:text-slate-300 border-gray-200 dark:border-slate-700 hover:border-primary hover:text-primary dark:hover:text-primary"
            }`}
          >
            {PillIcon && <PillIcon className="h-3 w-3" aria-hidden="true" />}
            {label}
          </button>
        ))}
      </div>

      {/* Date filter */}
      <div className="flex gap-3 mb-4">
        <Select
          options={[
            { value: "all", label: t("notifications.filterByDate") },
            { value: "today", label: t("notifications.today") },
            { value: "week", label: t("notifications.thisWeek") },
            { value: "month", label: t("notifications.thisMonth") },
          ]}
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="w-48"
        />
      </div>

      {loading ? (
        <Card>
          <CardContent aria-busy="true" aria-live="polite">
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-4 px-2 py-3">
                  <div className="h-9 w-9 rounded-full shimmer flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-2/5 rounded shimmer" />
                    <div className="h-5 w-24 rounded-full shimmer" />
                    <div className="h-3 w-4/5 rounded shimmer" />
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <div className="h-2.5 w-12 rounded shimmer" />
                    <div className="h-5 w-20 rounded-md shimmer" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : filteredNotifications.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            type="notifications"
            title={
              notifications.length === 0
                ? "Tout est calme ici"
                : t("notifications.empty")
            }
            description={
              notifications.length === 0
                ? "Aucune notification pour le moment. Vous serez prévenu dès qu'il y aura du nouveau !"
                : `Aucun résultat pour les filtres actifs. Essayez d'élargir votre recherche.`
            }
            action={
              notifications.length === 0 ? (
                <Link href="/dashboard">
                  <Button variant="outline" size="sm">
                    {t("notifications.backToDashboard")}
                  </Button>
                </Link>
              ) : undefined
            }
          />
          {(typeFilter || dateFilter !== "all") && (
            <div className="text-center">
              <Button
                variant="outline"
                onClick={() => {
                  setTypeFilter("");
                  setDateFilter("all");
                }}
              >
                {t("notifications.resetFilters")}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([label, groupNotifs]) => (
            <div key={label}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <h3 className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 uppercase tracking-wide">
                  {label}
                </h3>
                <span className="text-[10px] text-seal-gray-500/60 dark:text-slate-500 font-medium">
                  {groupNotifs.length}
                </span>
                <div className="flex-1 h-px bg-gray-100 dark:bg-slate-800" />
              </div>
              <Card>
                <CardContent className="p-0 divide-y divide-gray-100 dark:divide-slate-700">
                  {groupNotifs.map((notif) => {
                    const Icon = typeIcons[notif.type] || Bell;
                    const isAnimating = readAnimatingIds.has(notif.id);
                    return (
                      <button
                        key={notif.id}
                        onClick={() => handleClick(notif)}
                        aria-label={`${notif.isRead ? "" : "Non lu: "}${notif.title}`}
                        className={`w-full text-left flex items-start gap-4 px-6 py-4 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all duration-300 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                          !notif.isRead ? "bg-primary/5 dark:bg-primary/10" : ""
                        } ${isAnimating ? "opacity-60 scale-[0.99]" : ""}`}
                        style={
                          isAnimating
                            ? { transition: "all 0.4s ease-out" }
                            : undefined
                        }
                      >
                        <div
                          className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-full flex-shrink-0 ${
                            !notif.isRead
                              ? "bg-primary-light"
                              : "bg-gray-100 dark:bg-slate-800"
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 ${!notif.isRead ? "text-primary" : "text-seal-gray-500 dark:text-slate-400"}`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p
                              className={`text-sm ${
                                !notif.isRead
                                  ? "font-semibold text-seal-navy dark:text-white"
                                  : "text-seal-navy dark:text-white"
                              }`}
                            >
                              {notif.title}
                            </p>
                            {!notif.isRead && (
                              <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                            )}
                          </div>
                          {notificationTypeLabels[notif.type] && (
                            <span className="inline-block mt-0.5 rounded-full bg-gray-100 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-semibold text-seal-gray-500 dark:text-slate-300">
                              {notificationTypeLabels[notif.type]}
                            </span>
                          )}
                          <p className="text-xs text-seal-gray-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                            {notif.body}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <span className="text-[10px] text-seal-gray-500/70 dark:text-slate-500 whitespace-nowrap">
                            {formatRelativeTime(notif.createdAt)}
                          </span>
                          {(() => {
                            const action = getNotificationAction(notif);
                            if (!action) return null;
                            return (
                              <Link
                                href={action.href}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 transition-colors whitespace-nowrap"
                              >
                                {action.label}
                                <ArrowRight className="h-3 w-3" />
                              </Link>
                            );
                          })()}
                        </div>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          ))}
          {hasMore && (
            <div className="text-center pt-2">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                loading={loadingMore}
              >
                Charger plus
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
