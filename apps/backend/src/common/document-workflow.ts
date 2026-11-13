// Matrice de transitions du cycle de vie documentaire (GED — ISO 27001 A.5.1).
//
// SOURCE DE VÉRITÉ : packages/shared/src/helpers.ts::getStatusTransitions().
// Le backend ne dépend PAS de @omnitech/shared (dépendance circulaire au build,
// cf. common/enums.ts) — cette fonction est donc un MIROIR strict de la version
// partagée. Toute évolution de la matrice DOIT être répercutée dans les deux
// fichiers pour que le front (boutons proposés) et le back (validation stricte)
// restent cohérents.
import { UserRole, ROLE_HIERARCHY } from "./enums";

export type DocumentStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "REVIEW_APPROVED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "OBSOLETE"
  | "ARCHIVED";

export const DOCUMENT_STATUSES: DocumentStatus[] = [
  "DRAFT",
  "IN_REVIEW",
  "REVIEW_APPROVED",
  "PENDING_APPROVAL",
  "APPROVED",
  "OBSOLETE",
  "ARCHIVED",
];

function canUserPerformAction(userRole: UserRole, requiredRole: UserRole): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 0);
}

/**
 * Retourne la liste des statuts atteignables via un PATCH manuel (hors
 * endpoints workflow dédiés) depuis `currentStatus`, compte tenu du rôle.
 * MIROIR de packages/shared/src/helpers.ts.
 */
export function getStatusTransitions(currentStatus: string, userRole: UserRole): DocumentStatus[] {
  const transitions: DocumentStatus[] = [];

  switch (currentStatus) {
    case "DRAFT":
      transitions.push("IN_REVIEW");
      if (canUserPerformAction(userRole, UserRole.ADMIN)) {
        transitions.push("ARCHIVED");
      }
      break;

    case "IN_REVIEW":
      transitions.push("DRAFT");
      if (canUserPerformAction(userRole, UserRole.REVIEWER)) {
        transitions.push("REVIEW_APPROVED");
      }
      break;

    case "REVIEW_APPROVED":
      transitions.push("PENDING_APPROVAL");
      transitions.push("DRAFT");
      break;

    case "PENDING_APPROVAL":
      if (canUserPerformAction(userRole, UserRole.DIRECTION)) {
        transitions.push("APPROVED");
        transitions.push("IN_REVIEW");
      }
      break;

    case "APPROVED":
      if (canUserPerformAction(userRole, UserRole.ADMIN)) {
        transitions.push("OBSOLETE");
        transitions.push("ARCHIVED");
      }
      if (canUserPerformAction(userRole, UserRole.DIRECTION)) {
        transitions.push("IN_REVIEW");
      }
      break;

    case "OBSOLETE":
      if (canUserPerformAction(userRole, UserRole.ADMIN)) {
        transitions.push("ARCHIVED");
        transitions.push("IN_REVIEW");
      }
      break;

    case "ARCHIVED":
      if (canUserPerformAction(userRole, UserRole.ADMIN)) {
        transitions.push("DRAFT");
      }
      break;
  }

  return transitions;
}

/**
 * Vrai si le passage `from → to` est autorisé pour ce rôle via un PATCH manuel.
 * Une transition « sur place » (from === to) est considérée neutre (autorisée).
 */
export function isLegalStatusTransition(from: string, to: string, userRole: UserRole): boolean {
  if (from === to) return true;
  return getStatusTransitions(from, userRole).includes(to as DocumentStatus);
}
