"use client";

import React from "react";
import { FileText, Clock } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface HistoryEntry {
  type?: string;
  versionNumber?: string;
  action?: string;
  changeLog?: string;
  severity?: string;
  user?: { firstName: string; lastName: string };
  date: string;
  fileSize?: number;
}

interface DocumentHistoryPanelProps {
  history: { timeline?: HistoryEntry[] } | null;
  loading: boolean;
}

export function DocumentHistoryPanel({
  history,
  loading,
}: DocumentHistoryPanelProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse bg-gray-100 dark:bg-slate-800 rounded-lg"
          />
        ))}
      </div>
    );
  }
  if (!history?.timeline || history.timeline.length === 0) {
    return (
      <p className="text-sm text-seal-gray-500 dark:text-slate-400 text-center py-8">
        Aucun historique disponible
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-slate-700" />
        {history.timeline.map((entry, i) => (
          <div key={i} className="flex gap-4 pb-4 relative">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
                entry.type === "version"
                  ? "bg-primary text-white"
                  : entry.severity === "CRITICAL"
                    ? "bg-red-500 text-white"
                    : entry.severity === "WARN"
                      ? "bg-amber-500 text-white"
                      : "bg-gray-200 dark:bg-slate-600 text-seal-gray-500 dark:text-slate-400"
              }`}
            >
              {entry.type === "version" ? (
                <FileText className="h-4 w-4" />
              ) : (
                <Clock className="h-4 w-4" />
              )}
            </div>
            <div className="flex-1 bg-gray-50 dark:bg-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  {entry.type === "version" ? (
                    <p className="text-sm font-semibold text-seal-navy dark:text-white">
                      Version {entry.versionNumber} uploadée
                    </p>
                  ) : (
                    <p className="text-sm font-semibold text-seal-navy dark:text-white">
                      {entry.action?.replace(/_/g, " ")}
                    </p>
                  )}
                  {entry.changeLog && (
                    <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-0.5">
                      {entry.changeLog}
                    </p>
                  )}
                  {entry.user && (
                    <p className="text-xs text-seal-gray-500 dark:text-slate-400">
                      {entry.user.firstName} {entry.user.lastName}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xs text-seal-gray-500 dark:text-slate-500">
                    {formatDate(entry.date)}
                  </p>
                  {entry.fileSize && (
                    <p className="text-[10px] text-seal-gray-500 dark:text-slate-500">
                      {(entry.fileSize / 1024).toFixed(0)} Ko
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
