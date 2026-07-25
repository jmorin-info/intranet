"use client";

import React, { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, Button, StatusBadge, Badge, Skeleton } from "@omnitech/ui";
import {
  ArrowLeft,
  ChevronDown,
  Edit,
  Download,
  Eye,
  UserCheck,
  PenLine,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  Printer,
  Link2,
  ArrowLeftRight,
  BookOpen,
  Sparkles,
  Send,
} from "lucide-react";
import { isRoleAtLeast, UserRole, DOCUMENT_CATEGORY_LABELS } from "@omnitech/shared";
import type { AuthUser } from "@/stores/auth-store";
import { BookmarkButton } from "@/components/bookmark-button";
import { useOfficeAvailability, OFFICE_MAINTENANCE_MESSAGE } from "@/hooks/use-office-availability";
import { formatDate } from "@/lib/utils";
import { buildDocumentFilename } from "@/lib/download";
import {
  STATUS_BAR_COLOR,
  classificationClasses,
  authenticatedDownload,
  type ReviewDeadlineInfo,
} from "./helpers";
import type { DocumentDetail, DocumentVersion } from "./types";

interface DocumentHeaderProps {
  doc: DocumentDetail;
  currentVersion?: DocumentVersion;
  user: AuthUser;
  transitions: readonly string[];
  canEdit: boolean;
  canAnalyze: boolean;
  canOpenReadingMode: boolean;
  analyzing: boolean;
  reviewInfo: ReviewDeadlineInfo | null;
  aiSummaryLoading: boolean;
  aiSummaryStageLabel?: string | null;
  aiAnswerStageLabel?: string | null;
  onAction: (action: string) => void;
  onIsoAnalysis: () => void;
  onAiSummary: () => void;
  onOpenReadingMode: () => void;
  onOpenObsoleteDialog: () => void;
  onOpenArchiveDialog: () => void;
  onOpenDeleteDialog: () => void;
  onTogglePublic: () => void;
  aiQuestion: string;
  aiQuestionOpen: boolean;
  aiAnswer: string | null;
  aiAnswerSources: Array<{ title?: string; reference?: string }>;
  aiAnswerLoading: boolean;
  onToggleAiQuestion: () => void;
  onAiQuestionChange: (v: string) => void;
  onAskAi: () => void;
}

export function DocumentHeader({
  doc,
  currentVersion,
  user,
  transitions,
  canEdit,
  canAnalyze,
  canOpenReadingMode,
  analyzing,
  reviewInfo,
  aiSummaryLoading,
  aiSummaryStageLabel,
  aiAnswerStageLabel,
  onAction,
  onIsoAnalysis,
  onAiSummary,
  onOpenReadingMode,
  onOpenObsoleteDialog,
  onOpenArchiveDialog,
  onOpenDeleteDialog,
  onTogglePublic,
  aiQuestion,
  aiQuestionOpen,
  aiAnswer,
  aiAnswerSources,
  aiAnswerLoading,
  onToggleAiQuestion,
  onAiQuestionChange,
  onAskAi,
}: DocumentHeaderProps) {
  const router = useRouter();
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  // Disponibilité dynamique de l'éditeur OnlyOffice (bouton désactivé si le
  // Docs Server est en maintenance, au lieu d'envoyer vers un éditeur cassé)
  const { officeDown } = useOfficeAvailability();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <Card className="shadow-sm rounded-xl overflow-hidden">
      <div className={`h-1 ${STATUS_BAR_COLOR[doc.status] || "bg-gray-300"}`} />
      <div className="p-5 space-y-3">
        {/* Line 1: Back + Reference + Classification + Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="rounded-lg p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors duration-200"
              aria-label="Revenir à la page précédente"
            >
              <ArrowLeft className="h-4 w-4 text-seal-gray-500 dark:text-slate-400" />
            </button>
            <span className="font-mono text-[11px] text-seal-gray-500 dark:text-slate-400">
              {doc.reference}
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${classificationClasses(doc.classification)}`}
            >
              {doc.classification || "INTERNE"}
            </span>
            {/* Inline status dropdown */}
            <div ref={statusDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => transitions.length > 0 && setStatusDropdownOpen((o) => !o)}
                className={`inline-flex items-center gap-1 transition ${transitions.length > 0 ? "cursor-pointer hover:ring-2 hover:ring-primary/30 rounded-full" : "cursor-default"}`}
              >
                <StatusBadge
                  status={
                    doc.status as
                      | "DRAFT"
                      | "IN_REVIEW"
                      | "REVIEW_APPROVED"
                      | "PENDING_APPROVAL"
                      | "APPROVED"
                      | "OBSOLETE"
                      | "ARCHIVED"
                  }
                />
                {transitions.length > 0 && (
                  <ChevronDown
                    className={`h-3 w-3 text-seal-gray-500 dark:text-slate-400 transition-transform ${statusDropdownOpen ? "rotate-180" : ""}`}
                  />
                )}
              </button>
              {statusDropdownOpen && (
                <div className="absolute left-0 top-full mt-1 z-50 w-64 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1 animate-fade-in-up">
                  {doc.status === "DRAFT" && transitions.includes("IN_REVIEW") && (
                    <button
                      type="button"
                      onClick={() => {
                        setStatusDropdownOpen(false);
                        onAction("submit-review");
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition"
                    >
                      <Eye className="h-3.5 w-3.5 text-blue-500" />
                      <span className="text-seal-navy dark:text-white">Soumettre en revue</span>
                    </button>
                  )}
                  {/* ADMIN+ shortcut */}
                  {isRoleAtLeast(user.role, UserRole.ADMIN) &&
                    doc.status !== "APPROVED" &&
                    doc.status !== "OBSOLETE" &&
                    doc.status !== "ARCHIVED" && (
                      <>
                        <div className="my-1 border-t border-gray-100 dark:border-slate-800" />
                        <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-seal-gray-500 dark:text-slate-400 font-semibold">
                          Actions admin
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setStatusDropdownOpen(false);
                            if (
                              confirm(
                                "Publier ce document directement ? Les workflows pending seront annulés.",
                              )
                            ) {
                              onAction("force-approve");
                            }
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 transition"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-amber-600" />
                          <span className="text-seal-navy dark:text-white">
                            Publier directement
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStatusDropdownOpen(false);
                            if (
                              confirm(
                                "Publier + marquer permanent ? La date de revue sera supprimée.",
                              )
                            ) {
                              onAction("force-approve-permanent");
                            }
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 transition"
                        >
                          <Shield className="h-3.5 w-3.5 text-amber-600" />
                          <span className="text-seal-navy dark:text-white">
                            Publier + permanent
                          </span>
                        </button>
                        <div className="my-1 border-t border-gray-100 dark:border-slate-800" />
                      </>
                    )}
                  {doc.status === "IN_REVIEW" && transitions.includes("REVIEW_APPROVED") && (
                    <button
                      type="button"
                      disabled={!doc.approver}
                      onClick={() => {
                        setStatusDropdownOpen(false);
                        onAction("approve-review");
                      }}
                      title={
                        !doc.approver
                          ? "Assignez d'abord un approbateur final (bouton 'Modifier')"
                          : undefined
                      }
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-seal-navy dark:text-white">Valider la revue</span>
                      {!doc.approver && (
                        <span className="ml-auto text-[10px] text-seal-gray-500 dark:text-slate-400">
                          (approbateur requis)
                        </span>
                      )}
                    </button>
                  )}
                  {doc.status === "IN_REVIEW" && (
                    <button
                      type="button"
                      onClick={() => {
                        setStatusDropdownOpen(false);
                        onAction("reject-review");
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition"
                    >
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                      <span className="text-seal-navy dark:text-white">Rejeter la revue</span>
                    </button>
                  )}
                  {doc.status === "REVIEW_APPROVED" && user.id === doc.owner.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setStatusDropdownOpen(false);
                        onAction("request-approval");
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-seal-navy dark:text-white">Demander approbation</span>
                    </button>
                  )}
                  {doc.status === "PENDING_APPROVAL" && transitions.includes("APPROVED") && (
                    <button
                      type="button"
                      onClick={() => {
                        setStatusDropdownOpen(false);
                        onAction("approve-direction");
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-seal-navy dark:text-white">Approuver (Direction)</span>
                    </button>
                  )}
                  {doc.status === "PENDING_APPROVAL" && (
                    <button
                      type="button"
                      onClick={() => {
                        setStatusDropdownOpen(false);
                        onAction("reject-direction");
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition"
                    >
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                      <span className="text-seal-navy dark:text-white">Refuser</span>
                    </button>
                  )}
                  {doc.status === "APPROVED" && transitions.includes("OBSOLETE") && (
                    <button
                      type="button"
                      onClick={() => {
                        setStatusDropdownOpen(false);
                        onOpenObsoleteDialog();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      <span className="text-seal-navy dark:text-white">Marquer obsolete</span>
                    </button>
                  )}
                  {transitions.includes("ARCHIVED") && (
                    <button
                      type="button"
                      onClick={() => {
                        setStatusDropdownOpen(false);
                        onOpenArchiveDialog();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition"
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5 text-gray-400 dark:text-slate-500" />
                      <span className="text-seal-navy dark:text-white">Archiver</span>
                    </button>
                  )}
                </div>
              )}
            </div>
            <BookmarkButton
              type="document"
              id={doc.id}
              title={doc.title}
              href={`/documents/${doc.id}`}
            />
          </div>
          {/* Actions aligned right */}
          <div className="flex items-center gap-2 flex-wrap justify-end no-print">
            {currentVersion && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  authenticatedDownload(
                    `/documents/${doc.id}/versions/${currentVersion.id}/download`,
                    buildDocumentFilename(
                      doc.reference,
                      currentVersion.versionNumber,
                      currentVersion.fileType,
                      currentVersion.fileUrl,
                    ),
                    true,
                  )
                }
              >
                <Download className="h-3.5 w-3.5" />
                Télécharger
              </Button>
            )}
            {canEdit && doc.status === "DRAFT" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/documents/${doc.id}/edit`)}
              >
                <Edit className="h-3.5 w-3.5" />
                Modifier
              </Button>
            )}
            {canOpenReadingMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenReadingMode}
                title="Mode lecture plein ecran"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Lecture
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={onAiSummary}
              disabled={aiSummaryLoading}
              title="Générer un résumé intelligent du document via l'IA OMNITECH"
              className="gap-2"
            >
              <Sparkles className={`h-4 w-4 ${aiSummaryLoading ? "animate-spin" : ""}`} />
              {aiSummaryLoading ? (aiSummaryStageLabel ?? "Analyse en cours…") : "Résumé IA"}
            </Button>
            {/* Stirling PDF / OnlyOffice */}
            {currentVersion &&
              (() => {
                const fileUrl = (currentVersion.fileUrl || "").toLowerCase();
                const fileType = (currentVersion.fileType || "").toLowerCase();
                const extMatch = fileUrl.match(/\.([a-z0-9]+)(\?|$|\/)/);
                const extension = extMatch && extMatch[1] ? extMatch[1] : "";
                const isPdfFile = extension === "pdf" || fileType.includes("pdf");
                const isOfficeDoc =
                  /^(docx?|xlsx?|pptx?|odt|ods|odp|txt|csv|rtf)$/.test(extension) ||
                  [
                    "word",
                    "excel",
                    "powerpoint",
                    "officedocument",
                    "opendocument",
                    "text/plain",
                    "text/csv",
                    "application/rtf",
                    "msword",
                  ].some((m) => fileType.includes(m));

                if (isPdfFile) {
                  return (
                    <div className="relative group">
                      <div className="flex">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            router.push(`/tools/pdf?doc=${doc.id}&version=${currentVersion.id}`)
                          }
                          title="Outils PDF avancés (merge, split, OCR, compression, filigrane)"
                          className="rounded-r-none"
                        >
                          <Edit className="h-3.5 w-3.5" />
                          Outils PDF
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="rounded-l-none border-l px-1.5"
                          title="Plus d'actions PDF"
                          aria-label="Plus d'actions PDF"
                        >
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </Button>
                      </div>
                      <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-50 hidden group-hover:block">
                        {[
                          { label: "Fusionner avec...", path: "/merge-pdfs" },
                          { label: "Compresser", path: "/compress-pdf" },
                          {
                            label: "OCR (reconnaissance texte)",
                            path: "/ocr-pdf",
                          },
                          {
                            label: "Ajouter filigrane",
                            path: "/add-watermark",
                          },
                        ].map((tool) => (
                          <button
                            key={tool.path}
                            type="button"
                            className="w-full text-left px-3 py-2 text-xs text-seal-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-seal-navy dark:hover:text-white first:rounded-t-lg last:rounded-b-lg transition-colors duration-200"
                            onClick={() =>
                              router.push(`/tools/pdf?doc=${doc.id}&version=${currentVersion.id}`)
                            }
                          >
                            {tool.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }
                if (isOfficeDoc) {
                  const e = extension.toLowerCase();
                  let formatLabel = "OnlyOffice";
                  let formatColor = "text-primary";
                  if (/^docx?$/.test(e) || e === "odt" || e === "rtf") {
                    formatLabel = "OnlyOffice · Word";
                    formatColor = "text-blue-600";
                  } else if (/^xlsx?$/.test(e) || e === "ods" || e === "csv") {
                    formatLabel = "OnlyOffice · Excel";
                    formatColor = "text-emerald-600";
                  } else if (/^pptx?$/.test(e) || e === "odp") {
                    formatLabel = "OnlyOffice · PowerPoint";
                    formatColor = "text-orange-600";
                  }
                  return (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={officeDown}
                      onClick={() => router.push(`/documents/${doc.id}/editor`)}
                      title={
                        officeDown
                          ? OFFICE_MAINTENANCE_MESSAGE
                          : `Ouvrir dans l'editeur ${formatLabel}`
                      }
                    >
                      <Edit className="h-3.5 w-3.5" />
                      <span className={`text-[10px] ${formatColor}`}>
                        {officeDown ? OFFICE_MAINTENANCE_MESSAGE : formatLabel}
                      </span>
                    </Button>
                  );
                }
                return null;
              })()}
            <Button
              variant="outline"
              size="sm"
              className="no-print"
              onClick={() => {
                if (currentVersion?.id) {
                  const w = window.open(
                    `/api/v1/documents/${doc.id}/download?inline=true`,
                    "_blank",
                  );
                  if (w) w.focus();
                } else {
                  window.print();
                }
              }}
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimer
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const url = `${window.location.origin}/documents/${doc.id}`;
                navigator.clipboard
                  ?.writeText(url)
                  .then(() => toast.success("Lien copie"))
                  .catch(() => toast.error("Impossible de copier"));
              }}
            >
              <Link2 className="h-3 w-3" /> Partager
            </Button>
            {canAnalyze && (
              <Button variant="outline" size="sm" onClick={onIsoAnalysis} loading={analyzing}>
                <Shield className="h-3.5 w-3.5" />
                ISO
              </Button>
            )}
            {isRoleAtLeast(user.role, UserRole.ADMIN) && (
              <Button
                variant={doc.isPublic ? "primary" : "outline"}
                size="sm"
                onClick={onTogglePublic}
              >
                <Eye className="h-3 w-3" />
                {doc.isPublic ? "Public" : "Public"}
              </Button>
            )}
            {(isRoleAtLeast(user.role, UserRole.ADMIN) || doc.owner.id === user.id) && (
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 border-red-200 hover:bg-red-50"
                onClick={onOpenDeleteDialog}
              >
                <XCircle className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Line 2: Title + Ask AI */}
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-medium text-seal-navy dark:text-white">{doc.title}</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleAiQuestion}
            className="gap-1.5 text-xs"
            title="Poser une question à l'IA sur ce document"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Poser une question
          </Button>
        </div>

        {/* AI Question inline panel */}
        {aiQuestionOpen && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 dark:bg-primary/10 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-seal-navy dark:text-white">
                Question sur ce document
              </span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={aiQuestion}
                onChange={(e) => onAiQuestionChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !aiAnswerLoading) onAskAi();
                }}
                placeholder="Ex: Quels sont les contrôles ISO couverts ?"
                className="flex-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-seal-navy dark:text-white placeholder:text-seal-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/40"
                disabled={aiAnswerLoading}
              />
              <Button
                size="sm"
                onClick={onAskAi}
                disabled={aiAnswerLoading || !aiQuestion.trim()}
                className="gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                {aiAnswerLoading ? "Analyse…" : "Envoyer"}
              </Button>
            </div>
            {/* Attente lisible : tant qu'aucun token n'est arrivé, on montre
                l'étape en cours (Recherche… / Rédaction…) puis un skeleton. */}
            {aiAnswerLoading && !aiAnswer && (
              <div className="space-y-2">
                {aiAnswerStageLabel && (
                  <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                    {aiAnswerStageLabel}
                  </p>
                )}
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            )}
            {aiAnswer && (
              <div className="rounded-lg bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 p-3 space-y-2">
                <p className="text-sm leading-relaxed text-seal-navy dark:text-slate-200 whitespace-pre-wrap">
                  {aiAnswer}
                  {aiAnswerLoading && <span className="ml-0.5 animate-pulse">▋</span>}
                </p>
                {aiAnswerSources.length > 0 && (
                  <div className="pt-2 border-t border-gray-100 dark:border-slate-700">
                    <p className="text-[10px] font-semibold text-seal-gray-500 dark:text-slate-400 mb-1">
                      Sources
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {aiAnswerSources.map((src, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5"
                        >
                          {src.title || src.reference || `Source ${idx + 1}`}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Line 3: Inline metadata */}
        <div className="flex items-center gap-4 flex-wrap text-[11px] text-seal-gray-500 dark:text-slate-400">
          <span>
            Proprietaire :{" "}
            <span className="text-seal-navy dark:text-white font-medium">
              {doc.owner.firstName} {doc.owner.lastName}
            </span>
          </span>
          <span className="hidden sm:inline text-gray-300 dark:text-slate-600">|</span>
          <span>
            Categorie :{" "}
            <Badge variant="navy" className="text-[10px] ml-0.5">
              {DOCUMENT_CATEGORY_LABELS[doc.category as keyof typeof DOCUMENT_CATEGORY_LABELS]}
            </Badge>
          </span>
          <span className="hidden sm:inline text-gray-300 dark:text-slate-600">|</span>
          <span>
            Mis à jour :{" "}
            <span className="text-seal-navy dark:text-white font-medium">
              {formatDate(doc.updatedAt)}
            </span>
          </span>
          {reviewInfo && (
            <>
              <span className="hidden sm:inline text-gray-300 dark:text-slate-600">|</span>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${reviewInfo.bg} ${reviewInfo.color}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${reviewInfo.dot}`} />
                Revision {reviewInfo.text}
              </span>
            </>
          )}
          {doc.nextReviewDate && new Date(doc.nextReviewDate).getTime() < Date.now() && (
            <>
              <span className="hidden sm:inline text-gray-300 dark:text-slate-600">|</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#892034]/15 dark:bg-red-900/30 px-3 py-1 text-[11px] font-bold text-[#892034] dark:text-red-400 animate-pulse">
                <AlertTriangle className="h-3.5 w-3.5" />
                Revision en retard
              </span>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
