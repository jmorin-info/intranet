import type { WorkflowStep } from "@omnitech/ui";
import { formatDate } from "@/lib/utils";
import type { DocumentDetail } from "./types";

/**
 * Construit la timeline workflow ISO 27001 A.5.1 pour un document.
 * 5 étapes : Rédaction → Revue → Confirmation rédacteur → Direction → Publié.
 */
export function buildWorkflowSteps(doc: DocumentDetail): WorkflowStep[] {
  return [
    {
      label: "Rédaction",
      status: doc.status === "DRAFT" ? "current" : "completed",
      actor: `${doc.owner.firstName} ${doc.owner.lastName}`,
      date: formatDate(doc.createdAt),
    },
    {
      label: "Revue technique",
      status:
        doc.status === "IN_REVIEW"
          ? "current"
          : [
                "REVIEW_APPROVED",
                "PENDING_APPROVAL",
                "APPROVED",
                "OBSOLETE",
              ].includes(doc.status)
            ? "completed"
            : "pending",
      actor: doc.reviewer
        ? `${doc.reviewer.firstName} ${doc.reviewer.lastName}`
        : undefined,
    },
    {
      label: "Confirmation rédacteur",
      status:
        doc.status === "REVIEW_APPROVED"
          ? "current"
          : ["PENDING_APPROVAL", "APPROVED", "OBSOLETE"].includes(doc.status)
            ? "completed"
            : "pending",
      actor: `${doc.owner.firstName} ${doc.owner.lastName}`,
    },
    {
      label: "Approbation Direction",
      status:
        doc.status === "PENDING_APPROVAL"
          ? "current"
          : ["APPROVED", "OBSOLETE"].includes(doc.status)
            ? "completed"
            : "pending",
      actor: doc.approver
        ? `${doc.approver.firstName} ${doc.approver.lastName}`
        : undefined,
    },
    {
      label: "Publié",
      status:
        doc.status === "APPROVED" || doc.status === "OBSOLETE"
          ? "completed"
          : "pending",
      date: doc.status === "APPROVED" ? formatDate(doc.updatedAt) : undefined,
    },
  ];
}
