"use client";

import React from "react";
import { Card, CardContent } from "@omnitech/ui";
import type { WorkflowStep } from "@omnitech/ui";
import { CheckCircle2, Clock } from "lucide-react";

interface DocumentWorkflowTimelineProps {
  steps: WorkflowStep[];
}

/**
 * Timeline horizontale d'approbation d'un document (ISO 27001 A.5.1).
 * Affiche 5 étapes : Rédaction → Revue technique → Confirmation rédacteur →
 * Approbation Direction → Publié. Composant purement présentationnel.
 */
export function DocumentWorkflowTimeline({
  steps,
}: DocumentWorkflowTimelineProps) {
  return (
    <Card className="shadow-sm rounded-xl">
      <CardContent className="py-4 px-5">
        <div className="flex items-center gap-0 overflow-x-auto">
          {steps.map((step, idx) => (
            <React.Fragment key={idx}>
              <div className="flex flex-col items-center min-w-[100px] flex-shrink-0">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all duration-200 ${
                    step.status === "completed"
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : step.status === "current"
                        ? "border-primary bg-primary text-white animate-pulse shadow-lg shadow-primary/30"
                        : "border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 text-seal-gray-500 dark:text-slate-500"
                  }`}
                >
                  {step.status === "completed" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : step.status === "current" ? (
                    <Clock className="h-4 w-4" />
                  ) : (
                    <div className="h-2 w-2 rounded-full bg-gray-300 dark:bg-slate-600" />
                  )}
                </div>
                <span
                  className={`mt-1.5 text-[11px] font-medium text-center leading-tight ${
                    step.status === "pending"
                      ? "text-seal-gray-500 dark:text-slate-500"
                      : "text-seal-navy dark:text-white"
                  }`}
                >
                  {step.label}
                </span>
                {step.actor && (
                  <span className="text-[10px] text-seal-gray-500 dark:text-slate-400 text-center mt-0.5 max-w-[90px] truncate">
                    {step.actor}
                  </span>
                )}
                {step.date && (
                  <span className="text-[10px] text-seal-gray-500 dark:text-slate-500 text-center">
                    {step.date}
                  </span>
                )}
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 min-w-[20px] mx-1 rounded ${
                    step.status === "completed"
                      ? "bg-emerald-500"
                      : "bg-gray-200 dark:bg-slate-700"
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
