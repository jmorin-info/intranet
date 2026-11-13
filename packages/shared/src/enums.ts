export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  DIRECTION = 'DIRECTION',
  MANAGER = 'MANAGER',
  REVIEWER = 'REVIEWER',
  COLLABORATEUR = 'COLLABORATEUR',
  AUDITEUR = 'AUDITEUR',
  PRESTATAIRE = 'PRESTATAIRE',
}

export enum DocumentStatus {
  DRAFT = 'DRAFT',
  IN_REVIEW = 'IN_REVIEW',
  REVIEW_APPROVED = 'REVIEW_APPROVED', // Reviewer a validé, attente confirmation du rédacteur
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  OBSOLETE = 'OBSOLETE',
  ARCHIVED = 'ARCHIVED',
}

/**
 * DocumentCategory — types documentaires du SMSI OMNITECH.
 * Aligne sur PRO_040 §7.4 (Nomenclature des abreviations) qui regit
 * la codification des documents (CHA, FOR, POL, PRO, REG, INS, GUI,
 * COM, ORG, PLA, RAP). Le mapping enum -> code PRO_040 :
 *   POLICY       -> POL  (Gouvernance)
 *   PLAN         -> PLA  (Gouvernance)
 *   ORGANIZATION -> ORG  (Gouvernance)   [ajoute 2026-06-13 pour REG_016]
 *   PROCEDURE    -> PRO  (Operationnel)
 *   INSTRUCTION  -> INS  (Operationnel)  [ajoute 2026-06-13]
 *   STANDARD     -> STD  (Operationnel)  [ajoute 2026-06-13 — INS legacy]
 *   GUIDE        -> GUI  (Operationnel)
 *   REGISTRY     -> REG  (Preuve / enregistrement) [ajoute 2026-06-13]
 *   FORM         -> FOR  (Preuve / enregistrement)
 *   RECORD       -> RAP/CR (Preuve / enregistrement)
 *   REPORT       -> RAP  (Preuve / enregistrement)
 *   CHARTER      -> CHA  (Communication / engagement) [ajoute 2026-06-13]
 *   COMMUNICATION-> COM  (Communication / engagement) [ajoute 2026-06-13]
 *   CONTRACT     -> (hors PRO_040 — document metier conserve pour compat)
 *   OTHER        -> (categorie de derniere chance)
 */
export enum DocumentCategory {
  POLICY = 'POLICY',
  PROCEDURE = 'PROCEDURE',
  PLAN = 'PLAN',
  ORGANIZATION = 'ORGANIZATION',
  INSTRUCTION = 'INSTRUCTION',
  STANDARD = 'STANDARD',
  GUIDE = 'GUIDE',
  REGISTRY = 'REGISTRY',
  FORM = 'FORM',
  RECORD = 'RECORD',
  REPORT = 'REPORT',
  CHARTER = 'CHARTER',
  COMMUNICATION = 'COMMUNICATION',
  CONTRACT = 'CONTRACT',
  OTHER = 'OTHER',
}

/**
 * DocumentLevel — niveau de la pyramide documentaire (PRO_040 §7.1).
 * Determine l'autorite d'approbation et la portee. Cf. REG_016 colonne D.
 */
export enum DocumentLevel {
  GOVERNANCE = 'GOVERNANCE',       // Politique, Plan, Organisation -> Direction / RSSI
  OPERATIONAL = 'OPERATIONAL',     // Procedure, Instruction, Standard, Guide -> RSSI / Resp. processus
  EVIDENCE = 'EVIDENCE',           // Registre, Formulaire, Compte rendu, Journal, Rapport -> Qualite / Proprietaire
  COMMUNICATION = 'COMMUNICATION', // Charte, Communication -> Direction / RH / RSSI
}

/**
 * DocumentPriority — priorite metier (REG_016 colonne H).
 * Conditionne le SLA de revue et l'ordonnancement des actions correctives.
 */
export enum DocumentPriority {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

/**
 * Mapping DocumentCategory -> code PRO_040 §7.4 (pour reference / affichage).
 */
export const DOCUMENT_CATEGORY_CODE: Record<DocumentCategory, string> = {
  [DocumentCategory.POLICY]: 'POL',
  [DocumentCategory.PROCEDURE]: 'PRO',
  [DocumentCategory.PLAN]: 'PLA',
  [DocumentCategory.ORGANIZATION]: 'ORG',
  [DocumentCategory.INSTRUCTION]: 'INS',
  [DocumentCategory.STANDARD]: 'STD',
  [DocumentCategory.GUIDE]: 'GUI',
  [DocumentCategory.REGISTRY]: 'REG',
  [DocumentCategory.FORM]: 'FOR',
  [DocumentCategory.RECORD]: 'RAP',
  [DocumentCategory.REPORT]: 'RAP',
  [DocumentCategory.CHARTER]: 'CHA',
  [DocumentCategory.COMMUNICATION]: 'COM',
  [DocumentCategory.CONTRACT]: 'CTR',
  [DocumentCategory.OTHER]: 'AUT',
};

/**
 * Mapping DocumentCategory -> DocumentLevel (PRO_040 §7.1 pyramide).
 */
export const DOCUMENT_CATEGORY_LEVEL: Record<DocumentCategory, DocumentLevel> = {
  [DocumentCategory.POLICY]: DocumentLevel.GOVERNANCE,
  [DocumentCategory.PLAN]: DocumentLevel.GOVERNANCE,
  [DocumentCategory.ORGANIZATION]: DocumentLevel.GOVERNANCE,
  [DocumentCategory.PROCEDURE]: DocumentLevel.OPERATIONAL,
  [DocumentCategory.INSTRUCTION]: DocumentLevel.OPERATIONAL,
  [DocumentCategory.STANDARD]: DocumentLevel.OPERATIONAL,
  [DocumentCategory.GUIDE]: DocumentLevel.OPERATIONAL,
  [DocumentCategory.REGISTRY]: DocumentLevel.EVIDENCE,
  [DocumentCategory.FORM]: DocumentLevel.EVIDENCE,
  [DocumentCategory.RECORD]: DocumentLevel.EVIDENCE,
  [DocumentCategory.REPORT]: DocumentLevel.EVIDENCE,
  [DocumentCategory.CHARTER]: DocumentLevel.COMMUNICATION,
  [DocumentCategory.COMMUNICATION]: DocumentLevel.COMMUNICATION,
  [DocumentCategory.CONTRACT]: DocumentLevel.EVIDENCE,
  [DocumentCategory.OTHER]: DocumentLevel.EVIDENCE,
};

export enum NotificationType {
  DOC_PUBLISHED = 'DOC_PUBLISHED',
  DOC_REVIEW_NEEDED = 'DOC_REVIEW_NEEDED',
  DOC_APPROVAL_NEEDED = 'DOC_APPROVAL_NEEDED',
  DOC_APPROVED = 'DOC_APPROVED',
  DOC_REJECTED = 'DOC_REJECTED',
  SIGNATURE_NEEDED = 'SIGNATURE_NEEDED',
  REVIEW_OVERDUE = 'REVIEW_OVERDUE',
  ACK_REQUIRED = 'ACK_REQUIRED',
  NEWS_POSTED = 'NEWS_POSTED',
  EXTERNAL_ACCESS_REVIEW = 'EXTERNAL_ACCESS_REVIEW',
  TICKET_CREATED = 'TICKET_CREATED',
  TICKET_UPDATED = 'TICKET_UPDATED',
  TICKET_SLA_BREACH = 'TICKET_SLA_BREACH',
  // Veille cyber — types dédiés (2026-07-23), remplacent la réutilisation
  // de DOC_PUBLISHED pour les alertes critiques et bulletins hebdomadaires.
  VEILLE_CRITICAL = 'VEILLE_CRITICAL',
  VEILLE_BULLETIN = 'VEILLE_BULLETIN',
}

export enum AuditSeverity {
  INFO = 'INFO',
  WARN = 'WARN',
  CRITICAL = 'CRITICAL',
}

export enum SignatureStatus {
  PENDING = 'PENDING',
  SIGNED = 'SIGNED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}
