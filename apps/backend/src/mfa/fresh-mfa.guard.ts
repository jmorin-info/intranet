import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestUser } from '../common/interfaces';
import {
  REQUIRE_FRESH_MFA_KEY,
  RequireFreshMfaOptions,
} from './decorators/require-fresh-mfa.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * FreshMfaGuard — applique le contrat du décorateur `@RequireFreshMfa()`.
 *
 * Sur un endpoint annoté, lit le claim JWT `mfaValidatedAt`. Si :
 *  - le user n'a PAS de MFA activé en base → on laisse passer (la garde MFA
 *    obligatoire `MfaRequiredGuard` traite ce cas en amont via la politique
 *    mfaRequired). On ne bloque pas un utilisateur MFA-désactivé qui ne tombe
 *    pas sous la politique : il aurait déjà passé le login normalement.
 *  - le claim est absent ou trop ancien (> maxAgeMs) → 403 MFA_REVALIDATION_REQUIRED
 *  - le claim est récent → on laisse passer.
 *
 * Frontend : l'intercepteur axios redirige sur ce code vers `/mfa/revalidate`.
 *
 * ISO 27001 A.8.5 — re-authentification périodique pour les actions sensibles.
 */
@Injectable()
export class FreshMfaGuard implements CanActivate {
  private readonly logger = new Logger(FreshMfaGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const opts = this.reflector.getAllAndOverride<RequireFreshMfaOptions>(
      REQUIRE_FRESH_MFA_KEY,
      [context.getHandler(), context.getClass()],
    );
    // Pas de méta → pas de contrainte freshness.
    if (!opts) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as RequestUser | undefined;
    if (!user?.id) return true; // JwtAuthGuard rejettera sinon

    // Si le user n'a pas le MFA activé du tout, on n'exige pas de validation
    // fraîche — il tombera (ou pas) sous MfaRequiredGuard selon la politique.
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { mfaEnabled: true },
    });
    if (!dbUser?.mfaEnabled) return true;

    const maxAgeMs = opts.maxAgeMs ?? 12 * 60 * 60 * 1000;
    const validatedAt = user.mfaValidatedAt;
    const now = Date.now();

    if (
      typeof validatedAt !== 'number' ||
      Number.isNaN(validatedAt) ||
      now - validatedAt > maxAgeMs
    ) {
      this.logger.warn(
        `MFA revalidation required for user ${user.id} (path: ${req.method} ${req.url}, validatedAt=${validatedAt ?? 'none'}, maxAgeMs=${maxAgeMs})`,
      );
      throw new ForbiddenException({
        code: 'MFA_REVALIDATION_REQUIRED',
        message:
          'Re-validation MFA requise pour accéder à cette ressource. Rendez-vous sur /mfa/revalidate.',
      });
    }

    return true;
  }
}
