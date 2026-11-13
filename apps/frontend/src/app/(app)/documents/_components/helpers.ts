import { DocumentStatus } from "@omnitech/shared";
import type { StatusTabKey } from "./types";

/**
 * Helpers, badges, charte SEAL pour la liste documentaire.
 * Couleurs PANTONE officielles : 202C (bordeaux), 715C (orange), 660C (bleu),
 * 349C (vert) — voir `seal_charter.md`.
 */

export const CLASS_COLORS: Record<string, string> = {
  PUBLIC: "border-l-[#006233] bg-[#006233]/5",
  INTERNE: "border-l-[#296DC1] bg-[#296DC1]/5",
  CONFIDENTIEL: "border-l-[#F9964A] bg-[#F9964A]/5",
  SECRET: "border-l-[#892034] bg-[#892034]/5",
};

// Labels canoniques par niveau (POL_015 §5 — Echelle de classification).
// Les valeurs techniques SECRET/CONFIDENTIEL/INTERNE/PUBLIC restent stables
// cote DB (compat retrocompat) mais l'UI doit afficher le libelle officiel
// « Niveau X — Libelle » plutot que la valeur brute du enum.
export const CARD_CLASS_BADGE: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  SECRET: {
    bg: "bg-[#892034]/10",
    text: "text-[#892034]",
    label: "Niveau 1 — Très sensible",
  },
  CONFIDENTIEL: {
    bg: "bg-[#F9964A]/10",
    text: "text-[#F9964A]",
    label: "Niveau 2 — Sensible",
  },
  INTERNE: {
    bg: "bg-[#296DC1]/10",
    text: "text-[#296DC1]",
    label: "Niveau 3 — Restreint",
  },
  PUBLIC: {
    bg: "bg-[#006233]/10",
    text: "text-[#006233]",
    label: "Niveau 4 — Public",
  },
};

export function categoryBadgeVariant(
  cat: string,
): "info" | "warning" | "success" | "error" | "navy" | "primary" {
  switch (cat) {
    case "POLICY":
      return "primary";
    case "PROCEDURE":
      return "info";
    case "PLAN":
      return "success";
    case "RECORD":
      return "navy";
    case "CONTRACT":
      return "warning";
    case "REPORT":
      return "info";
    default:
      return "navy";
  }
}

export function classificationVariant(
  c: string,
): "seal-bordeaux" | "seal-orange" | "seal-blue" | "seal-green" {
  switch (c) {
    case "SECRET":
      return "seal-bordeaux"; // PANTONE 202C
    case "CONFIDENTIEL":
      return "seal-orange"; // PANTONE 715C
    case "INTERNE":
      return "seal-blue"; // PANTONE 660C
    case "PUBLIC":
      return "seal-green"; // PANTONE 349C
    default:
      return "seal-blue";
  }
}

/**
 * Return a human-readable validity indicator based on the document review deadline.
 * Uses `nextReviewDate` (no `validUntil` field in the Prisma schema).
 * Colors follow the SEAL charter.
 */
export interface ValidityInfo {
  label: string;
  className: string;
}
export function getValidityInfo(
  nextReviewDate: string | null | undefined,
): ValidityInfo {
  if (!nextReviewDate) {
    return {
      label: "Échéance non définie",
      className:
        "bg-gray-100 text-seal-gray-500 dark:bg-slate-800 dark:text-slate-400",
    };
  }
  const reviewDate = new Date(nextReviewDate);
  if (!Number.isFinite(reviewDate.getTime())) return { label: "Échéance à vérifier", className: "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300" };
  const today = new Date();
  const diffMs = Date.UTC(reviewDate.getUTCFullYear(), reviewDate.getUTCMonth(), reviewDate.getUTCDate()) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Math.round(diffMs / 86400000);
  if (days < 0) {
    return {
      label: `Revue en retard de ${Math.abs(days)} j`,
      className:
        "bg-[#892034]/10 text-[#892034] dark:bg-[#892034]/20 dark:text-red-300",
    };
  }
  if (days <= 14) {
    return {
      label: `À revoir dans ${days} j`,
      className: "bg-[#F9964A]/15 text-[#F9964A] dark:text-amber-300",
    };
  }
  return {
    label: `Prochaine revue dans ${days} j`,
    className:
      "bg-[#006233]/10 text-[#006233] dark:bg-[#006233]/20 dark:text-emerald-300",
  };
}

/**
 * Filter tabs grouped on status families (the Prisma DocumentStatus enum has
 * more values than tabs, so we map ranges -> tab keys).
 */
export const STATUS_TAB_DEFS: Array<{
  key: StatusTabKey;
  label: string;
  color: string;
  statuses: DocumentStatus[] | null;
}> = [
  {
    key: "all",
    label: "Tous",
    color: "border-seal-gray-500 text-seal-gray-500",
    statuses: null,
  },
  {
    key: "drafts",
    label: "Brouillons",
    color: "border-[#296DC1] text-[#296DC1]",
    statuses: [DocumentStatus.DRAFT],
  },
  {
    key: "review",
    label: "En validation",
    color: "border-[#F9964A] text-[#F9964A]",
    statuses: [
      DocumentStatus.IN_REVIEW,
      DocumentStatus.REVIEW_APPROVED,
      DocumentStatus.PENDING_APPROVAL,
    ],
  },
  {
    key: "published",
    label: "Publiés",
    color: "border-[#006233] text-[#006233]",
    statuses: [DocumentStatus.APPROVED],
  },
  {
    key: "expired",
    label: "Obsolètes",
    color: "border-[#892034] text-[#892034]",
    statuses: [DocumentStatus.OBSOLETE],
  },
  {
    key: "archived",
    label: "Archivés",
    color:
      "border-gray-400 text-seal-gray-500 dark:border-slate-600 dark:text-slate-400",
    statuses: [DocumentStatus.ARCHIVED],
  },
];
