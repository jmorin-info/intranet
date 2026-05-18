"use client";

import React from "react";
import {
  FileEdit,
  Eye,
  UserCheck,
  ShieldCheck,
  Send,
  Check,
  X,
} from "lucide-react";

export type WorkflowStepState =
  | "pending"
  | "current"
  | "completed"
  | "rejected";

export interface WorkflowStepData {
  key: "draft" | "review" | "confirm" | "approval" | "published";
  label: string;
  state: WorkflowStepState;
  actor?: { firstName: string; lastName: string } | null;
  date?: string | null;
  comment?: string | null;
}

interface WorkflowTimelineProps {
  steps: WorkflowStepData[];
  className?: string;
}

const ICONS: Record<
  WorkflowStepData["key"],
  React.ComponentType<{ className?: string }>
> = {
  draft: FileEdit,
  review: Eye,
  confirm: UserCheck,
  approval: ShieldCheck,
  published: Send,
};

const STATE_STYLES: Record<
  WorkflowStepState,
  { circle: string; line: string; label: string; badge: string }
> = {
  pending: {
    circle:
      "bg-gray-100 dark:bg-slate-800 text-[#837274] border-gray-200 dark:border-slate-700",
    line: "bg-gray-200 dark:bg-slate-700",
    label: "text-[#837274]",
    badge: "bg-gray-100 text-[#837274] dark:bg-slate-800",
  },
  current: {
    // Orange PANTONE clignotant
    circle:
      "bg-[#F68D2E] text-white border-[#F68D2E] animate-pulse shadow-lg shadow-[#F68D2E]/30",
    line: "bg-gray-200 dark:bg-slate-700",
    label: "text-slate-900 font-semibold",
    badge: "bg-[#F68D2E]/10 text-slate-900",
  },
  completed: {
    circle: "bg-[#006233] text-white border-[#006233]",
    line: "bg-[#006233]",
    label: "text-[#006233]",
    badge: "bg-[#006233]/10 text-[#006233]",
  },
  rejected: {
    circle: "bg-[#892034] text-white border-[#892034]",
    line: "bg-[#892034]",
    label: "text-[#892034]",
    badge: "bg-[#892034]/10 text-[#892034]",
  },
};

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function WorkflowTimeline({
  steps,
  className = "",
}: WorkflowTimelineProps) {
  return (
    <div className={`w-full ${className}`}>
      {/* Ligne horizontale avec cercles */}
      <div className="relative flex items-center justify-between">
        {steps.map((step, idx) => {
          const Icon = ICONS[step.key];
          const style = STATE_STYLES[step.state];
          const isLast = idx === steps.length - 1;
          const nextStyle = !isLast
            ? STATE_STYLES[steps[idx + 1]!.state]
            : null;
          // La ligne qui suit utilise la couleur du suivant si completed/rejected, sinon grise
          const lineCls =
            nextStyle &&
            (steps[idx + 1]!.state === "completed" ||
              steps[idx + 1]!.state === "rejected")
              ? nextStyle.line
              : "bg-gray-200 dark:bg-slate-700";

          return (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center min-w-0 flex-shrink-0 z-10">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition ${style.circle}`}
                >
                  {step.state === "completed" ? (
                    <Check className="h-5 w-5" />
                  ) : step.state === "rejected" ? (
                    <X className="h-5 w-5" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>
                <p
                  className={`mt-2 text-[11px] text-center max-w-[80px] leading-tight ${style.label}`}
                >
                  {step.label}
                </p>
              </div>
              {!isLast && <div className={`flex-1 h-0.5 mx-1 ${lineCls}`} />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Détails textuels par étape */}
      <ul className="mt-4 space-y-2">
        {steps
          .filter((s) => s.state !== "pending")
          .map((step) => {
            const style = STATE_STYLES[step.state];
            return (
              <li
                key={step.key}
                className="flex items-start gap-2 rounded-md border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900/40 px-3 py-2"
              >
                <span
                  className={`mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${style.badge}`}
                >
                  {step.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-900 dark:text-slate-200">
                    {step.actor
                      ? `${step.actor.firstName} ${step.actor.lastName}`
                      : "Système"}
                    {step.date && (
                      <span className="text-[#837274] dark:text-slate-400">
                        {" "}
                        — {formatDate(step.date)}
                      </span>
                    )}
                  </p>
                  {step.comment && (
                    <p className="mt-0.5 text-[11px] italic text-[#837274] dark:text-slate-400">
                      « {step.comment} »
                    </p>
                  )}
                </div>
              </li>
            );
          })}
      </ul>
    </div>
  );
}

export default WorkflowTimeline;
