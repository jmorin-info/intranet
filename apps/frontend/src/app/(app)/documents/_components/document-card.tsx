"use client";

import React from "react";
import { Card, CardContent, StatusBadge, Avatar } from "@omnitech/ui";
import { AlertTriangle, Clock } from "lucide-react";
import { formatRelativeTime, getInitials } from "@/lib/utils";
import { CARD_CLASS_BADGE, CLASS_COLORS } from "./helpers";
import type { Document } from "./types";

export interface DocumentCardProps {
  doc: Document;
  onClick: (id: string) => void;
}

/**
 * Carte compacte d'un document — utilisée en vue "cards" de la liste.
 * Border-left teintée selon la classification (SEAL charter), badge "À revoir"
 * si `nextReviewDate` est dépassée, vignette propriétaire en bas.
 *
 * `React.memo` pour éviter le re-render de toutes les cartes lors d'un
 * changement de filtre/tri n'affectant pas leur instance.
 */
export const DocumentCard = React.memo(function DocumentCard({
  doc,
  onClick,
}: DocumentCardProps) {
  const classStyle =
    CLASS_COLORS[doc.classification || "INTERNE"] || CLASS_COLORS.INTERNE;
  const ownerInitials = doc.owner
    ? getInitials(doc.owner.firstName, doc.owner.lastName)
    : "??";
  const classBadge = (CARD_CLASS_BADGE[doc.classification || "INTERNE"] ||
    CARD_CLASS_BADGE.INTERNE) as { bg: string; text: string; label: string };
  const isOverdueReview =
    doc.nextReviewDate && new Date(doc.nextReviewDate).getTime() < Date.now();
  return (
    <Card
      hoverable
      className={`border-l-4 ${classStyle} cursor-pointer ${isOverdueReview ? "ring-2 ring-[#892034]/40 dark:ring-red-500/40" : ""}`}
      onClick={() => onClick(doc.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <StatusBadge status={doc.status as never} className="text-[10px]" />
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${classBadge.bg} ${classBadge.text}`}
            >
              {classBadge.label}
            </span>
            {isOverdueReview && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#892034]/10 dark:bg-red-900/30 px-2 py-0.5 text-[10px] font-bold text-[#892034] dark:text-red-400">
                <AlertTriangle className="h-2.5 w-2.5" />A revoir
              </span>
            )}
          </div>
          <span className="flex items-center gap-1 text-[10px] text-seal-gray-500 dark:text-slate-500 whitespace-nowrap">
            <Clock className="h-2.5 w-2.5" />
            {formatRelativeTime(doc.updatedAt)}
          </span>
        </div>
        <p className="text-xs font-mono text-seal-gray-500 dark:text-slate-500 mb-0.5">
          {doc.reference}
        </p>
        <h3 className="text-sm font-medium text-seal-navy dark:text-white line-clamp-2 mb-2">
          {doc.title}
        </h3>
        {doc.description && (
          <p className="text-xs text-seal-gray-500 dark:text-slate-400 line-clamp-2 mb-3">
            {doc.description}
          </p>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {doc.owner && (
              <>
                <Avatar
                  initials={ownerInitials}
                  size="sm"
                  className="h-5 w-5 text-[8px] flex-shrink-0"
                />
                <span className="text-[10px] text-seal-gray-500 dark:text-slate-500">
                  {doc.owner.firstName} {doc.owner.lastName}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1">
            {doc.isoControls && doc.isoControls.length > 0 && (
              <span className="text-[9px] text-seal-gray-500 dark:text-slate-500 bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                {doc.isoControls.length} ISO
              </span>
            )}
            {doc._count?.versions && doc._count.versions > 1 && (
              <span className="text-[9px] text-seal-gray-500 dark:text-slate-500 bg-gray-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                v{doc._count.versions}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
