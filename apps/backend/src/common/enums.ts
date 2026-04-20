export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  DIRECTION = 'DIRECTION',
  REVIEWER = 'REVIEWER',
  COLLABORATEUR = 'COLLABORATEUR',
  AUDITEUR = 'AUDITEUR',
  PRESTATAIRE = 'PRESTATAIRE',
}

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  [UserRole.SUPER_ADMIN]: 100,
  [UserRole.ADMIN]: 80,
  [UserRole.DIRECTION]: 70,
  [UserRole.REVIEWER]: 50,
  [UserRole.AUDITEUR]: 40,
  [UserRole.COLLABORATEUR]: 20,
  [UserRole.PRESTATAIRE]: 10,
};

export enum AuditSeverity {
  INFO = 'INFO',
  WARN = 'WARN',
  CRITICAL = 'CRITICAL',
}
