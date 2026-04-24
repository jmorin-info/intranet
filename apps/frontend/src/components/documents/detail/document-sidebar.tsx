"use client";

import React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Card,
  CardContent,
  CardHeader,
  CardFooter,
  Button,
  StatusBadge,
  Badge,
  WorkflowTimeline,
  Skeleton,
} from "@omnitech/ui";
import type { WorkflowStep } from "@omnitech/ui";
import {
  Eye,
  UserCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Shield,
  PenLine,
  History,
  BookOpen,
} from "lucide-react";
import { DOCUMENT_CATEGORY_LABELS } from "@omnitech/shared";
import { formatDate } from "@/lib/utils";
import type {
  DocumentDetail,
  DocumentVersion,
  SignatureData,
  AcknowledgmentData,
  RelatedDoc,
} from "./types";
import { classificationClasses, type ReviewDeadlineInfo } from "./helpers";

const WorkflowPanel = dynamic(
  () =>
    import("@/components/documents/workflow-panel").then(
      (m) => m.WorkflowPanel,
    ),
  {
    ssr: false,
    loading: () => <div className="shimmer h-20 rounded" />,
  },
);

interface DocumentSidebarProps {
  doc: DocumentDetail;
  currentVersion?: DocumentVersion;
  versions: DocumentVersion[];
  signatures: SignatureData[];
  acks: AcknowledgmentData[];
  workflowSteps: WorkflowStep[];
  transitions: readonly string[];
  canEdit: boolean;
  isOwner: boolean;
  currentUserId?: string;
  actionLoading: boolean;
  reviewInfo: ReviewDeadlineInfo | null;
  relatedDocs: RelatedDoc[];
  ragRelatedDocs: RelatedDoc[];
  ragRelatedLoading: boolean;
  onAction: (action: string) => void;
  onOpenObsoleteDialog: () => void;
  onOpenArchiveDialog: () => void;
}

export function DocumentSidebar({
  doc,
  currentVersion,
  versions,
  signatures,
  acks,
  workflowSteps,
  transitions,
  canEdit,
  isOwner,
  currentUserId,
  actionLoading,
  reviewInfo,
  relatedDocs,
  ragRelatedDocs,
  ragRelatedLoading,
  onAction,
  onOpenObsoleteDialog,
  onOpenArchiveDialog,
}: DocumentSidebarProps) {
  const isos = doc.isoControls || [];

  // Merge relatedDocs and RAG similarity, deduplicate by id, max 4
  const seen = new Set<string>();
  const merged: RelatedDoc[] = [];
  for (const rd of relatedDocs) {
    if (!seen.has(rd.id)) {
      seen.add(rd.id);
      merged.push(rd);
    }
  }
  for (const rd of ragRelatedDocs) {
    if (!seen.has(rd.id) && merged.length < 4) {
      seen.add(rd.id);
      merged.push(rd);
    }
  }

  return (
    <div className="space-y-3">
      {/* Workflow (vertical, compact) */}
      <Card className="shadow-sm rounded-xl">
        <CardHeader>
          <h3 className="text-sm font-medium text-seal-navy dark:text-white">
            Cycle de vie
          </h3>
        </CardHeader>
        <CardContent>
          <WorkflowTimeline steps={workflowSteps} />
        </CardContent>

        {transitions.length > 0 && (
          <CardFooter>
            <div className="space-y-2">
              {doc.status === "DRAFT" && transitions.includes("IN_REVIEW") && (
                <Button
                  className="w-full"
                  onClick={() => onAction("submit-review")}
                  loading={actionLoading}
                >
                  <Eye className="h-4 w-4" />
                  Soumettre pour revue
                </Button>
              )}
              {doc.status === "IN_REVIEW" &&
                transitions.includes("REVIEW_APPROVED") && (
                  <Button
                    className="w-full"
                    onClick={() => onAction("approve-review")}
                    loading={actionLoading}
                  >
                    <UserCheck className="h-4 w-4" />
                    Valider la revue technique
                  </Button>
                )}
              {doc.status === "REVIEW_APPROVED" && isOwner && (
                <>
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 text-xs text-emerald-700 dark:text-emerald-300">
                    La revue a été validée par le réviseur. Vous pouvez prendre
                    en compte les retours puis lancer la demande
                    d&apos;approbation finale.
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => onAction("request-approval")}
                    loading={actionLoading}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Demander l&apos;approbation
                  </Button>
                </>
              )}
              {doc.status === "REVIEW_APPROVED" && !isOwner && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-300">
                  Revue validée — en attente que le rédacteur lance la demande
                  d&apos;approbation.
                </div>
              )}
              {doc.status === "PENDING_APPROVAL" &&
                transitions.includes("APPROVED") && (
                  <Button
                    className="w-full"
                    onClick={() => onAction("approve-direction")}
                    loading={actionLoading}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Valider (Direction)
                  </Button>
                )}
              {doc.status === "IN_REVIEW" && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => onAction("reject-review")}
                  loading={actionLoading}
                >
                  <XCircle className="h-4 w-4" />
                  Rejeter la revue
                </Button>
              )}
              {doc.status === "PENDING_APPROVAL" && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => onAction("reject-direction")}
                  loading={actionLoading}
                >
                  <XCircle className="h-4 w-4" />
                  Refuser (Direction)
                </Button>
              )}
              {doc.status === "APPROVED" &&
                transitions.includes("OBSOLETE") && (
                  <Button
                    variant="danger"
                    className="w-full"
                    onClick={onOpenObsoleteDialog}
                  >
                    <AlertTriangle className="h-4 w-4" />
                    Marquer obsolète
                  </Button>
                )}
              {transitions.includes("ARCHIVED") && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={onOpenArchiveDialog}
                >
                  <History className="h-4 w-4" />
                  Archiver
                </Button>
              )}
            </div>
          </CardFooter>
        )}
      </Card>

      {/* Multi-reviewer approval workflow (configurable) */}
      {currentVersion && (
        <div id="workflow" className="scroll-mt-20">
          <WorkflowPanel
            documentId={doc.id}
            currentVersionId={currentVersion.id}
            canStartWorkflow={canEdit}
            documentCategory={doc.category}
          />
        </div>
      )}

      {/* Document Metadata */}
      <Card className="shadow-sm rounded-xl">
        <CardHeader>
          <h3 className="text-sm font-medium text-seal-navy dark:text-white">
            Métadonnées
          </h3>
        </CardHeader>
        <CardContent className="space-y-2.5 text-[11px]">
          <div className="flex justify-between items-start">
            <span className="text-seal-gray-500 dark:text-slate-400">
              Référence
            </span>
            <span className="font-mono font-semibold text-seal-navy dark:text-white">
              {doc.reference}
            </span>
          </div>
          <div className="flex justify-between items-start">
            <span className="text-seal-gray-500 dark:text-slate-400">
              Catégorie
            </span>
            <Badge variant="navy">
              {
                DOCUMENT_CATEGORY_LABELS[
                  doc.category as keyof typeof DOCUMENT_CATEGORY_LABELS
                ]
              }
            </Badge>
          </div>
          <div className="flex justify-between items-start">
            <span className="text-seal-gray-500 dark:text-slate-400">
              Classification
            </span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${classificationClasses(doc.classification)}`}
            >
              {doc.classification || "INTERNE"}
            </span>
          </div>
          <div className="border-t border-gray-100 dark:border-slate-700 pt-2" />
          <div className="flex justify-between items-start">
            <span className="text-seal-gray-500 dark:text-slate-400">
              Propriétaire
            </span>
            <span className="text-seal-navy dark:text-white font-medium">
              {doc.owner.firstName} {doc.owner.lastName}
            </span>
          </div>
          {doc.reviewer && (
            <div className="flex justify-between items-start">
              <span className="text-seal-gray-500 dark:text-slate-400">
                Réviseur
              </span>
              <span className="text-seal-navy dark:text-white font-medium">
                {doc.reviewer.firstName} {doc.reviewer.lastName}
              </span>
            </div>
          )}
          {doc.approver && (
            <div className="flex justify-between items-start">
              <span className="text-seal-gray-500 dark:text-slate-400">
                Approbateur
              </span>
              <span className="text-seal-navy dark:text-white font-medium">
                {doc.approver.firstName} {doc.approver.lastName}
              </span>
            </div>
          )}
          <div className="border-t border-gray-100 dark:border-slate-700 pt-2" />
          <div className="flex justify-between items-start">
            <span className="text-seal-gray-500 dark:text-slate-400">
              Créé le
            </span>
            <span className="text-seal-navy dark:text-white">
              {formatDate(doc.createdAt)}
            </span>
          </div>
          <div className="flex justify-between items-start">
            <span className="text-seal-gray-500 dark:text-slate-400">
              Modifié le
            </span>
            <span className="text-seal-navy dark:text-white">
              {formatDate(doc.updatedAt)}
            </span>
          </div>
          {doc.nextReviewDate && (
            <div className="flex justify-between items-start">
              <span className="text-seal-gray-500 dark:text-slate-400">
                Prochaine révision
              </span>
              <span
                className={`font-semibold ${reviewInfo?.color || "text-seal-navy dark:text-white"}`}
              >
                {formatDate(doc.nextReviewDate)}
              </span>
            </div>
          )}
          <div className="flex justify-between items-start">
            <span className="text-seal-gray-500 dark:text-slate-400">
              Visibilité
            </span>
            <span
              className={`font-semibold ${doc.isPublic ? "text-emerald-600 dark:text-emerald-400" : "text-seal-gray-500 dark:text-slate-400"}`}
            >
              {doc.isPublic ? "Public" : "Privé"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ISO Controls linked */}
      {isos.length > 0 && (
        <Card className="shadow-sm rounded-xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-seal-navy dark:text-white">
                <Shield className="inline h-3.5 w-3.5 mr-1.5" />
                Controles ISO
              </h3>
              <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-primary/10 text-primary text-[10px] font-bold px-1.5">
                {isos.length}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {isos.map(({ isoControl }) => {
              const annexLetter = isoControl.code.match(/^A\.(\d+)/)?.[1];
              const domainColors: Record<string, string> = {
                "5": "border-l-blue-500 bg-blue-50/50 dark:bg-blue-900/10",
                "6": "border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/10",
                "7": "border-l-purple-500 bg-purple-50/50 dark:bg-purple-900/10",
                "8": "border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10",
              };
              const colorClass =
                (annexLetter && domainColors[annexLetter]) ||
                "border-l-gray-400 bg-gray-50/50 dark:bg-slate-800/50";
              return (
                <div
                  key={isoControl.id}
                  className={`rounded-lg border-l-[3px] p-2.5 ${colorClass} transition-colors`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-primary bg-primary/10 rounded px-1.5 py-0.5 flex-shrink-0">
                      {isoControl.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-700 dark:text-slate-300 leading-relaxed mt-1">
                    {isoControl.titleFr || isoControl.title}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Signature status summary */}
      {signatures.length > 0 && (
        <Card className="shadow-sm rounded-xl">
          <CardHeader>
            <h3 className="text-sm font-medium text-seal-navy dark:text-white">
              <PenLine className="inline h-3.5 w-3.5 mr-1.5" />
              Signatures
            </h3>
          </CardHeader>
          <CardContent>
            {(() => {
              const signed = signatures.filter(
                (s) => s.status === "SIGNED",
              ).length;
              const total = signatures.length;
              const pending = signatures.filter(
                (s) => s.status === "PENDING",
              ).length;
              const rejected = signatures.filter(
                (s) => s.status === "REJECTED",
              ).length;
              const pct = total > 0 ? Math.round((signed / total) * 100) : 0;
              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-seal-navy dark:text-white">
                      {signed} / {total}
                    </span>
                    <span className="text-xs text-seal-gray-500 dark:text-slate-400">
                      {pct}% signées
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex gap-3 text-[10px]">
                    {pending > 0 && (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">
                        {pending} en attente
                      </span>
                    )}
                    {rejected > 0 && (
                      <span className="text-red-600 dark:text-red-400 font-semibold">
                        {rejected} refusées
                      </span>
                    )}
                    {signed > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        {signed} signées
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <Card className="shadow-sm rounded-xl">
        <CardHeader>
          <h3 className="text-sm font-medium text-seal-navy dark:text-white">
            Statistiques
          </h3>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-seal-gray-500 dark:text-slate-400">
              Versions
            </span>
            <span className="text-sm font-semibold text-seal-navy dark:text-white">
              {versions.length}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-seal-gray-500 dark:text-slate-400">
              Signatures électroniques
            </span>
            <span className="text-sm font-semibold text-seal-navy dark:text-white">
              {signatures.length}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-seal-gray-500 dark:text-slate-400">
              Lectures confirmées
            </span>
            <span className="text-sm font-semibold text-seal-navy dark:text-white">
              {acks.length}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-seal-gray-500 dark:text-slate-400">
              Contrôles ISO
            </span>
            <span className="text-sm font-semibold text-seal-navy dark:text-white">
              {isos.length}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Related Documents (combined: endpoint + RAG similarity) */}
      {ragRelatedLoading && (
        <Card className="shadow-sm rounded-xl">
          <CardHeader>
            <h3 className="text-sm font-medium text-seal-navy dark:text-white">
              <BookOpen className="inline h-3.5 w-3.5 mr-1.5" />
              Documents liés
            </h3>
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </CardContent>
        </Card>
      )}
      {!ragRelatedLoading && merged.length > 0 && (
        <Card className="shadow-sm rounded-xl">
          <CardHeader>
            <h3 className="text-sm font-medium text-seal-navy dark:text-white">
              <BookOpen className="inline h-3.5 w-3.5 mr-1.5" />
              Documents liés
            </h3>
          </CardHeader>
          <CardContent className="space-y-2">
            {merged.slice(0, 4).map((rd) => (
              <Link
                key={rd.id}
                href={`/documents/${rd.id}`}
                className="block rounded-lg border border-gray-100 dark:border-slate-700 p-2.5 hover:border-primary/50 hover:bg-primary/5 transition-all"
              >
                <p className="text-xs font-semibold text-seal-navy dark:text-white line-clamp-1">
                  {rd.title}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-[10px] text-seal-gray-500 dark:text-slate-400">
                    {rd.reference}
                  </span>
                  <StatusBadge
                    status={
                      rd.status as
                        | "DRAFT"
                        | "IN_REVIEW"
                        | "PENDING_APPROVAL"
                        | "APPROVED"
                        | "OBSOLETE"
                        | "ARCHIVED"
                    }
                  />
                </div>
                {rd.category && (
                  <span className="text-[10px] text-seal-gray-500 dark:text-slate-400 mt-1 block">
                    {DOCUMENT_CATEGORY_LABELS[
                      rd.category as keyof typeof DOCUMENT_CATEGORY_LABELS
                    ] || rd.category}
                  </span>
                )}
                {rd.isoControls && rd.isoControls.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {rd.isoControls.slice(0, 2).map(({ isoControl }) => (
                      <span
                        key={isoControl.code}
                        className="text-[9px] font-mono bg-primary/10 text-primary rounded px-1 py-0.5"
                      >
                        {isoControl.code}
                      </span>
                    ))}
                    {rd.isoControls.length > 2 && (
                      <span className="text-[9px] text-seal-gray-500 dark:text-slate-400">
                        +{rd.isoControls.length - 2}
                      </span>
                    )}
                  </div>
                )}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
      {/* Note: currentUserId kept in props for future extensibility */}
      {currentUserId && null}
    </div>
  );
}
