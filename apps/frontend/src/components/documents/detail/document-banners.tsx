"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@omnitech/ui";
import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import type { DocumentDetail } from "./types";

// --- Banner : Approbateur manquant quand IN_REVIEW ---
export function MissingApproverBanner({
  doc,
  currentUserId,
}: {
  doc: DocumentDetail;
  currentUserId?: string;
}) {
  if (doc.status !== "IN_REVIEW" || doc.approver) return null;
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-4 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-seal-navy dark:text-white">
          Approbateur final manquant
        </p>
        <p className="text-seal-gray-500 dark:text-slate-300 mt-1">
          Ce document est en revue mais n&apos;a pas d&apos;approbateur final
          assigné. Le reviewer ne pourra pas valider la revue tant qu&apos;un
          approbateur n&apos;a pas été désigné. Cliquez sur{" "}
          <strong>Modifier</strong> pour en assigner un.
        </p>
      </div>
      {currentUserId === doc.owner?.id && (
        <Link
          href={`/documents/${doc.id}/edit`}
          className="flex-shrink-0 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition"
        >
          Modifier
        </Link>
      )}
    </div>
  );
}

// --- Banner : DRAFT sans contenu ---
export function DraftEmptyBanner({
  canEdit,
  doc,
  versionsCount,
  onUploadClick,
}: {
  canEdit: boolean;
  doc: DocumentDetail;
  versionsCount: number;
  onUploadClick: () => void;
}) {
  if (!canEdit || doc.status !== "DRAFT" || versionsCount !== 0) return null;
  return (
    <div className="flex items-center justify-between rounded-xl border-2 border-dashed border-[#F9964A] bg-[#F9964A]/5 p-4">
      <div className="flex items-center gap-3">
        <FileText className="h-5 w-5 text-[#F9964A]" />
        <div>
          <p className="text-sm font-semibold text-seal-navy dark:text-white">
            Brouillon sans contenu
          </p>
          <p className="text-xs text-seal-gray-500 dark:text-slate-400">
            Uploadez un fichier pour commencer la rédaction. Tant qu&apos;il
            n&apos;y a pas de version, le document reste en brouillon et
            n&apos;est pas publiable.
          </p>
        </div>
      </div>
      <Button onClick={onUploadClick}>
        <FileText className="h-4 w-4 mr-1" />
        Uploader un fichier
      </Button>
    </div>
  );
}

// --- Banner : ARCHIVED / OBSOLETE (reopen) ---
export function ReopenBanner({
  canEdit,
  doc,
  reopening,
  onReopen,
}: {
  canEdit: boolean;
  doc: DocumentDetail;
  reopening: boolean;
  onReopen: () => void;
}) {
  if (!canEdit || (doc.status !== "ARCHIVED" && doc.status !== "OBSOLETE"))
    return null;
  return (
    <div className="flex items-center justify-between rounded-xl border border-gray-300 dark:border-slate-700 bg-gray-100 dark:bg-slate-800 p-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-[#892034]" />
        <div>
          <p className="text-sm font-semibold text-seal-navy dark:text-white">
            Document {doc.status === "OBSOLETE" ? "obsolète" : "archivé"}
          </p>
          <p className="text-xs text-seal-gray-500 dark:text-slate-400">
            Réouvrez le document pour le repasser en brouillon et produire une
            nouvelle version. L&apos;historique et la référence sont préservés.
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        onClick={onReopen}
        loading={reopening}
        disabled={reopening}
      >
        Réouvrir en brouillon
      </Button>
    </div>
  );
}

// --- Banner : Confirmation de lecture requise (APPROVED + pas d'accusé) ---
export function AcknowledgmentBanner({
  visible,
  actionLoading,
  onAcknowledge,
}: {
  visible: boolean;
  actionLoading: boolean;
  onAcknowledge: () => void;
}) {
  if (!visible) return null;
  return (
    <div className="flex items-center justify-between rounded-card border-2 border-primary bg-primary-light p-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-primary" />
        <div>
          <p className="text-sm font-semibold text-seal-navy dark:text-white">
            Confirmation de lecture requise
          </p>
          <p className="text-xs text-seal-gray-500 dark:text-slate-400">
            Ce document vous a été adressé — confirmez simplement que vous en
            avez pris connaissance. Cela n&apos;a aucune valeur
            d&apos;approbation formelle ni de signature électronique.
          </p>
        </div>
      </div>
      <Button onClick={onAcknowledge} loading={actionLoading}>
        <CheckCircle2 className="h-4 w-4" />
        Je confirme avoir lu
      </Button>
    </div>
  );
}
