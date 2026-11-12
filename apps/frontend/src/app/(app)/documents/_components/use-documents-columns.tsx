"use client";

import React, { useMemo } from "react";
import {
  Avatar,
  Badge,
  IsoControlBadge,
  StatusBadge,
  type Column,
} from "@omnitech/ui";
import {
  CheckSquare,
  Square,
  Eye,
  Download,
  Link2,
} from "lucide-react";
import { toast } from "sonner";
import {
  DocumentCategory,
  DOCUMENT_CATEGORY_LABELS,
} from "@omnitech/shared";
import { api } from "@/lib/api";
import { buildDocumentFilename } from "@/lib/download";
import { formatDate, formatRelativeTime, getInitials } from "@/lib/utils";
import {
  categoryBadgeVariant,
  classificationVariant,
  getValidityInfo,
} from "./helpers";
import type { Document } from "./types";

export interface UseDocumentsColumnsParams {
  isAdmin: boolean | null | undefined;
  canReview: boolean | null | undefined;
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  router: { push: (url: string) => void };
}

/**
 * Construction mémoïsée des colonnes du DataTable de la liste documentaire.
 *
 * Les actions (download / copier lien / sélection) restent côté ligne pour
 * conserver la fermeture sur `selectedIds`/`toggleSelect`. La fonction
 * recalcule les colonnes uniquement quand les déps changent (admin, canReview,
 * sélection, router).
 *
 * Charte SEAL préservée : badges via `categoryBadgeVariant` /
 * `classificationVariant` (PANTONE 202C/715C/660C/349C).
 */
export function useDocumentsColumns({
  isAdmin,
  canReview,
  selectedIds,
  toggleSelect,
  router,
}: UseDocumentsColumnsParams): Column<Document>[] {
  return useMemo<Column<Document>[]>(
    () => [
      ...(isAdmin
        ? [
            {
              key: "select" as keyof Document,
              header: "",
              className: "w-10",
              render: (doc: Document) => (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelect(doc.id);
                  }}
                  className="flex items-center justify-center p-0.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={
                    selectedIds.has(doc.id) ? "Désélectionner" : "Sélectionner"
                  }
                >
                  {selectedIds.has(doc.id) ? (
                    <CheckSquare className="h-4 w-4 text-primary" />
                  ) : (
                    <Square className="h-4 w-4 text-seal-gray-500/40 dark:text-slate-500" />
                  )}
                </button>
              ),
            },
          ]
        : []),
      {
        key: "reference",
        header: "Référence",
        sortable: true,
        className: "w-36",
        render: (doc) => (
          <span className="font-mono text-xs text-seal-navy dark:text-white font-semibold">
            {doc.reference}
          </span>
        ),
      },
      {
        key: "title",
        header: "Titre",
        sortable: true,
        render: (doc) => (
          <div className="min-w-0" title={doc.description || doc.title}>
            <p className="text-sm font-semibold text-seal-navy dark:text-white truncate max-w-xs">
              {doc.title}
            </p>
            <div className="flex gap-1 mt-1 flex-wrap">
              {doc.isoControls?.slice(0, 3).map(({ isoControl }) => (
                <IsoControlBadge
                  key={isoControl.code}
                  code={isoControl.code}
                  title={isoControl.titleFr || isoControl.title}
                />
              ))}
              {(doc.isoControls?.length || 0) > 3 && (
                <Badge variant="navy">
                  +{(doc.isoControls?.length || 0) - 3}
                </Badge>
              )}
            </div>
          </div>
        ),
      },
      {
        key: "category",
        header: "Catégorie",
        render: (doc) => (
          <Badge variant={categoryBadgeVariant(doc.category)}>
            {DOCUMENT_CATEGORY_LABELS[doc.category as DocumentCategory] ||
              doc.category}
          </Badge>
        ),
      },
      ...(canReview
        ? [
            {
              key: "classification" as keyof Document,
              header: "Classification",
              render: (doc: Document) =>
                doc.classification ? (
                  <Badge variant={classificationVariant(doc.classification)}>
                    {doc.classification}
                  </Badge>
                ) : null,
            },
          ]
        : []),
      {
        key: "status",
        header: "Statut",
        sortable: true,
        render: (doc) => (
          <StatusBadge
            status={
              doc.status as
                | "DRAFT"
                | "IN_REVIEW"
                | "PENDING_APPROVAL"
                | "APPROVED"
                | "OBSOLETE"
                | "ARCHIVED"
            }
          />
        ),
      },
      {
        key: "owner",
        header: "Responsable",
        render: (doc) => (
          <div className="flex items-center gap-2">
            <Avatar
              initials={getInitials(doc.owner.firstName, doc.owner.lastName)}
              size="sm"
              className="h-6 w-6 text-[10px] flex-shrink-0"
            />
            <span className="text-sm text-seal-gray-500 dark:text-slate-400 whitespace-nowrap">
              {doc.owner.firstName} {doc.owner.lastName}
            </span>
          </div>
        ),
      },
      {
        key: "updatedAt",
        header: "Modifié",
        sortable: true,
        render: (doc) => (
          <span className="text-xs text-seal-gray-500 dark:text-slate-400 whitespace-nowrap">
            {formatRelativeTime(doc.updatedAt)}
          </span>
        ),
      },
      {
        key: "nextReviewDate",
        header: "Validité",
        render: (doc) => {
          const info = getValidityInfo(doc.nextReviewDate);
          return (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${info.className}`}
              title={
                doc.nextReviewDate
                  ? `Prochaine revue : ${formatDate(doc.nextReviewDate)}`
                  : "Document sans date de revue"
              }
            >
              {info.label}
            </span>
          );
        },
      },
      {
        key: "id",
        header: "",
        className: "w-28",
        render: (doc) => (
          <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/documents/${doc.id}`);
              }}
              title="Ouvrir"
              aria-label="Ouvrir le document"
              className="rounded p-1 text-seal-gray-500 hover:bg-gray-100 hover:text-primary dark:hover:bg-slate-700 transition"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const { data, headers } = await api.get(
                    `/documents/${doc.id}/download`,
                    { responseType: "blob" },
                  );
                  const blobUrl = URL.createObjectURL(new Blob([data]));
                  const link = window.document.createElement("a");
                  link.href = blobUrl;
                  link.setAttribute(
                    "download",
                    buildDocumentFilename(doc.reference, undefined, String(headers["content-type"] || "")),
                  );
                  window.document.body.appendChild(link);
                  link.click();
                  link.remove();
                  setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
                  toast.success("Téléchargement lancé");
                } catch {
                  toast.error("Téléchargement impossible");
                }
              }}
              title="Télécharger"
              aria-label="Télécharger le document"
              className="rounded p-1 text-seal-gray-500 hover:bg-gray-100 hover:text-primary dark:hover:bg-slate-700 transition"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const url = `${window.location.origin}/documents/${doc.id}`;
                navigator.clipboard
                  ?.writeText(url)
                  .then(() => toast.success("Lien copie"))
                  .catch(() => toast.error("Impossible de copier"));
              }}
              title="Copier le lien"
              aria-label="Copier le lien du document"
              className="rounded p-1 text-seal-gray-500 hover:bg-gray-100 hover:text-primary dark:hover:bg-slate-700 transition"
            >
              <Link2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
      },
    ],
    [isAdmin, canReview, selectedIds, toggleSelect, router],
  );
}
