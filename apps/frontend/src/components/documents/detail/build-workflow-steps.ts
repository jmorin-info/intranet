import type { WorkflowStep } from "@omnitech/ui";
import { formatDate } from "@/lib/utils";
import type { DocumentDetail, ValidationStepData } from "./types";

type StageStatus = WorkflowStep["status"];

/**
 * Détail d'affichage d'une étape, dérivé de la ValidationStep réelle :
 * l'acteur affiché est le DÉCIDEUR réel (decidedBy) et non l'assigné, avec
 * mention explicite « a validé / a rejeté » vs « assigné ». En cas de
 * dérogation ADMIN (décideur ≠ assigné), l'assigné est rappelé.
 */
function stepDisplay(step?: ValidationStepData): {
  actor?: string;
  date?: string;
  comment?: string;
} {
  if (!step) return {};
  const assigned = step.assignedTo;
  const decider = step.decidedBy ?? step.assignedTo;
  let actor: string | undefined;

  if (step.action) {
    const verb = step.action === "REJECTED" ? "a rejeté" : "a validé";
    const name = decider ? `${decider.firstName} ${decider.lastName}` : undefined;
    const isDerogation =
      step.decidedBy &&
      assigned &&
      step.decidedBy.id !== undefined &&
      assigned.id !== undefined &&
      step.decidedBy.id !== assigned.id;
    const derog = isDerogation
      ? ` (dérogation, assigné : ${assigned.firstName} ${assigned.lastName})`
      : "";
    actor = name ? `${name} — ${verb}${derog}` : undefined;
  } else if (assigned) {
    actor = `${assigned.firstName} ${assigned.lastName} (assigné)`;
  }

  return {
    actor,
    date: step.actionAt ? formatDate(step.actionAt) : undefined,
    comment: step.comment ?? undefined,
  };
}

/**
 * Construit la timeline workflow ISO 27001 A.5.1 pour un document, à partir des
 * ValidationStep réelles (validationRequests[0].steps) enrichies du statut du
 * document. Étapes : Rédaction → [Vérification] → Revue → Confirmation
 * rédacteur → Approbation → Publié. L'étape Vérification n'apparaît que si un
 * vérificateur est désigné ou qu'une étape VERIFICATION existe.
 */
export function buildWorkflowSteps(doc: DocumentDetail): WorkflowStep[] {
  const request = doc.validationRequests?.[0];
  const steps = request?.steps ?? [];
  const currentStep = request?.currentStep;
  const stepFor = (type: string) => steps.find((s) => s.stepType === type);

  const status = doc.status;
  const reachedReviewDone = [
    "REVIEW_APPROVED",
    "PENDING_APPROVAL",
    "APPROVED",
    "OBSOLETE",
  ].includes(status);
  const reachedApprovalReq = ["PENDING_APPROVAL", "APPROVED", "OBSOLETE"].includes(status);
  const reachedApproved = ["APPROVED", "OBSOLETE"].includes(status);

  const ownerName = `${doc.owner.firstName} ${doc.owner.lastName}`;
  const verifStep = stepFor("VERIFICATION");
  const reviewStep = stepFor("REVIEW");
  const approvalStep = stepFor("APPROVAL");
  const hasVerification = !!doc.verifier || !!verifStep;

  const result: WorkflowStep[] = [];

  // 1 — Rédaction
  result.push({
    label: "Rédaction",
    status: status === "DRAFT" ? "current" : "completed",
    actor: ownerName,
    date: formatDate(doc.createdAt),
  });

  // 2 — Vérification (optionnelle)
  if (hasVerification) {
    let vStatus: StageStatus;
    if (verifStep?.action === "APPROVED") vStatus = "completed";
    else if (status === "IN_REVIEW" && currentStep === "VERIFICATION") vStatus = "current";
    else if (reachedReviewDone || currentStep === "REVIEW") vStatus = "completed";
    else vStatus = "pending";
    const d = stepDisplay(verifStep);
    result.push({
      label: "Vérification",
      status: vStatus,
      actor:
        d.actor ??
        (doc.verifier ? `${doc.verifier.firstName} ${doc.verifier.lastName} (assigné)` : undefined),
      date: d.date,
      comment: d.comment,
    });
  }

  // 3 — Revue technique
  let rStatus: StageStatus;
  if (reviewStep?.action === "APPROVED") rStatus = "completed";
  else if (status === "IN_REVIEW" && currentStep !== "VERIFICATION") rStatus = "current";
  else if (reachedReviewDone) rStatus = "completed";
  else rStatus = "pending";
  const rd = stepDisplay(reviewStep);
  result.push({
    label: "Revue technique",
    status: rStatus,
    actor:
      rd.actor ??
      (doc.reviewer ? `${doc.reviewer.firstName} ${doc.reviewer.lastName} (assigné)` : undefined),
    date: rd.date,
    comment: rd.comment,
  });

  // 4 — Confirmation rédacteur
  result.push({
    label: "Confirmation rédacteur",
    status: status === "REVIEW_APPROVED" ? "current" : reachedApprovalReq ? "completed" : "pending",
    actor: ownerName,
  });

  // 5 — Approbation
  let aStatus: StageStatus;
  if (approvalStep?.action === "APPROVED") aStatus = "completed";
  else if (status === "PENDING_APPROVAL") aStatus = "current";
  else if (reachedApproved) aStatus = "completed";
  else aStatus = "pending";
  const ad = stepDisplay(approvalStep);
  result.push({
    label: "Approbation Direction",
    status: aStatus,
    actor:
      ad.actor ??
      (doc.approver ? `${doc.approver.firstName} ${doc.approver.lastName} (assigné)` : undefined),
    date: ad.date,
    comment: ad.comment,
  });

  // 6 — Publié
  result.push({
    label: "Publié",
    status: reachedApproved ? "completed" : "pending",
    date: status === "APPROVED" ? formatDate(doc.updatedAt) : undefined,
  });

  return result;
}
