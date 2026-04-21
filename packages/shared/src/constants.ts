import { DocumentStatus, DocumentCategory, UserRole } from './enums';

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  [DocumentStatus.DRAFT]: 'Brouillon',
  [DocumentStatus.IN_REVIEW]: 'En revue',
  [DocumentStatus.REVIEW_APPROVED]: 'Revue validée',
  [DocumentStatus.PENDING_APPROVAL]: 'En attente d\'approbation',
  [DocumentStatus.APPROVED]: 'Approuvé',
  [DocumentStatus.OBSOLETE]: 'Obsolète',
  [DocumentStatus.ARCHIVED]: 'Archivé',
};

export const DOCUMENT_STATUS_COLORS: Record<DocumentStatus, string> = {
  [DocumentStatus.DRAFT]: 'slate',
  [DocumentStatus.IN_REVIEW]: 'blue',
  [DocumentStatus.REVIEW_APPROVED]: 'cyan',
  [DocumentStatus.PENDING_APPROVAL]: 'amber',
  [DocumentStatus.APPROVED]: 'emerald',
  [DocumentStatus.OBSOLETE]: 'red',
  [DocumentStatus.ARCHIVED]: 'gray',
};

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  [DocumentCategory.POLICY]: 'Politique',
  [DocumentCategory.PROCEDURE]: 'Procédure',
  [DocumentCategory.PLAN]: 'Plan',
  [DocumentCategory.RECORD]: 'Enregistrement',
  [DocumentCategory.FORM]: 'Formulaire',
  [DocumentCategory.GUIDE]: 'Guide',
  [DocumentCategory.REPORT]: 'Rapport',
  [DocumentCategory.CONTRACT]: 'Contrat',
  [DocumentCategory.OTHER]: 'Autre',
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: 'Super Administrateur',
  [UserRole.ADMIN]: 'Administrateur',
  [UserRole.DIRECTION]: 'Direction',
  [UserRole.MANAGER]: 'Manager',
  [UserRole.REVIEWER]: 'Réviseur',
  [UserRole.COLLABORATEUR]: 'Collaborateur',
  [UserRole.AUDITEUR]: 'Auditeur',
  [UserRole.PRESTATAIRE]: 'Prestataire externe',
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
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const JWT_ACCESS_EXPIRY = '15m';
export const JWT_REFRESH_EXPIRY = '7d';

export const PAGINATION_DEFAULT_LIMIT = 20;
export const PAGINATION_MAX_LIMIT = 100;

export const REVIEW_REMINDER_DAYS = [30, 7, 0];

export const SIGNED_URL_EXPIRY_SECONDS = 3600;

export const DOCUMENT_REFERENCE_PREFIX = 'OMS';

export const REFERENCE_CATEGORY_CODES: Record<DocumentCategory, string> = {
  [DocumentCategory.POLICY]: 'POL',
  [DocumentCategory.PROCEDURE]: 'PRC',
  [DocumentCategory.PLAN]: 'PLN',
  [DocumentCategory.RECORD]: 'REC',
  [DocumentCategory.FORM]: 'FRM',
  [DocumentCategory.GUIDE]: 'GDE',
  [DocumentCategory.REPORT]: 'RPT',
  [DocumentCategory.CONTRACT]: 'CTR',
  [DocumentCategory.OTHER]: 'OTH',
};
