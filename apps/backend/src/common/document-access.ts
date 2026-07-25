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

  // Comparaison d'identités : un id absent des deux côtés (document orphelin,
  // contexte d'auth incomplet) ne doit JAMAIS matcher — sinon `null === null`
  // ouvrirait un document SECRET à un appelant sans identité.
  const isSameUser = (id: string | null | undefined): boolean =>
    !!id && !!user.id && id === user.id;

  switch (doc.classification) {
    case "PUBLIC":
    case "INTERNE":
      return true;
    case "CONFIDENTIEL":
      return isSameUser(doc.ownerId) || isSameUser(doc.reviewerId) || isSameUser(doc.approverId);
    case "SECRET":
      return isSameUser(doc.ownerId);
    default:
      // Classification inconnue → fail closed
      return false;
  }
}
