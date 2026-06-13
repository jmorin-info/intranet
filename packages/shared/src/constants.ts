import { DocumentStatus, DocumentCategory, UserRole } from "./enums";

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  [DocumentStatus.DRAFT]: "Brouillon",
  [DocumentStatus.IN_REVIEW]: "En revue",
  [DocumentStatus.REVIEW_APPROVED]: "Revue validée",
  [DocumentStatus.PENDING_APPROVAL]: "En attente d'approbation",
  [DocumentStatus.APPROVED]: "Approuvé",
  [DocumentStatus.OBSOLETE]: "Obsolète",
  [DocumentStatus.ARCHIVED]: "Archivé",
};

export const DOCUMENT_STATUS_COLORS: Record<DocumentStatus, string> = {
  [DocumentStatus.DRAFT]: "slate",
  [DocumentStatus.IN_REVIEW]: "blue",
  [DocumentStatus.REVIEW_APPROVED]: "cyan",
  [DocumentStatus.PENDING_APPROVAL]: "amber",
  [DocumentStatus.APPROVED]: "emerald",
  [DocumentStatus.OBSOLETE]: "red",
  [DocumentStatus.ARCHIVED]: "gray",
};

/** Libelles d'affichage des categories documentaires (PRO_040 §7.4). */
export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  [DocumentCategory.POLICY]: "Politique",
  [DocumentCategory.PROCEDURE]: "Procédure",
  [DocumentCategory.PLAN]: "Plan",
  [DocumentCategory.ORGANIZATION]: "Organisation",
  [DocumentCategory.INSTRUCTION]: "Instruction",
  [DocumentCategory.STANDARD]: "Standard",
  [DocumentCategory.GUIDE]: "Guide",
  [DocumentCategory.REGISTRY]: "Registre",
  [DocumentCategory.FORM]: "Formulaire",
  [DocumentCategory.RECORD]: "Enregistrement",
  [DocumentCategory.REPORT]: "Rapport",
  [DocumentCategory.CHARTER]: "Charte",
  [DocumentCategory.COMMUNICATION]: "Communication",
  [DocumentCategory.CONTRACT]: "Contrat",
  [DocumentCategory.OTHER]: "Autre",
};

/** Libelles d'affichage des niveaux documentaires (PRO_040 §7.1 pyramide). */
import { DocumentLevel, DocumentPriority } from "./enums";

export const DOCUMENT_LEVEL_LABELS: Record<DocumentLevel, string> = {
  [DocumentLevel.GOVERNANCE]: "Gouvernance",
  [DocumentLevel.OPERATIONAL]: "Opérationnel / maîtrise",
  [DocumentLevel.EVIDENCE]: "Preuve / enregistrement",
  [DocumentLevel.COMMUNICATION]: "Communication / engagement",
};

/** Libelles des priorites (REG_016 colonne H). */
export const DOCUMENT_PRIORITY_LABELS: Record<DocumentPriority, string> = {
  [DocumentPriority.CRITICAL]: "Critique",
  [DocumentPriority.HIGH]: "Haute",
  [DocumentPriority.MEDIUM]: "Moyenne",
  [DocumentPriority.LOW]: "Basse",
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: "Super Administrateur",
  [UserRole.ADMIN]: "Administrateur",
  [UserRole.DIRECTION]: "Direction",
  [UserRole.MANAGER]: "Manager",
  [UserRole.REVIEWER]: "Réviseur",
  [UserRole.COLLABORATEUR]: "Collaborateur",
  [UserRole.AUDITEUR]: "Auditeur",
  [UserRole.PRESTATAIRE]: "Prestataire externe",
};

// Hiérarchie canonique des rôles — référence unique utilisée côté frontend
// (via @omnitech/shared) ET côté backend (re-exportée depuis apps/backend/src/
// common/enums.ts). Avant 2026-04-21 les deux côtés divergeaient (ex : AUDITEUR
// valait 10 côté frontend et 40 côté backend) → comportements incohérents dans
// les guards RBAC selon la surface. Unifié ici.
//
// MANAGER (50) : encadrement intermédiaire, au-dessus de REVIEWER mais sous
// DIRECTION. Utilisé pour : owners d'espaces ticketing, publication runbooks,
// validation 1er niveau documentaire.
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.SUPER_ADMIN]: 100,
  [UserRole.ADMIN]: 80,
  [UserRole.DIRECTION]: 60,
  [UserRole.MANAGER]: 50,
  [UserRole.REVIEWER]: 40,
  [UserRole.COLLABORATEUR]: 20,
  [UserRole.AUDITEUR]: 10,
  [UserRole.PRESTATAIRE]: 5,
};

export const FILE_TYPES_ALLOWED: string[] = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const JWT_ACCESS_EXPIRY = "15m";
export const JWT_REFRESH_EXPIRY = "7d";

export const PAGINATION_DEFAULT_LIMIT = 20;
export const PAGINATION_MAX_LIMIT = 100;

export const REVIEW_REMINDER_DAYS = [30, 7, 0];

export const SIGNED_URL_EXPIRY_SECONDS = 3600;

export const DOCUMENT_REFERENCE_PREFIX = "OMS";

/**
 * Codes courts utilises dans la generation des references documentaires
 * (ex. OMS-PRO-IT-0002). Aligne sur les codes officiels PRO_040 §7.4 depuis
 * 2026-06-13 (alignement REG_016) : plus aucune divergence avec
 * `DOCUMENT_CATEGORY_CODE` (enums.ts).
 *
 * Verification migration : avant ce changement, le code legacy (PRC/PLN/GDE/
 * FRM/REC/RPT) n'avait jamais ete materialise en base — toutes les references
 * existantes utilisaient deja les codes officiels (POL, PRO, ...). Le swap
 * n'invalide donc aucune reference deja emise.
 */
export const REFERENCE_CATEGORY_CODES: Record<DocumentCategory, string> = {
  [DocumentCategory.POLICY]: "POL",
  [DocumentCategory.PROCEDURE]: "PRO",
  [DocumentCategory.PLAN]: "PLA",
  [DocumentCategory.ORGANIZATION]: "ORG",
  [DocumentCategory.INSTRUCTION]: "INS",
  [DocumentCategory.STANDARD]: "STD",
  [DocumentCategory.GUIDE]: "GUI",
  [DocumentCategory.REGISTRY]: "REG",
  [DocumentCategory.FORM]: "FOR",
  [DocumentCategory.RECORD]: "RAP",
  [DocumentCategory.REPORT]: "RAP",
  [DocumentCategory.CHARTER]: "CHA",
  [DocumentCategory.COMMUNICATION]: "COM",
  [DocumentCategory.CONTRACT]: "CTR",
  [DocumentCategory.OTHER]: "AUT",
};
