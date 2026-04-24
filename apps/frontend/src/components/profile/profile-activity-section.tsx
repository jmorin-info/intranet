"use client";

import React from "react";
import { Card, CardContent, CardHeader } from "@omnitech/ui";
import { Activity, FileText, FolderOpen, Trophy, Shield } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import type { RecentActivityItem } from "./types";

interface ProfileActivitySectionProps {
  myDocs: number;
  myOpenTickets: number;
  recentActivity: RecentActivityItem[];
}

export function ProfileActivitySection({
  myDocs,
  myOpenTickets,
  recentActivity,
}: ProfileActivitySectionProps) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-medium text-seal-navy dark:text-white flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" /> Mon activité
        </h2>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-800">
            <div className="h-9 w-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
              <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-lg font-medium text-seal-navy dark:text-white">
                {myDocs}
              </p>
              <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">
                Documents créés
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-800">
            <div className="h-9 w-9 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
              <FolderOpen className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-lg font-medium text-seal-navy dark:text-white">
                {myOpenTickets}
              </p>
              <p className="text-[11px] text-seal-gray-500 dark:text-slate-400">
                Tickets ouverts
              </p>
            </div>
          </div>
        </div>
        <p className="text-[10px] font-medium text-seal-gray-500 dark:text-slate-500 uppercase tracking-widest mb-2">
          Actions récentes
        </p>
        {recentActivity.length > 0 ? (
          <div className="relative">
            <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-200 dark:bg-slate-700" />
            <div className="space-y-0">
              {recentActivity.slice(0, 5).map((a) => {
                const actionLabel = (a.action || "").replace(/_/g, " ");
                const isDoc = /document|upload|file/i.test(a.action);
                const isTicket = /ticket/i.test(a.action);
                const isQuiz = /quiz/i.test(a.action);
                const isLogin = /login|auth|session/i.test(a.action);
                const iconColor = isDoc
                  ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                  : isTicket
                    ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                    : isQuiz
                      ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : isLogin
                        ? "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
                        : "bg-primary/10 text-primary";
                const IconComp = isDoc
                  ? FileText
                  : isTicket
                    ? FolderOpen
                    : isQuiz
                      ? Trophy
                      : isLogin
                        ? Shield
                        : Activity;
                return (
                  <div
                    key={a.id}
                    className="flex items-start gap-3 py-2.5 relative rounded-lg px-2 -mx-2 cursor-default"
                  >
                    <div
                      className={`h-[30px] w-[30px] rounded-full flex items-center justify-center flex-shrink-0 z-10 shadow-sm ${iconColor}`}
                    >
                      <IconComp className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-xs font-medium text-seal-navy dark:text-white capitalize">
                        {actionLabel}
                      </p>
                      {a.details && (
                        <p className="text-[10px] text-seal-gray-500 dark:text-slate-500 truncate">
                          {typeof a.details === "string"
                            ? a.details
                            : JSON.stringify(a.details).slice(0, 80)}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-seal-gray-500 dark:text-slate-500 flex-shrink-0 pt-1 whitespace-nowrap">
                      {formatRelativeTime(a.createdAt)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-seal-gray-500 dark:text-slate-400 text-center py-4">
            Aucune activité récente
          </p>
        )}
      </CardContent>
    </Card>
  );
}
