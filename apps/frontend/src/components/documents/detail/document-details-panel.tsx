"use client";

import React from "react";
import { IsoControlBadge } from "@omnitech/ui";
import { FileText, Hash, Sparkles } from "lucide-react";
import { formatFileSize } from "@omnitech/shared";
import { formatDateTime } from "@/lib/utils";
import type { DocumentDetail, DocumentVersion } from "./types";

interface DocumentDetailsPanelProps {
  doc: DocumentDetail;
  currentVersion?: DocumentVersion;
  aiSummary: string | null;
  nextReviewLabel: string;
}

export function DocumentDetailsPanel({
  doc,
  currentVersion,
  aiSummary,
  nextReviewLabel,
}: DocumentDetailsPanelProps) {
  return (
    <div className="space-y-4">
      {doc.description && (
        <div>
          <h3 className="text-sm font-medium text-seal-navy dark:text-white mb-1">
            Description
          </h3>
          <p className="text-sm text-gray-700 dark:text-slate-300">
            {doc.description}
          </p>
        </div>
      )}

      {aiSummary && (
        <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 via-primary/[0.02] to-transparent dark:from-primary/10 dark:via-primary/5 p-6 shadow-sm">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="h-8 w-8 rounded-lg bg-primary/15 dark:bg-primary/25 flex items-center justify-center">
              <Sparkles className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-seal-navy dark:text-white">
                Résumé IA
              </h3>
              <p className="text-[10px] text-seal-gray-500 dark:text-slate-500">
                Généré par l&apos;assistant OMNITECH (Ollama)
              </p>
            </div>
          </div>
          <div className="text-sm leading-relaxed text-seal-navy dark:text-slate-200 whitespace-pre-wrap wiki-content">
            {aiSummary}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-seal-gray-500 dark:text-slate-400">
            Responsable
          </p>
          <p className="text-sm font-semibold text-seal-navy dark:text-white">
            {doc.owner.firstName} {doc.owner.lastName}
          </p>
        </div>
        <div>
          <p className="text-xs text-seal-gray-500 dark:text-slate-400">
            Prochaine révision
          </p>
          <p className="text-sm font-semibold text-seal-navy dark:text-white">
            {nextReviewLabel}
          </p>
        </div>
        <div>
          <p className="text-xs text-seal-gray-500 dark:text-slate-400">
            Créé le
          </p>
          <p className="text-sm text-seal-navy dark:text-white">
            {formatDateTime(doc.createdAt)}
          </p>
        </div>
        <div>
          <p className="text-xs text-seal-gray-500 dark:text-slate-400">
            Dernière modification
          </p>
          <p className="text-sm text-seal-navy dark:text-white">
            {formatDateTime(doc.updatedAt)}
          </p>
        </div>
      </div>

      {doc.isoControls.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-seal-navy dark:text-white mb-2">
            Contrôles de sécurité
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {doc.isoControls.map(({ isoControl }) => (
              <IsoControlBadge
                key={isoControl.code}
                code={isoControl.code}
                title={isoControl.titleFr || isoControl.title}
              />
            ))}
          </div>
        </div>
      )}

      {currentVersion && (
        <div>
          <h3 className="text-sm font-medium text-seal-navy dark:text-white mb-2">
            Version actuelle
          </h3>
          <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 p-3">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-seal-navy dark:text-white">
                  v{currentVersion.versionNumber} — {currentVersion.fileType}
                </p>
                <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                  {formatFileSize(currentVersion.fileSizeBytes)} — Checksum
                  SHA-256
                </p>
              </div>
            </div>
            <div className="mt-2 rounded bg-gray-100 dark:bg-slate-800 p-2">
              <p className="font-mono text-[10px] text-seal-gray-500 dark:text-slate-400 break-all">
                <Hash className="inline h-3 w-3 mr-0.5" />
                {currentVersion.checksum}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
