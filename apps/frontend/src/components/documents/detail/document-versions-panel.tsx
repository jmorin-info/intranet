"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Button, Dialog } from "@omnitech/ui";
import {
  FileText,
  Layers,
  ArrowLeftRight,
  Download,
  Hash,
  Check,
} from "lucide-react";
import { formatFileSize } from "@omnitech/shared";
import { formatDateTime } from "@/lib/utils";
import { buildDocumentFilename } from "@/lib/download";
import type { DiffVersion } from "@/components/documents/version-diff";
import type { DocumentDetail, DocumentVersion } from "./types";
import { authenticatedDownload } from "./helpers";

const VersionDiff = dynamic(
  () =>
    import("@/components/documents/version-diff").then((m) => m.VersionDiff),
  {
    ssr: false,
    loading: () => <div className="shimmer h-20 rounded" />,
  },
);

interface DocumentVersionsPanelProps {
  doc: DocumentDetail;
  versions: DocumentVersion[];
  canEdit: boolean;
  uploadingVersion: boolean;
  onUpload: (file: File) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function DocumentVersionsPanel({
  doc,
  versions,
  canEdit,
  uploadingVersion,
  onUpload,
  fileInputRef,
}: DocumentVersionsPanelProps) {
  const [compareMode, setCompareMode] = useState(false);
  const [compareLeft, setCompareLeft] = useState<string | null>(null);
  const [compareRight, setCompareRight] = useState<string | null>(null);
  const [showDiffDialog, setShowDiffDialog] = useState(false);
  const [copiedChecksum, setCopiedChecksum] = useState<string | null>(null);

  const copyChecksum = async (checksum: string) => {
    try {
      await navigator.clipboard.writeText(checksum);
      setCopiedChecksum(checksum);
      toast.success("Checksum copié");
      setTimeout(() => setCopiedChecksum(null), 2000);
    } catch {
      toast.error("Copie impossible");
    }
  };

  const toDiffVersion = (v: DocumentVersion): DiffVersion => ({
    id: v.id,
    versionNumber: v.versionNumber,
    checksum: v.checksum,
    fileSizeBytes: v.fileSizeBytes,
    fileType: v.fileType,
    createdAt: v.createdAt,
    changeLog: v.changeLog,
    uploadedBy: v.uploadedBy,
    content: doc?.isNative ? doc?.content || null : null,
  });

  const leftV = versions.find((v) => v.id === compareLeft);
  const rightV = versions.find((v) => v.id === compareRight);

  return (
    <div className="space-y-3">
      {canEdit && !doc.isNative && ["DRAFT", "APPROVED"].includes(doc.status) && (
        <div className="rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/40 p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#F9964A]/15 flex items-center justify-center flex-shrink-0">
              <FileText className="h-5 w-5 text-[#F9964A]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-seal-navy dark:text-white">
                {versions.length === 0
                  ? "Uploader le fichier du document"
                  : "Ajouter une nouvelle version"}
              </p>
              <p className="text-[11px] text-seal-gray-500 dark:text-slate-400 mt-0.5">
                {versions.length === 0
                  ? "Ce brouillon n'a pas encore de contenu. Déposez un fichier pour démarrer."
                  : "Conserve les anciennes versions. Le nouveau contenu repasse en brouillon et doit être analysé puis validé avant publication (50 Mo maximum)."}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,.doc,.xlsx,.xls,.md,.txt,.png,.jpg,.jpeg,.webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onUpload(file);
              }}
            />
            <Button
              size="sm"
              variant="primary"
              onClick={() => fileInputRef.current?.click()}
              loading={uploadingVersion}
              disabled={uploadingVersion}
            >
              Choisir un fichier
            </Button>
          </div>
        </div>
      )}

      {["IN_REVIEW", "REVIEW_APPROVED", "PENDING_APPROVAL"].includes(doc.status) && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">Le contenu est figé pendant la validation. Un retour en correction est nécessaire pour déposer une nouvelle version.</p>}
      {doc.isNative && doc.status === "DRAFT" && <p className="text-sm text-seal-gray-500 dark:text-slate-400">Modifiez le contenu dans l’éditeur. Une version sera figée automatiquement à la soumission.</p>}

      {versions.length === 0 ? (
        !canEdit && (
          <p className="text-sm text-seal-gray-500 dark:text-slate-400 text-center py-8">
            Aucune version
          </p>
        )
      ) : (
        <>
          <div className="flex items-center justify-between rounded-lg border border-dashed border-gray-200 dark:border-slate-700 px-3 py-2">
            <div className="text-xs text-seal-gray-500 dark:text-slate-400">
              {compareMode ? (
                <span>
                  Sélectionnez{" "}
                  <span className="font-semibold text-seal-navy dark:text-white">
                    deux versions
                  </span>{" "}
                  à comparer
                  {compareLeft && compareRight
                    ? " — prêt"
                    : compareLeft
                      ? " — 1/2"
                      : " — 0/2"}
                </span>
              ) : (
                <span>
                  {versions.length} version
                  {versions.length > 1 ? "s" : ""} dans l&apos;historique
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {compareMode && compareLeft && compareRight && (
                <button
                  onClick={() => setShowDiffDialog(true)}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:bg-primary/90 transition"
                >
                  <ArrowLeftRight className="h-3 w-3" /> Afficher le diff
                </button>
              )}
              <button
                onClick={() => {
                  setCompareMode(!compareMode);
                  setCompareLeft(null);
                  setCompareRight(null);
                }}
                className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                  compareMode
                    ? "border-[#892034] text-[#892034] hover:bg-[#892034]/5"
                    : "border-gray-200 dark:border-slate-700 text-seal-navy dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-800"
                }`}
              >
                <ArrowLeftRight className="h-3 w-3" />
                {compareMode ? "Annuler" : "Comparer"}
              </button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-slate-700" />
            {versions.map((version, vIdx) => {
              const isCurrent = vIdx === 0;
              const isOld = vIdx >= 2;
              const isSelected =
                compareLeft === version.id || compareRight === version.id;
              return (
                <div
                  key={version.id}
                  className={`relative flex items-start gap-4 pb-4 ${isOld ? "opacity-60" : ""}`}
                >
                  <div
                    className={[
                      "relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 flex-shrink-0 transition-all",
                      isCurrent
                        ? "border-primary bg-primary text-white shadow-lg shadow-primary/20"
                        : isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-seal-gray-500 dark:text-slate-400",
                    ].join(" ")}
                  >
                    {isCurrent ? (
                      <Layers className="h-4 w-4" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                  </div>

                  <div
                    className={`flex-1 rounded-lg border p-3 transition ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {compareMode && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                if (isSelected) {
                                  if (compareLeft === version.id)
                                    setCompareLeft(null);
                                  else if (compareRight === version.id)
                                    setCompareRight(null);
                                } else if (!compareLeft) {
                                  setCompareLeft(version.id);
                                } else if (!compareRight) {
                                  setCompareRight(version.id);
                                } else {
                                  setCompareLeft(compareRight);
                                  setCompareRight(version.id);
                                }
                              }}
                              className="h-4 w-4 accent-primary"
                            />
                          )}
                          <p className="text-sm font-semibold text-seal-navy dark:text-white">
                            Version {version.versionNumber}
                          </p>
                          {isCurrent && (
                            <span className="inline-flex items-center rounded-full bg-[#006233]/10 px-2 py-0.5 text-[10px] font-semibold text-[#006233]">
                              Version actuelle
                            </span>
                          )}
                          <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] text-seal-gray-500 dark:text-slate-400">
                            {formatFileSize(version.fileSizeBytes)}
                          </span>
                        </div>
                        <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
                          {version.uploadedBy.firstName}{" "}
                          {version.uploadedBy.lastName} —{" "}
                          {formatDateTime(version.createdAt)}
                        </p>
                        {version.changeLog && (
                          <p className="text-xs text-gray-600 dark:text-slate-300 mt-1 italic">
                            &laquo; {version.changeLog} &raquo;
                          </p>
                        )}
                        <button
                          onClick={() => copyChecksum(version.checksum)}
                          title="Cliquer pour copier le checksum SHA-256"
                          className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10px] text-seal-gray-500 dark:text-slate-400 hover:text-primary transition break-all text-left"
                        >
                          {copiedChecksum === version.checksum ? (
                            <Check className="h-3 w-3 flex-shrink-0 text-emerald-500" />
                          ) : (
                            <Hash className="h-3 w-3 flex-shrink-0" />
                          )}
                          <span className="truncate max-w-[260px]">
                            {version.checksum}
                          </span>
                        </button>
                      </div>
                      <button
                        onClick={() =>
                          authenticatedDownload(
                            `/documents/${doc.id}/versions/${version.id}/download`,
                            buildDocumentFilename(
                              doc.reference,
                              version.versionNumber,
                              version.fileType,
                              version.fileUrl,
                            ),
                          )
                        }
                        className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition hover:underline flex-shrink-0"
                        title={`Télécharger la version ${version.versionNumber}`}
                      >
                        <Download className="h-3 w-3" />
                        Télécharger
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {showDiffDialog && leftV && rightV && (
        <Dialog
          open={showDiffDialog}
          onClose={() => setShowDiffDialog(false)}
          title={`Comparaison v${leftV.versionNumber} ↔ v${rightV.versionNumber}`}
          className="max-w-4xl"
        >
          <div className="max-h-[70vh] overflow-auto">
            <VersionDiff
              left={toDiffVersion(leftV)}
              right={toDiffVersion(rightV)}
            />
          </div>
        </Dialog>
      )}
    </div>
  );
}
