import { CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../common/interfaces';

/**
 * Ensures the authenticated user owns the ChatSession referenced in the route
 * parameter `:id`. SUPER_ADMIN bypasses the check (for audit access).
 *
 * Expects :
 *  - req.user (populated by JwtAuthGuard upstream)
 *  - req.params.id (UUID/CUID of the ChatSession)
 */
@Injectable()
export class SessionOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ params: { id?: string }; user?: RequestUser }>();
    const id = req.params?.id;
    const user = req.user;

    if (!id) return true; // let the controller throw its own 400 if needed
    if (!user) throw new ForbiddenException();

    const session = await this.prisma.chatSession.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!session) {
      throw new NotFoundException('Session introuvable');
    }

    if (session.userId !== user.id && user.role !== 'SUPER_ADMIN') {
      // Not found rather than forbidden to avoid disclosing existence.
      throw new NotFoundException('Session introuvable');
    }

    return true;
  }
}
