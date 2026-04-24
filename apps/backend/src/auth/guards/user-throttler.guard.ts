import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Per-user rate limiter (en plus du per-IP fourni par ThrottlerGuard global).
 *
 * Cas d'usage : empêcher un utilisateur dans un café (NAT partagé) d'être bloqué
 * par les requêtes des autres clients. On limite par identifiant utilisateur
 * (req.user.id, alimenté par JwtStrategy.validate) plutôt que par IP.
 *
 * Fallback : si l'endpoint est public (pas d'utilisateur authentifié), on
 * retombe sur l'IP — équivalent au comportement par défaut de ThrottlerGuard.
 *
 * À combiner avec le ThrottlerGuard global (déjà en place) qui continue de
 * limiter par IP — l'attaquant doit donc respecter LES DEUX limites.
 *
 * Usage :
 *   @UseGuards(JwtAuthGuard, UserThrottlerGuard)
 *   @Throttle({ default: { limit: 3, ttl: 60_000 } })
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // JwtStrategy.validate() pose req.user = { id, email, role, departmentId, iat }
    // Pour les anciens tokens / endpoints publics, on retombe sur l'IP.
    const userId = req?.user?.id ?? req?.user?.sub;
    if (userId) {
      return `user:${userId}`;
    }
    return `ip:${req?.ip ?? 'unknown'}`;
  }
}
