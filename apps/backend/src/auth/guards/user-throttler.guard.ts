import {
  Injectable,
  ExecutionContext,
  Optional,
  Logger,
} from '@nestjs/common';
import {
  ThrottlerGuard,
  ThrottlerException,
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerStorage,
  ThrottlerModuleOptions,
} from '@nestjs/throttler';
import type { ThrottlerLimitDetail } from '@nestjs/throttler';
import { ModuleRef, Reflector } from '@nestjs/core';
import { AuditService } from '../../audit/audit.service';

/**
 * Per-user rate limiter — étend le `ThrottlerGuard` officiel pour utiliser
 * `req.user.id` (alimenté par `JwtStrategy.validate`) comme tracker au lieu de
 * l'IP. Fallback automatique sur `req.ip` quand l'endpoint est public ou que le
 * JWT n'a pas été résolu, ce qui garantit la rétrocompat avec le `ThrottlerGuard`
 * global (toujours actif au niveau APP_GUARD — la contrainte IP reste donc
 * appliquée en plus, pas remplacée). Réutilise le storage Throttler du module
 * (in-memory par défaut, swappable Redis/cluster sans changement ici car la
 * clé `throttle:user:<id>:<endpoint>` est déjà unique). Sur dépassement
 * (HTTP 429), enregistre une trace `RATE_LIMIT_EXCEEDED` (severity=WARN) dans
 * `AuditService` pour la surveillance ISO 27001 A.5.36 — l'audit est
 * best-effort et n'interrompt jamais le throttling. Les en-têtes
 * `X-RateLimit-Limit`, `-Remaining`, `-Reset` sont posés nativement par
 * `ThrottlerGuard` (v6).
 *
 * Usage :
 *   @UseGuards(JwtAuthGuard, UserThrottlerGuard)
 *   @UserThrottle({ limit: 5, ttl: 60_000 })
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  private readonly auditLogger = new Logger('UserThrottlerGuard');

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    @Optional() private readonly moduleRef?: ModuleRef,
    @Optional() private readonly auditService?: AuditService,
  ) {
    super(options, storageService, reflector);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    // JwtStrategy.validate() pose req.user = { id, email, role, departmentId, iat }.
    // Pour les endpoints publics (ex: /auth/login), pas de user → on retombe
    // sur l'IP — équivalent au comportement par défaut.
    const userId = req?.user?.id ?? req?.user?.sub;
    if (userId) {
      return `user:${userId}`;
    }
    return `ip:${req?.ip ?? 'unknown'}`;
  }

  /**
   * Préfixe la clé de storage avec `throttle:user:{tracker}:{controller.handler}:{name}`
   * afin que les compteurs par-user soient isolés du throttler IP global et
   * identifiables dans Redis si le storage est swappé ultérieurement.
   */
  protected generateKey(
    context: ExecutionContext,
    suffix: string,
    name: string,
  ): string {
    const handler = context.getHandler().name;
    const cls = context.getClass().name;
    return `throttle:user:${suffix}:${cls}.${handler}:${name}`;
  }

  /**
   * Log RATE_LIMIT_EXCEEDED dans l'audit avant de lever 429. Best-effort :
   * toute erreur d'audit est avalée pour ne pas masquer le throttling.
   */
  protected async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    try {
      const { req } = this.getRequestResponse(context) as {
        req: Record<string, any>;
      };
      const userId: string | undefined = req?.user?.id ?? req?.user?.sub;
      const handler = context.getHandler().name;
      const controller = context.getClass().name;
      const route =
        req?.route?.path ||
        (typeof req?.originalUrl === 'string'
          ? req.originalUrl.split('?')[0]
          : undefined) ||
        `${controller}.${handler}`;

      // Préférer auditService injecté ; fallback via moduleRef si dispo
      // (utile quand le guard est instancié sans contexte d'injection complet).
      let audit = this.auditService;
      if (!audit && this.moduleRef) {
        try {
          audit = this.moduleRef.get(AuditService, { strict: false });
        } catch {
          audit = undefined;
        }
      }

      if (audit) {
        await audit.log({
          userId,
          ipAddress: req?.ip,
          userAgent: req?.headers?.['user-agent'],
          action: 'RATE_LIMIT_EXCEEDED',
          resourceType: 'throttle',
          resourceId: detail?.tracker,
          severity: 'WARN',
          metadata: {
            route,
            controller,
            handler,
            tracker: detail?.tracker,
            limit: detail?.limit,
            ttl: detail?.ttl,
            totalHits: detail?.totalHits,
            timeToExpire: detail?.timeToExpire,
            timeToBlockExpire: detail?.timeToBlockExpire,
          },
        });
      }
    } catch (err) {
      this.auditLogger.warn(
        `audit RATE_LIMIT_EXCEEDED skipped: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    throw new ThrottlerException(
      await this.getErrorMessage(context, detail),
    );
  }
}
