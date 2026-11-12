import { UserRole } from "./enums";

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  departmentId?: string;
  iat?: number;
  /** Identifiant signé de la ligne refresh de cette session (absent sur les anciens JWT). */
  sid?: string;
  /**
   * Timestamp (ms epoch) du dernier challenge MFA validé sur cette session.
   * Sert au guard `FreshMfaGuard` pour exiger une re-validation périodique
   * (par défaut 12 h) sur les endpoints sensibles (admin, signatures, incidents,
   * compliance, politique MFA). Absent si l'utilisateur n'a jamais validé son
   * MFA dans cette session.
   */
  mfaValidatedAt?: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface RequestUser {
  id: string;
  email: string;
  role: UserRole;
  departmentId?: string | null;
  /**
   * Optionnels — peuvent être remplis par la JwtStrategy quand l'enrichissement
   * user (firstName/lastName/mfaRequired) est activé. Sinon non disponibles.
   */
  firstName?: string;
  lastName?: string;
  mfaRequired?: boolean;
  iat?: number;
  sid?: string;
  /**
   * Propagé depuis le JwtPayload — voir doc ci-dessus. Utilisé par
   * `FreshMfaGuard` pour décider si une re-validation MFA est requise.
   */
  mfaValidatedAt?: number;
}
