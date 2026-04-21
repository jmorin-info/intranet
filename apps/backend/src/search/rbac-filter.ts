import { UserRole, ROLE_HIERARCHY } from '../common/enums';

/**
 * RBAC filtering for Meilisearch results — ISO 27001 A.5.12 (classification
 * enforcement across search). Post-query filter: hits returned by Meili are
 * intersected with the classifications accessible by the current user.
 *
 * Règle de classification documentaire OMNITECH :
 *  - PUBLIC      : tous utilisateurs authentifiés
 *  - INTERNE     : rôle ≥ PRESTATAIRE (tous sauf anonymous)
 *  - CONFIDENTIEL: rôle ≥ REVIEWER (REVIEWER/MANAGER/DIRECTION/ADMIN/SUPER_ADMIN)
 *  - SECRET      : rôle ≥ ADMIN (ou owner du document)
 *
 * La classification est exposée sur les hits documents. Autres indexes (wiki,
 * news, tickets) n'ont pas de classification propre — ils restent filtrés par
 * la visibilité intrinsèque de leurs routes (toutes contrôlées par JwtGuard).
 */
export function allowedClassifications(role: UserRole | undefined): string[] {
  const level = role ? (ROLE_HIERARCHY[role] ?? 0) : 0;
  const allowed: string[] = ['PUBLIC'];
  if (level >= ROLE_HIERARCHY[UserRole.PRESTATAIRE]) allowed.push('INTERNE');
  if (level >= ROLE_HIERARCHY[UserRole.REVIEWER]) allowed.push('CONFIDENTIEL');
  if (level >= ROLE_HIERARCHY[UserRole.ADMIN]) allowed.push('SECRET');
  return allowed;
}

/**
 * Renvoie true si l'utilisateur peut voir un hit donné.
 * `type === 'document'` → check classification.
 * Autres types → toujours autorisé (filtrés en amont par les endpoints métier).
 */
export function canViewHit(
  hit: { type?: string; classification?: string | null; authorId?: string | null },
  user: { id: string; role: UserRole } | null | undefined,
): boolean {
  if (!user) return false;
  if (hit.type !== 'document') return true;
  const cls = (hit.classification || 'INTERNE').toUpperCase();
  // Owner bypass: l'auteur voit toujours son propre document
  if (hit.authorId && hit.authorId === user.id) return true;
  return allowedClassifications(user.role).includes(cls);
}
