"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { DOCUMENT_CATEGORY_LABELS } from "@omnitech/shared";
import { Card, CardContent, Button, DataTable, Tabs, ConfirmDialog } from "@omnitech/ui";
import type { Column } from "@omnitech/ui";
import {
  Eye,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  PartyPopper,
  XCircle,
  ClipboardCheck,
  Shield,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { toast } from "sonner";
import { useTranslation } from "@/lib/i18n";

interface Person {
  id: string;
  firstName: string;
  lastName: string;
}

interface PendingStep {
  stepType: string;
  assignedToId: string;
}

interface PendingDocument {
  id: string;
  title: string;
  reference: string;
  status: string;
  category: string;
  updatedAt: string;
  owner: Person;
  verifier?: Person | null;
  reviewer?: Person | null;
  approver?: Person | null;
  validationRequests?: Array<{
    id: string;
    currentStep: string;
    steps: PendingStep[];
  }>;
}

type TabId = "review" | "approval" | "confirm";

function currentStepOf(doc: PendingDocument): string | undefined {
  return doc.validationRequests?.[0]?.currentStep;
}

export default function PendingDocumentsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>("review");
  const [docs, setDocs] = useState<PendingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [approveConfirm, setApproveConfirm] = useState<{
    docId: string;
    title: string;
    action: string;
  } | null>(null);

  const fetchPending = useCallback(async () => {
    try {
      // Endpoint dédié : ne renvoie QUE les documents dont une étape est
      // assignée à l'utilisateur (vérif/revue/approb) + ses docs à confirmer.
      const res = await api.get("/documents/pending");
      setDocs(Array.isArray(res.data) ? res.data : res.data?.data || []);
    } catch {
      // graceful
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    fetchPending();
  }, [fetchPending]);
  useRefetchOnFocus(fetchPending);

  const reviewDocs = docs.filter((d) => d.status === "IN_REVIEW");
  const approvalDocs = docs.filter((d) => d.status === "PENDING_APPROVAL");
  const confirmDocs = docs.filter((d) => d.status === "REVIEW_APPROVED");

  const tabs = [
    { id: "review", label: "Revue / vérification", count: reviewDocs.length },
    { id: "approval", label: t("pending.pendingApproval"), count: approvalDocs.length },
    { id: "confirm", label: "À confirmer", count: confirmDocs.length },
  ];

  const currentDocs =
    activeTab === "review" ? reviewDocs : activeTab === "approval" ? approvalDocs : confirmDocs;

  const getDaysPending = (updatedAt: string) =>
    Math.floor((Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24));
  const isUrgent = (updatedAt: string) => getDaysPending(updatedAt) > 7;

  const getUrgencyConfig = (updatedAt: string) => {
    const days = getDaysPending(updatedAt);
    if (days > 14)
      return {
        color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
        label: `En attente depuis ${days} jours`,
        dot: "bg-red-500",
      };
    if (days > 7)
      return {
        color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
        label: `En attente depuis ${days} jours`,
        dot: "bg-amber-500",
      };
    return {
      color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      label:
        days === 0
          ? "En attente depuis aujourd'hui"
          : `En attente depuis ${days} jour${days > 1 ? "s" : ""}`,
      dot: "bg-emerald-500",
    };
  };

  // Est-ce à l'utilisateur courant d'agir (étape PENDING qui lui est assignée) ?
  const isMyTurn = (doc: PendingDocument): boolean => {
    if (doc.status === "REVIEW_APPROVED") return doc.owner.id === user?.id;
    return !!doc.validationRequests?.[0]?.steps?.some((s) => s.assignedToId === user?.id);
  };

  const confirmApprove = async () => {
    if (!approveConfirm) return;
    const { docId } = approveConfirm;
    const doc = docs.find((d) => d.id === docId);
    setApproveConfirm(null);
    if (!doc) return;
    try {
      if (doc.status === "IN_REVIEW") {
        if (currentStepOf(doc) === "VERIFICATION") {
          await api.post(`/documents/${docId}/approve-verification`);
          toast.success("Vérification validée");
        } else {
          await api.post(`/documents/${docId}/approve-review`);
          toast.success("Revue technique approuvée");
        }
      } else if (doc.status === "PENDING_APPROVAL") {
        await api.post(`/documents/${docId}/approve`);
        toast.success(t("pending.approved"));
      } else if (doc.status === "REVIEW_APPROVED") {
        await api.post(`/documents/${docId}/request-approval`);
        toast.success("Approbation demandée");
      }
      fetchPending();
    } catch {
      toast.error(t("pending.approveError"));
    }
  };

  const handleQuickApprove = (e: React.MouseEvent, doc: PendingDocument) => {
    e.stopPropagation();
    const action =
      doc.status === "REVIEW_APPROVED"
        ? "lancer l'approbation de"
        : doc.status === "PENDING_APPROVAL"
          ? "approuver"
          : currentStepOf(doc) === "VERIFICATION"
            ? "valider la vérification de"
            : "valider la revue technique de";
    setApproveConfirm({ docId: doc.id, title: doc.title, action });
  };

  const handleQuickReject = async (e: React.MouseEvent, doc: PendingDocument) => {
    e.stopPropagation();
    const reason = window.prompt("Motif du rejet (10 caractères minimum) :");
    if (reason === null) return; // annulé
    const comment = reason || "Rejeté depuis la liste des tâches";
    try {
      if (doc.status === "IN_REVIEW") {
        const endpoint =
          currentStepOf(doc) === "VERIFICATION" ? "reject-verification" : "reject-review";
        await api.post(`/documents/${doc.id}/${endpoint}`, { comment });
        toast.success("Étape rejetée");
      } else if (doc.status === "PENDING_APPROVAL") {
        await api.post(`/documents/${doc.id}/reject`, { comment });
        toast.success("Document rejeté");
      }
      fetchPending();
    } catch {
      toast.error("Erreur lors du rejet");
    }
  };

  // Ligne compacte d'un rôle workflow, surlignée si c'est l'étape en cours.
  const RoleLine = ({
    label,
    person,
    active,
  }: {
    label: string;
    person?: Person | null;
    active: boolean;
  }) => {
    if (!person) return null;
    const isMe = person.id === user?.id;
    return (
      <div className="flex items-center gap-1.5">
        <span
          className={`w-[52px] shrink-0 text-[10px] uppercase tracking-wide ${
            active ? "text-primary font-semibold" : "text-seal-gray-500 dark:text-slate-500"
          }`}
        >
          {label}
        </span>
        <span
          className={`text-[11px] ${active ? "text-seal-navy dark:text-white font-semibold" : "text-seal-gray-500 dark:text-slate-400"}`}
        >
          {person.firstName} {person.lastName}
        </span>
        {active && isMe && (
          <span className="rounded-full bg-primary/10 text-primary text-[9px] font-semibold px-1.5 py-0.5">
            à vous d&apos;agir
          </span>
        )}
      </div>
    );
  };

  const columns: Column<PendingDocument>[] = [
    {
      key: "reference",
      header: t("pending.reference"),
      className: "w-32",
      render: (doc) => (
        <div className="flex items-center gap-2">
          {isUrgent(doc.updatedAt) && (
            <span title={t("pending.urgentTooltip")}>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
            </span>
          )}
          <span className="font-mono text-xs text-seal-navy dark:text-white font-semibold">
            {doc.reference}
          </span>
        </div>
      ),
    },
    {
      key: "title",
      header: t("pending.titleCol"),
      render: (doc) => (
        <div>
          <span className="text-sm font-semibold text-seal-navy dark:text-white">{doc.title}</span>
          <p className="text-[10px] text-seal-gray-500 dark:text-slate-400">
            {DOCUMENT_CATEGORY_LABELS[doc.category as keyof typeof DOCUMENT_CATEGORY_LABELS]} · par{" "}
            {doc.owner.firstName} {doc.owner.lastName}
          </p>
        </div>
      ),
    },
    {
      key: "workflow" as keyof PendingDocument,
      header: "Vérif. / Relect. / Approb.",
      className: "w-64",
      render: (doc) => {
        const step = currentStepOf(doc);
        return (
          <div className="flex flex-col gap-0.5">
            <RoleLine label="Vérif." person={doc.verifier} active={step === "VERIFICATION"} />
            <RoleLine label="Relect." person={doc.reviewer} active={step === "REVIEW"} />
            <RoleLine label="Approb." person={doc.approver} active={step === "APPROVAL"} />
            {!doc.verifier && !doc.reviewer && !doc.approver && (
              <span className="text-[11px] text-seal-gray-500 dark:text-slate-500">—</span>
            )}
          </div>
        );
      },
    },
    {
      key: "updatedAt",
      header: t("pending.modified"),
      className: "w-40",
      render: (doc) => {
        const urgency = getUrgencyConfig(doc.updatedAt);
        return (
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium w-fit ${urgency.color}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${urgency.dot}`} />
            {urgency.label}
          </span>
        );
      },
    },
    {
      key: "actions" as keyof PendingDocument,
      header: t("pending.actions"),
      className: "w-56",
      render: (doc) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            onClick={() => router.push(`/documents/${doc.id}`)}
            className="bg-primary hover:bg-primary/90 text-white"
          >
            <Eye className="h-3 w-3 mr-1" /> {t("pending.view")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => handleQuickApprove(e, doc)}
            className="text-green-600 border-green-200 hover:bg-green-50 dark:border-green-800 dark:hover:bg-green-900/20"
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {doc.status === "REVIEW_APPROVED"
              ? "Lancer"
              : doc.status === "PENDING_APPROVAL"
                ? t("pending.approve")
                : "Valider"}
          </Button>
          {doc.status !== "REVIEW_APPROVED" && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => handleQuickReject(e, doc)}
              className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
            >
              <XCircle className="h-3 w-3 mr-1" /> Rejeter
            </Button>
          )}
        </div>
      ),
    },
  ];

  const actionRequiredCount = currentDocs.filter(isMyTurn).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pending.title")}
        subtitle={t("pending.subtitle")}
        icon={ClipboardCheck}
        hub="work"
      />

      {/* Action required banner */}
      {!loading && actionRequiredCount > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-5 py-4 flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Votre action requise
              {user && (
                <span className="font-normal">
                  {" "}
                  — {user.firstName} {user.lastName}
                </span>
              )}
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              {actionRequiredCount} document{actionRequiredCount > 1 ? "s" : ""} en attente de votre
              intervention dans cet onglet.
            </p>
          </div>
        </div>
      )}

      {/* Stats bar */}
      {!loading && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-medium text-seal-navy dark:text-white">
                  {reviewDocs.length}
                </p>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                  Revue / vérification
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <UserCheck className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-medium text-seal-navy dark:text-white">
                  {approvalDocs.length}
                </p>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                  {t("pending.inApproval")}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-medium text-seal-navy dark:text-white">
                  {confirmDocs.length}
                </p>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">À confirmer</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <Tabs tabs={tabs} activeTab={activeTab} onChange={(id) => setActiveTab(id as TabId)} />
        <CardContent className="p-0">
          {currentDocs.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                <PartyPopper className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-lg font-medium text-seal-navy dark:text-white">
                {t("pending.allClear")}
              </p>
              <p className="text-sm text-seal-gray-500 dark:text-slate-400 mt-1 text-center max-w-sm">
                Aucun document en attente de votre intervention dans cet onglet.
              </p>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={currentDocs}
              keyExtractor={(doc) => doc.id}
              loading={loading}
              onRowClick={(doc) => router.push(`/documents/${doc.id}`)}
              emptyMessage="Aucun document"
            />
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={!!approveConfirm}
        onClose={() => setApproveConfirm(null)}
        onConfirm={confirmApprove}
        title="Confirmer l'action"
        description={
          approveConfirm
            ? `Êtes-vous sûr de vouloir ${approveConfirm.action} le document « ${approveConfirm.title} » ? Conseil : cliquez sur « Voir » pour vérifier le contenu avant.`
            : ""
        }
        variant="primary"
      />
    </div>
  );
}
