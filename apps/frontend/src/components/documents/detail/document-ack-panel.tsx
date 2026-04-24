"use client";

import React from "react";
import { CheckCircle2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import type { AcknowledgmentData } from "./types";

interface DocumentAckPanelProps {
  acknowledgments: AcknowledgmentData[];
}

export function DocumentAckPanel({ acknowledgments }: DocumentAckPanelProps) {
  if (acknowledgments.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-seal-gray-500 dark:text-slate-400 text-center py-8">
          Aucune lecture confirmée pour l&apos;instant
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {acknowledgments.map((ack) => (
        <div
          key={ack.id}
          className="flex items-center gap-4 rounded-lg border border-gray-200 dark:border-slate-700 p-3"
        >
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-seal-navy dark:text-white">
              {ack.user.firstName} {ack.user.lastName}
            </p>
          </div>
          <span className="text-xs text-seal-gray-500 dark:text-slate-400">
            {formatDateTime(ack.acknowledgedAt)}
          </span>
        </div>
      ))}
    </div>
  );
}
