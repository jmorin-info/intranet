// Les enums + hiérarchie sont maintenus en double ici pour éviter la dépendance
// circulaire @omnitech/shared ↔ backend au build. Toute modification DOIT être
// synchronisée avec packages/shared/src/{enums,constants}.ts — celui-ci est la
// source de vérité, ce fichier n'est qu'un miroir.
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

export enum AuditSeverity {
  INFO = 'INFO',
  WARN = 'WARN',
  CRITICAL = 'CRITICAL',
}
