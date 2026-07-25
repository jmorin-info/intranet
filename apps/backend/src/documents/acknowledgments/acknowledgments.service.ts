import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class AcknowledgmentsService {
  private readonly logger = new Logger(AcknowledgmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async acknowledge(
    documentId: string,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException('Document not found');
    }

    // Snapshot identité (ISO 27001 A.5.28) : l'attestation doit rester une
    // preuve exploitable 3 ans après une éventuelle suppression du compte
    // (User est en onDelete: SetNull). On fige donc email/nom/rôle au moment
    // du clic — jamais recalculés ensuite.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true, role: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const identitySnapshot = {
      userEmail: user.email,
      userFirstName: user.firstName,
      userLastName: user.lastName,
      userRole: String(user.role),
    };

    const acknowledgment = await this.prisma.documentAcknowledgment.upsert({
      where: {
        documentId_userId: {
          documentId,
          userId,
        },
      },
      create: {
        documentId,
        userId,
        ipAddress,
        userAgent,
        ...identitySnapshot,
      },
      update: {
        acknowledgedAt: new Date(),
        ipAddress,
        userAgent,
        ...identitySnapshot,
      },
    });

    await this.auditService.log({
      userId,
      ipAddress,
      userAgent,
      action: 'DOCUMENT_ACKNOWLEDGED',
      resourceType: 'Document',
      resourceId: documentId,
    });

    this.logger.log(`User ${userId} acknowledged document ${documentId}`);
    return acknowledgment;
  }

  async getAcknowledgments(documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException('Document not found');
    }

    return this.prisma.documentAcknowledgment.findMany({
      where: { documentId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { acknowledgedAt: 'desc' },
    });
  }

  async hasAcknowledged(documentId: string, userId: string): Promise<boolean> {
    const ack = await this.prisma.documentAcknowledgment.findUnique({
      where: {
        documentId_userId: {
          documentId,
          userId,
        },
      },
    });
    return !!ack;
  }

  async getAcknowledgmentStats(documentId: string) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document || document.deletedAt) {
      throw new NotFoundException('Document not found');
    }

    const [totalUsers, acknowledgedCount] = await Promise.all([
      this.prisma.user.count({
        where: { isActive: true, deletedAt: null },
      }),
      this.prisma.documentAcknowledgment.count({
        where: { documentId },
      }),
    ]);

    return {
      totalUsers,
      acknowledgedCount,
      percentage: totalUsers > 0 ? Math.round((acknowledgedCount / totalUsers) * 100) : 0,
    };
  }
}
