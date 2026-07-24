/**
 * Contrôle d'accès documentaire par classification (ISO 27001 A.5.15).
 *
 * Règles identiques à RagService.getAccessibleDocumentIds (filtrage
 * pré-retrieval SQL) — centralisées ici pour les vérifications unitaires
 * (résumé IA, analyse ISO) où l'on connaît déjà le document.
 *
 * Échelle : PUBLIC < INTERNE < CONFIDENTIEL < SECRET.
 *   - PUBLIC / INTERNE      : tout utilisateur authentifié
 *   - CONFIDENTIEL          : owner, reviewer ou approver du document
 *   - SECRET                : owner uniquement
 *   - rôles privilégiés     : SUPER_ADMIN / ADMIN / DIRECTION → tout
 *   - classification inconnue → fail closed (aucun accès)
 */

export interface DocumentAccessUser {
  id: string;
  role: string;
}

export interface ClassifiedDocument {
  classification: string;
  ownerId: string;
  reviewerId?: string | null;
  approverId?: string | null;
}

const PRIVILEGED_ROLES = ["SUPER_ADMIN", "ADMIN", "DIRECTION"];

export function canAccessDocumentByClassification(
  doc: ClassifiedDocument,
  user: DocumentAccessUser,
): boolean {
  if (PRIVILEGED_ROLES.includes(user.role)) return true;

  switch (doc.classification) {
    case "PUBLIC":
    case "INTERNE":
      return true;
    case "CONFIDENTIEL":
      return doc.ownerId === user.id || doc.reviewerId === user.id || doc.approverId === user.id;
    case "SECRET":
      return doc.ownerId === user.id;
    default:
      // Classification inconnue → fail closed
      return false;
  }
}
