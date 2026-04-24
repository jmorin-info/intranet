"use client";

import React from "react";
import { Button, Badge, IsoControlBadge } from "@omnitech/ui";
import type { IsoAnalysisItem } from "./types";

interface DocumentIsoPanelProps {
  items: IsoAnalysisItem[];
  analyzing: boolean;
  onAutoAssign: () => void;
}

export function DocumentIsoPanel({
  items,
  analyzing,
  onAutoAssign,
}: DocumentIsoPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-seal-gray-500 dark:text-slate-400">
          {items.length} contrôles identifiés
        </p>
        <Button
          variant="primary"
          size="sm"
          onClick={onAutoAssign}
          loading={analyzing}
        >
          Assigner automatiquement
        </Button>
      </div>
      {items.map((item) => (
        <div
          key={item.controlCode}
          className="rounded-lg border border-gray-200 dark:border-slate-700 p-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <IsoControlBadge
              code={item.controlCode}
              title={item.controlTitle}
            />
            <Badge
              variant={
                item.conformityStatus === "CONFORME"
                  ? "approved"
                  : item.conformityStatus === "PARTIELLEMENT_CONFORME"
                    ? "pending-approval"
                    : "draft"
              }
            >
              {item.conformityStatus === "CONFORME"
                ? "Conforme"
                : item.conformityStatus === "PARTIELLEMENT_CONFORME"
                  ? "Partiel"
                  : "A evaluer"}
            </Badge>
            <span className="ml-auto text-xs font-semibold text-seal-navy dark:text-white">
              {item.relevanceScore}%
            </span>
          </div>
          <p className="text-sm text-seal-navy dark:text-white font-semibold">
            {item.controlTitle}
          </p>
          <p className="text-xs text-gray-600 dark:text-slate-300 mt-1">
            {item.justification}
          </p>
          {item.matchedKeywords.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {item.matchedKeywords.map((kw) => (
                <span
                  key={kw}
                  className="rounded bg-primary-light px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
