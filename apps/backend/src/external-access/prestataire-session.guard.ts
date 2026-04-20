import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../common/enums';

@Injectable()
export class PrestataireSessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Only apply to PRESTATAIRE role
    if (!user || user.role !== UserRole.PRESTATAIRE) return true;

    const access = await this.prisma.externalAccess.findFirst({
      where: { userId: user.id, isActive: true },
    });

    if (!access) {
      throw new ForbiddenException('Accès prestataire non configuré');
    }

    // Check expiration
    if (access.accessExpiresAt && new Date() > access.accessExpiresAt) {
      throw new ForbiddenException('Accès prestataire expiré');
    }

    // Check session timeout from JWT iat
    const tokenIat = request.user.iat;
    if (tokenIat) {
      const elapsed = Math.floor(Date.now() / 1000) - tokenIat;
      if (elapsed > access.sessionTimeout) {
        throw new ForbiddenException('Session prestataire expiree — reconnectez-vous');
      }
    }

    return true;
  }
}
