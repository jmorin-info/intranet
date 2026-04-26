import { Throttle } from '@nestjs/throttler';

export interface UserThrottleOptions {
  /** Limite de requêtes autorisées sur la fenêtre `ttl`. */
  limit: number;
  /** Fenêtre glissante en millisecondes. */
  ttl: number;
  /**
   * Durée de blocage explicite en ms après dépassement (par défaut = ttl).
   * Permet par exemple de bloquer 5 min après 5 échecs MFA en 1 min.
   */
  blockDuration?: number;
}

/**
 * Sucre syntaxique au-dessus de `@Throttle` : pose une politique de rate-limit
 * sur la **named throttler `default`** (la seule définie dans `app.module.ts`)
 * en kw-args plats. À combiner avec `@UseGuards(JwtAuthGuard, UserThrottlerGuard)`
 * pour activer le tracker par `userId` au lieu de l'IP.
 *
 * Exemple :
 *   @Post('mfa/verify')
 *   @UseGuards(JwtAuthGuard, UserThrottlerGuard)
 *   @UserThrottle({ limit: 5, ttl: 5 * 60_000 })
 */
export const UserThrottle = (options: UserThrottleOptions) =>
  Throttle({
    default: {
      limit: options.limit,
      ttl: options.ttl,
      ...(options.blockDuration !== undefined
        ? { blockDuration: options.blockDuration }
        : {}),
    },
  });
