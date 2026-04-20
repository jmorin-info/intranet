import { DocumentCategory, DocumentStatus, UserRole } from './enums';
import {
  DOCUMENT_REFERENCE_PREFIX,
  REFERENCE_CATEGORY_CODES,
  ROLE_HIERARCHY,
} from './constants';
import { DocumentReference } from './types';

/**
 * Generates a document reference in the format "OMS-POL-SMSI-001".
 */
export function generateDocumentReference(
  category: DocumentCategory,
  domain: string,
  sequence: number,
): string {
  const categoryCode = REFERENCE_CATEGORY_CODES[category];
  const domainCode = domain.toUpperCase();
  const sequenceStr = String(sequence).padStart(3, '0');
  return `${DOCUMENT_REFERENCE_PREFIX}-${categoryCode}-${domainCode}-${sequenceStr}`;
}

/**
 * Parses a document reference string into its components.
 * Returns null if the reference does not match the expected format.
 */
export function parseDocumentReference(ref: string): DocumentReference | null {
  const parts = ref.split('-');
  if (parts.length !== 4) {
    return null;
  }

  const prefix = parts[0]!;
  const categoryCode = parts[1]!;
  const domainCode = parts[2]!;
  const sequenceStr = parts[3]!;
  const sequenceNumber = parseInt(sequenceStr, 10);

  if (prefix !== DOCUMENT_REFERENCE_PREFIX || isNaN(sequenceNumber)) {
    return null;
  }

  return {
    prefix,
    categoryCode,
    domainCode,
    sequenceNumber,
  };
}

/**
 * Checks whether a user with the given role can perform an action
 * that requires the specified role, based on the role hierarchy.
 */
export function canUserPerformAction(
  userRole: UserRole,
  requiredRole: UserRole,
): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Returns the list of valid next document statuses given the current status
 * and the user's role.
 */
export function getStatusTransitions(
  currentStatus: DocumentStatus,
  userRole: UserRole,
): DocumentStatus[] {
  const transitions: DocumentStatus[] = [];

  switch (currentStatus) {
    case DocumentStatus.DRAFT:
      transitions.push(DocumentStatus.IN_REVIEW);
      if (canUserPerformAction(userRole, UserRole.ADMIN)) {
        transitions.push(DocumentStatus.ARCHIVED);
      }
      break;

    case DocumentStatus.IN_REVIEW:
      transitions.push(DocumentStatus.DRAFT);
      if (canUserPerformAction(userRole, UserRole.REVIEWER)) {
        transitions.push(DocumentStatus.REVIEW_APPROVED);
      }
      break;

    case DocumentStatus.REVIEW_APPROVED:
      // Étape intermédiaire : le reviewer a validé, le RÉDACTEUR (owner)
      // doit confirmer pour lancer l'approbation finale. La vérification
      // "owner only" est faite côté backend (service).
      transitions.push(DocumentStatus.PENDING_APPROVAL);
      // Possibilité de revenir en DRAFT si modifications importantes requises
      transitions.push(DocumentStatus.DRAFT);
      break;

    case DocumentStatus.PENDING_APPROVAL:
      if (canUserPerformAction(userRole, UserRole.DIRECTION)) {
        transitions.push(DocumentStatus.APPROVED);
        transitions.push(DocumentStatus.IN_REVIEW);
      }
      break;

    case DocumentStatus.APPROVED:
      if (canUserPerformAction(userRole, UserRole.ADMIN)) {
        transitions.push(DocumentStatus.OBSOLETE);
        transitions.push(DocumentStatus.ARCHIVED);
      }
      if (canUserPerformAction(userRole, UserRole.DIRECTION)) {
        transitions.push(DocumentStatus.IN_REVIEW);
      }
      break;

    case DocumentStatus.OBSOLETE:
      if (canUserPerformAction(userRole, UserRole.ADMIN)) {
        transitions.push(DocumentStatus.ARCHIVED);
        transitions.push(DocumentStatus.IN_REVIEW);
      }
      break;

    case DocumentStatus.ARCHIVED:
      if (canUserPerformAction(userRole, UserRole.ADMIN)) {
        transitions.push(DocumentStatus.DRAFT);
      }
      break;
  }

  return transitions;
}

/**
 * Formats a file size in bytes to a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);

  return `${parseFloat(size.toFixed(1))} ${units[i]}`;
}

/**
 * Converts a text string into a URL-friendly slug.
 */
export function slugify(text: string): string {
  return text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Checks whether a role meets or exceeds the minimum required role
 * in the hierarchy.
 */
export function isRoleAtLeast(
  role: UserRole,
  minimumRole: UserRole,
): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minimumRole];
}
