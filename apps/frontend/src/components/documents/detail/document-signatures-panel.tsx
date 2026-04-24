"use client";

import React from "react";
import { SignatureBadge } from "@omnitech/ui";
import { PenLine, CheckCircle2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { DocuSealTemplate, SignatureData } from "./types";

interface DocumentSignaturesPanelProps {
  signatures: SignatureData[];
  templates: DocuSealTemplate[];
  currentUserId?: string;
  onConfirmSign: (sigId: string) => void;
}

export function DocumentSignaturesPanel({
  signatures,
  templates,
  currentUserId,
  onConfirmSign,
}: DocumentSignaturesPanelProps) {
  return (
    <div className="space-y-4">
      {templates.length > 0 && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3">
          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">
            Modeles DocuSeal disponibles
          </p>
          <div className="flex flex-wrap gap-1.5">
            {templates.map((tpl) => (
              <span
                key={tpl.id}
                className="inline-flex items-center rounded bg-blue-100 dark:bg-blue-800 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-200"
              >
                #{tpl.id} {tpl.name}
              </span>
            ))}
          </div>
        </div>
      )}
      {signatures.length === 0 ? (
        <p className="text-sm text-seal-gray-500 dark:text-slate-400 text-center py-8">
          Aucune signature
        </p>
      ) : (
        signatures.map((sig) => (
          <div
            key={sig.id}
            className="flex items-center gap-4 rounded-lg border border-gray-200 dark:border-slate-700 p-3"
          >
            <PenLine className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-seal-navy dark:text-white">
                {sig.signer.firstName} {sig.signer.lastName}
              </p>
              <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                Demande par {sig.requestedBy.firstName}{" "}
                {sig.requestedBy.lastName}
              </p>
              {sig.status === "PENDING" && (
                <div className="flex gap-2 mt-1">
                  {sig.docusealSubmissionId ? (
                    <a
                      href={`${process.env.NEXT_PUBLIC_DOCUSEAL_URL || "http://localhost:7000"}/s/${sig.docusealSlug || sig.docusealSubmissionId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                    >
                      <PenLine className="h-3.5 w-3.5" />
                      Signer via DocuSeal
                    </a>
                  ) : null}
                  {sig.signer.id === currentUserId && (
                    <button
                      onClick={() => onConfirmSign(sig.id)}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-700 transition"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Signer
                    </button>
                  )}
                </div>
              )}
            </div>
            <SignatureBadge
              status={
                sig.status as "PENDING" | "SIGNED" | "REJECTED" | "EXPIRED"
              }
            />
            {sig.signedAt && (
              <span className="text-xs text-seal-gray-500 dark:text-slate-400">
                {formatDateTime(sig.signedAt)}
              </span>
            )}
          </div>
        ))
      )}
    </div>
  );
}
