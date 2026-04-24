"use client";

import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, Button } from "@omnitech/ui";
import { FileText, FolderOpen } from "lucide-react";
import type { GedSummaryData } from "./types";

interface ProfileDocumentsSectionProps {
  userId: string;
  gedSummary: GedSummaryData | null;
}

export function ProfileDocumentsSection({
  userId,
  gedSummary,
}: ProfileDocumentsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-medium text-seal-navy dark:text-white flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-primary" />
          Mes documents
        </h2>
      </CardHeader>
      <CardContent>
        {gedSummary ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-seal-gray-500 dark:text-slate-400 uppercase tracking-wider">
                Total documents
              </span>
              <span className="text-2xl font-bold text-seal-navy dark:text-white">
                {gedSummary.total}
              </span>
            </div>
            <div className="space-y-3">
              {(
                [
                  {
                    label: "Brouillons",
                    value: gedSummary.myDrafts,
                    color: "bg-gray-400",
                  },
                  {
                    label: "En revue",
                    value: gedSummary.myInReview,
                    color: "bg-amber-500",
                  },
                  {
                    label: "A approuver",
                    value: gedSummary.toApproveByMe,
                    color: "bg-primary",
                  },
                  {
                    label: "A confirmer",
                    value: gedSummary.toConfirmByMe,
                    color: "bg-emerald-500",
                  },
                  {
                    label: "Revue proche",
                    value: gedSummary.nearReviewDate,
                    color: "bg-red-400",
                  },
                ] as const
              ).map(({ label, value, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs text-seal-gray-500 dark:text-slate-400 w-24 text-right flex-shrink-0">
                    {label}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-slate-700 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${color} transition-all duration-500`}
                      style={{
                        width:
                          gedSummary.total > 0
                            ? `${Math.max(4, (value / gedSummary.total) * 100)}%`
                            : "0%",
                      }}
                    />
                  </div>
                  <span className="text-sm font-bold text-seal-navy dark:text-white w-8 text-right tabular-nums">
                    {value}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-center gap-3">
              <Link href={`/documents?view=ged&owner=${userId}`}>
                <Button variant="primary" size="sm">
                  <FileText className="h-3.5 w-3.5" /> Mes documents
                </Button>
              </Link>
              <Link href="/documents?view=ged">
                <Button variant="outline" size="sm">
                  <FolderOpen className="h-3.5 w-3.5" /> Ouvrir la GED
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <FolderOpen className="h-8 w-8 text-seal-gray-500/30 mx-auto mb-2" />
            <p className="text-sm text-seal-gray-500 dark:text-slate-400">
              Chargement...
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
