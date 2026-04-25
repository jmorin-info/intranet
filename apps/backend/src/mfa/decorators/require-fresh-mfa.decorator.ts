import { SetMetadata } from '@nestjs/common';

/** Clé de méta lue par `FreshMfaGuard`. */
export const REQUIRE_FRESH_MFA_KEY = 'requireFreshMfa';

/** Durée par défaut d'une validation MFA (12 h en ms). */
export const DEFAULT_FRESH_MFA_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface RequireFreshMfaOptions {
  /**
   * Durée de validité du dernier challenge MFA, en millisecondes.
   * Au-delà, le guard renvoie 403 `MFA_REVALIDATION_REQUIRED` et le frontend
   * redirige vers `/mfa/revalidate`.
   *
   * Default: 12 h (43_200_000 ms).
   */
  maxAgeMs?: number;
}

/**
 * @RequireFreshMfa({ maxAgeMs }) — exige que le claim JWT `mfaValidatedAt` soit
 * récent (< maxAgeMs). À appliquer sur les endpoints sensibles (admin, signatures,
 * incidents, compliance, politique MFA).
 *
 * Si l'utilisateur n'a jamais validé son MFA OU si la validation est trop ancienne,
 * le guard renvoie `403 MFA_REVALIDATION_REQUIRED`. Le frontend l'intercepte et
 * redirige vers `/mfa/revalidate`.
 *
 * Implémentation : voir `apps/backend/src/mfa/fresh-mfa.guard.ts`.
 */
export const RequireFreshMfa = (
  options: RequireFreshMfaOptions = {},
): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_FRESH_MFA_KEY, {
    maxAgeMs: options.maxAgeMs ?? DEFAULT_FRESH_MFA_MAX_AGE_MS,
  });
