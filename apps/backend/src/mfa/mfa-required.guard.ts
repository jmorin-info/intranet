import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { SKIP_MFA_CHECK_KEY } from './decorators/skip-mfa-check.decorator';

/**
 * MfaRequiredGuard — APP_GUARD global qui ferme le trou de sécurité de la
 * politique MFA. Avant cette garde, la sécurité reposait UNIQUEMENT sur le flag
 * frontend `localStorage.mfaSetupRequired` : un attaquant qui forçait sa valeur
 * à `false` après login bypass-ait totalement la politique. Le backend émettait
 * un JWT pleinement fonctionnel malgré `mfaRequired=true && mfaEnabled=false`.
 *
 * Ce guard refuse toute requête authentifiée d'un user en état "MFA imposé mais
 * pas encore activé", SAUF les routes annotées `@SkipMfaCheck()`. Réponse :
 * `403 { code: 'MFA_SETUP_REQUIRED' }` que le frontend intercepte pour rediriger
 * vers `/mfa`.
 *
 * ISO 27001 A.8.5 (authentification forte) — applique réellement la politique MFA.
 */
@Injectable()
export class MfaRequiredGuard implements CanActivate {
  private readonly logger = new Logger(MfaRequiredGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_MFA_CHECK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as { id?: string } | undefined;
    // Pas d'utilisateur résolu → on laisse passer : c'est soit une route Public()
    // (déjà traitée), soit un cas où JwtAuthGuard rejettera ailleurs.
    if (!user?.id) return true;

    // Lecture des flags MFA depuis la DB (source de vérité). On ne se fie pas au JWT :
    // un admin peut imposer la politique MFA APRÈS l'émission du token, et la garde
    // doit prendre effet au prochain appel sans attendre l'expiration du JWT.
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        mfaRequired: true,
        mfaEnabled: true,
        // Wave D item 18 — WebAuthn enrollment compte aussi comme MFA actif
        // (compat OR avec TOTP). Si l'utilisateur a au moins 1 credential, la
        // politique mfaRequired est considérée satisfaite.
        _count: { select: { webauthnCredentials: true } },
      },
    });
    if (!dbUser) return true;

    const hasWebauthn = (dbUser._count?.webauthnCredentials ?? 0) > 0;
    const isEnrolled = dbUser.mfaEnabled === true || hasWebauthn;

    if (dbUser.mfaRequired === true && !isEnrolled) {
      this.logger.warn(
        `Blocked request from user ${user.id} — MFA policy enforced but not enrolled (path: ${req.method} ${req.url})`,
      );
      throw new ForbiddenException({
        code: 'MFA_SETUP_REQUIRED',
        message:
          "Activation MFA obligatoire avant d'accéder à l'intranet. Rendez-vous sur /mfa.",
      });
    }

    return true;
  }
}
