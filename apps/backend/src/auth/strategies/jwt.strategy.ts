import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { JwtPayload, RequestUser } from '../../common/interfaces';

const WEAK_JWT_DEFAULT = 'omnitech-access-secret-change-me';
const jwtStrategyLogger = new Logger('JwtStrategy');

/**
 * Extract JWT from:
 * 1. Authorization: Bearer <token> header (standard)
 * 2. ?token=<token> query parameter (for browser file downloads via window.open)
 */
function extractJwt(req: Request): string | null {
  // Try header first
  const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (fromHeader) return fromHeader;

  // Fallback to query param (for file downloads)
  const fromQuery = req.query?.token as string | undefined;
  if (fromQuery) return fromQuery;

  return null;
}

/** ANSSI R29 — Idle timeout (15 min). Au-delà, re-authentification obligatoire. */
const SESSION_IDLE_TIMEOUT_SECONDS = 15 * 60;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {
    const secret = process.env.JWT_ACCESS_SECRET || WEAK_JWT_DEFAULT;
    if (!process.env.JWT_ACCESS_SECRET || secret === WEAK_JWT_DEFAULT) {
      jwtStrategyLogger.warn(
        'SECURITY WARNING: JWT_ACCESS_SECRET is not set or uses the insecure default. ' +
        'Set a strong random secret in your environment before deploying to production.',
      );
    }
    super({
      jwtFromRequest: extractJwt,
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // ANSSI R29 — Session idle timeout (15 min).
    // On stocke le timestamp de dernière activité dans Redis.
    // Si le délai est dépassé, on force la re-authentification.
    const idleKey = `session:idle:${user.id}`;
    const lastActivity = await this.cacheService.get<number>(idleKey);

    if (lastActivity !== null) {
      const elapsed = Math.floor(Date.now() / 1000) - lastActivity;
      if (elapsed > SESSION_IDLE_TIMEOUT_SECONDS) {
        // Supprimer la clé pour éviter un blocage permanent
        await this.cacheService.set(idleKey, null, 1);
        throw new UnauthorizedException('Session expirée par inactivité');
      }
    }

    // Mettre à jour le timestamp de dernière activité (TTL = idle timeout + marge)
    await this.cacheService.set(
      idleKey,
      Math.floor(Date.now() / 1000),
      SESSION_IDLE_TIMEOUT_SECONDS + 60,
    );

    return {
      id: user.id,
      email: user.email,
      role: payload.role,
      departmentId: user.departmentId || undefined,
      iat: payload.iat,
      // Propagé pour `FreshMfaGuard` — décide si une re-validation MFA est
      // nécessaire pour les endpoints sensibles (admin, signatures, incidents,
      // compliance). Signé au login lorsque l'utilisateur valide son MFA.
      mfaValidatedAt: payload.mfaValidatedAt,
    };
  }
}
