"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  Button,
  EmptyState,
  Skeleton,
} from "@omnitech/ui";
import { PageHeader } from "@/components/layout/page-header";
import { formatDate, formatRelativeTime } from "@/lib/utils";
import {
  PenLine,
  CheckCircle2,
  Clock,
  FileText,
  AlertTriangle,
  ExternalLink,
  Megaphone,
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { logger } from "@/lib/logger";

interface SignatureRequest {
  id: string;
  status: string;
  createdAt: string;
  signedAt: string | null;
  docusealSubmissionId: string | null;
  /**
   * Slug du submitter DocuSeal — c'est LUI qui construit l'URL de signature
   * (/s/:slug). Le submissionId numérique donne un 404. Fallback historique
   * possible (demandes créées avant la persistance du slug).
   */
  docusealSlug: string | null;
  documentVersion: {
    document: { id: string; title: string; reference: string };
  };
  requestedBy: { firstName: string; lastName: string };
  /**
   * Campagne d'origine si la demande a été générée par une campagne de
   * signature (une campagne = un générateur de SignatureRequest). `null`
   * pour une demande individuelle.
   */
  campaign: { id: string; title: string; dueAt: string | null } | null;
}

/**
 * URL de signature DocuSeal. Une signature engageante passe TOUJOURS par
 * DocuSeal : il n'existe plus de « signature au clic » côté intranet
 * (l'ancien PATCH /signatures/:id/sign est désactivé par défaut via
 * SIGNATURES_ALLOW_DIRECT=false et n'est plus exposé dans l'UI).
 *
 * DocuSeal sert le formulaire sur /s/:slug (slug du submitter). Le
 * submissionId numérique donne un 404 : on privilégie donc le slug, avec
 * repli sur le submissionId pour les demandes historiques sans slug persisté.
 */
function docusealUrl(sig: {
  docusealSlug: string | null;
  docusealSubmissionId: string | null;
}) {
  const base =
    process.env.NEXT_PUBLIC_DOCUSEAL_URL || "http://localhost:7000";
  return `${base}/s/${sig.docusealSlug || sig.docusealSubmissionId}`;
}

export default function MySignaturesPage() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<SignatureRequest[]>([]);
  const [completed, setCompleted] = useState<SignatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pending" | "signed" | "all">(
    "pending",
  );

  const fetchSignatures = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/signatures/my");
      setPending(data.pending || []);
      setCompleted(data.completed || []);
    } catch (err) {
      logger.error(err, { page: "signatures", context: "load" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSignatures();
  }, [fetchSignatures]);

  const signedCount = completed.filter((s) => s.status === "SIGNED").length;
  const rejectedCount = completed.filter((s) => s.status === "REJECTED").length;
  const totalCount = pending.length + completed.length;

  const displayedItems =
    activeTab === "pending"
      ? pending
      : activeTab === "signed"
        ? completed.filter((s) => s.status === "SIGNED")
        : [...pending, ...completed];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title={t("mySignatures.title")}
        subtitle={
          !loading
            ? `${pending.length} en attente · ${signedCount} signée${signedCount > 1 ? "s" : ""} · ${totalCount} au total`
            : t("mySignatures.subtitle")
        }
        icon={PenLine}
        hub="monEspace"
      />

      {/* Stats bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="shadow-sm rounded-xl">
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-medium text-amber-600">
              {pending.length}
            </p>
            <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">
              {t("signatures.pending")}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm rounded-xl">
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-medium text-emerald-600">
              {signedCount}
            </p>
            <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">
              {t("signatures.signed")}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-sm rounded-xl">
          <CardContent className="py-3 text-center">
            <p className="text-2xl font-medium text-seal-navy dark:text-white">
              {totalCount}
            </p>
            <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">
              {t("signatures.total")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border rounded-xl p-1 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
        {[
          {
            id: "pending" as const,
            label: `En attente (${pending.length})`,
            icon: Clock,
          },
          {
            id: "signed" as const,
            label: `Signees (${signedCount})`,
            icon: CheckCircle2,
          },
          {
            id: "all" as const,
            label: `Toutes (${totalCount})`,
            icon: FileText,
          },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition duration-200 ${
              activeTab === tab.id
                ? "bg-white dark:bg-slate-700 text-seal-navy dark:text-white shadow-sm"
                : "text-seal-gray-500 dark:text-slate-400 hover:text-seal-navy dark:hover:text-white"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Signature cards */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              className="h-28 rounded-xl dark:bg-slate-800 shimmer"
            />
          ))}
        </div>
      ) : displayedItems.length === 0 ? (
        <EmptyState
          type={
            activeTab === "pending" && totalCount > 0 ? "success" : "general"
          }
          title={
            activeTab === "pending"
              ? totalCount > 0
                ? t("mySignatures.noPending")
                : "Aucune signature"
              : "Aucune signature"
          }
          description={
            activeTab === "pending"
              ? totalCount > 0
                ? "Toutes vos signatures sont à jour. Les prochaines demandes de signature électronique (DocuSeal) apparaîtront ici automatiquement."
                : "Vous n’avez encore reçu aucune demande de signature. Lorsqu’un document nécessitera votre approbation, il s’affichera ici."
              : activeTab === "signed"
                ? "Aucun document signé pour le moment."
                : "Aucune signature trouvée pour ce filtre."
          }
        />
      ) : (
        <div className="space-y-3">
          {displayedItems.map((sig) => {
            const isPending =
              sig.status === "PENDING" ||
              (!sig.signedAt &&
                !sig.status?.includes("SIGNED") &&
                !sig.status?.includes("REJECTED"));
            const isSigned = sig.status === "SIGNED";
            const isRejected = sig.status === "REJECTED";
            return (
              <Card
                key={sig.id}
                className={`stagger-item shadow-sm rounded-xl ${isPending ? "border-l-4 border-l-amber-400" : isSigned ? "border-l-4 border-l-emerald-400" : isRejected ? "border-l-4 border-l-red-400" : ""}`}
              >
                <CardContent className="py-4 px-4">
                  <div className="flex flex-col sm:flex-row items-start gap-3">
                    <div
                      className={`mt-0.5 flex-shrink-0 p-2 rounded-lg ${isPending ? "bg-amber-50 dark:bg-amber-900/20" : isSigned ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-red-50 dark:bg-red-900/20"}`}
                    >
                      {isPending ? (
                        <PenLine className="h-4 w-4 text-amber-500" />
                      ) : isSigned ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Link
                          href={`/documents/${sig.documentVersion.document.id}`}
                          className="text-sm font-medium text-seal-navy dark:text-white hover:text-primary transition duration-200 line-clamp-1"
                        >
                          {sig.documentVersion.document.title}
                        </Link>
                        {isPending && (
                          <span className="flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                              En attente
                            </span>
                          </span>
                        )}
                        {isSigned && (
                          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" /> Signe
                          </span>
                        )}
                        {isRejected && (
                          <span className="flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400">
                            <AlertTriangle className="h-3 w-3" /> Refuse
                          </span>
                        )}
                        {sig.campaign && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                            title={`Demande issue de la campagne « ${sig.campaign.title} »`}
                          >
                            <Megaphone className="h-3 w-3" />
                            {sig.campaign.title}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-seal-gray-500 dark:text-slate-400">
                        <span className="font-mono">
                          {sig.documentVersion.document.reference}
                        </span>
                        <span>
                          {t("signatures.requestedBy")}{" "}
                          {sig.requestedBy.firstName} {sig.requestedBy.lastName}
                        </span>
                        <span>{formatRelativeTime(sig.createdAt)}</span>
                        {sig.signedAt && (
                          <span>Signe le {formatDate(sig.signedAt)}</span>
                        )}
                        {sig.campaign?.dueAt && !sig.signedAt && (
                          <span className="text-amber-600 dark:text-amber-400">
                            Échéance campagne : {formatDate(sig.campaign.dueAt)}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 mt-1">
                        {sig.docusealSubmissionId && (
                          <a
                            href={docusealUrl(sig)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" /> DocuSeal
                          </a>
                        )}
                        {/* Wave D — lien vers la page détail (preuve eIDAS-AES) */}
                        <Link
                          href={`/signatures/${sig.id}`}
                          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                        >
                          <FileText className="h-3 w-3" /> Détail / Preuve
                        </Link>
                      </div>
                    </div>
                    {/* Signature engageante = DocuSeal uniquement. Si la
                        demande n'a pas de submission (cas résiduel d'avant la
                        refonte), on l'indique au lieu de proposer un clic
                        sans valeur probante. */}
                    {isPending &&
                      (sig.docusealSubmissionId ? (
                        <Button
                          onClick={() =>
                            window.open(
                              docusealUrl(sig),
                              "_blank",
                              "noopener,noreferrer",
                            )
                          }
                          className="flex-shrink-0 w-full sm:w-auto transition duration-200 min-h-[44px]"
                        >
                          <PenLine className="h-4 w-4" /> Signer sur DocuSeal
                        </Button>
                      ) : (
                        <span className="flex-shrink-0 text-[11px] text-amber-600 dark:text-amber-400 max-w-[200px]">
                          Signature indisponible : aucune soumission DocuSeal
                          rattachée. Contactez le demandeur.
                        </span>
                      ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

    </div>
  );
}
