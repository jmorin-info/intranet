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

/**
 * Document lisible pour un utilisateur donné — matrice complète rôle × statut ×
 * classification, alignée sur DocumentsService.findById (documents.service.ts).
 *
 * Là où {@link canAccessDocumentByClassification} ne regarde QUE la
 * classification, ce helper ajoute les deux garde-fous manquants qui laissaient
 * fuir des brouillons / documents supprimés vers l'analyse ISO et le résumé IA :
 *   - `deletedAt` : un document soft-supprimé n'est JAMAIS lisible ;
 *   - `status`    : les rôles non privilégiés non-owner ne lisent que de
 *                   l'APPROVED (PRESTATAIRE en plus restreint à CONTRACT/public).
 *
 * Matrice (identique à findById) :
 *   - SUPER_ADMIN / ADMIN / DIRECTION : tout (hors soft-delete)
 *   - PRESTATAIRE  : owner, sinon APPROVED ET (category CONTRACT OU isPublic)
 *   - COLLABORATEUR: owner, sinon APPROVED ET classification PUBLIC/INTERNE
 *   - AUDITEUR     : APPROVED ET classification ≠ SECRET
 *   - REVIEWER     : tout sauf SECRET (sauf owner)
 *   - rôle inconnu : fail closed
 */
export interface ReadableDocument extends ClassifiedDocument {
  status: string;
  deletedAt?: Date | null;
  category?: string | null;
  isPublic?: boolean | null;
}

export function canReadDocument(doc: ReadableDocument, user: DocumentAccessUser): boolean {
  // Un document soft-supprimé n'est lisible par personne (cf. findById → 404).
  if (doc.deletedAt) return false;

  if (PRIVILEGED_ROLES.includes(user.role)) return true;

  const isOwner = !!doc.ownerId && !!user.id && doc.ownerId === user.id;
  const classification = doc.classification || "INTERNE";
  const isApproved = doc.status === "APPROVED";

  switch (user.role) {
    case "PRESTATAIRE":
      if (isOwner) return true;
      return isApproved && (doc.category === "CONTRACT" || !!doc.isPublic);
    case "COLLABORATEUR":
      if (isOwner) return true;
      return isApproved && ["PUBLIC", "INTERNE"].includes(classification);
    case "AUDITEUR":
      return isApproved && classification !== "SECRET";
    case "REVIEWER":
      return isOwner || classification !== "SECRET";
    default:
      // Rôle inconnu → fail closed
      return false;
  }
}
