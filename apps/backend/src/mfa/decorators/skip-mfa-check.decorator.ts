import { SetMetadata } from '@nestjs/common';

/**
 * Clé de méta utilisée par `MfaRequiredGuard` pour exempter une route ou un
 * controller de la vérification de la politique MFA (mfaRequired && !mfaEnabled).
 *
 * Exempter UNIQUEMENT :
 *  - les endpoints d'authentification (login, refresh, logout, password reset)
 *  - les endpoints MFA eux-mêmes (setup, activate, verify, status, revalidate…)
 *  - les endpoints en lecture seule indispensables à la page d'enrôlement
 *    (ex: /auth/me, /users/me)
 *  - les endpoints publics (/health, /trust, /legal)
 */
export const SKIP_MFA_CHECK_KEY = 'skipMfaCheck';

/**
 * @SkipMfaCheck() — exempte une route ou un controller de `MfaRequiredGuard`.
 *
 * Sans ce décorateur, tout utilisateur soumis à la politique MFA
 * (`mfaRequired=true && mfaEnabled=false`) reçoit `403 MFA_SETUP_REQUIRED`.
 */
export const SkipMfaCheck = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_MFA_CHECK_KEY, true);
