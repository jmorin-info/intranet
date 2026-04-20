import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class ChartesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  // List all chartes with their active version and signature count
  async findAll(activeOnly = true) {
    return this.prisma.charte.findMany({
      where: activeOnly ? { isActive: true } : {},
      include: {
        versions: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: { select: { signatures: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCharteById(id: string) {
    return this.prisma.charte.findUnique({
      where: { id },
      include: {
        versions: { orderBy: { createdAt: 'desc' } },
        _count: { select: { signatures: true } },
      },
    });
  }

  async findBySlug(slug: string) {
    const charte = await this.prisma.charte.findUnique({
      where: { slug },
      include: {
        versions: { orderBy: { createdAt: 'desc' } },
        _count: { select: { signatures: true } },
      },
    });
    if (!charte) throw new NotFoundException('Charte not found');
    return charte;
  }

  // Create a new charte (admin only)
  async create(data: { title: string; slug: string; isMandatory?: boolean; classification?: string }) {
    return this.prisma.charte.create({
      data: {
        title: data.title,
        slug: data.slug,
        isMandatory: data.isMandatory ?? true,
        classification: data.classification || 'INTERNE',
      },
    });
  }

  // Upload a new PDF version for a charte
  async uploadVersion(
    charteId: string,
    file: Express.Multer.File,
    versionNumber: string,
    changeLog: string | undefined,
    userId: string,
  ) {
    const charte = await this.prisma.charte.findUnique({ where: { id: charteId } });
    if (!charte) throw new NotFoundException('Charte not found');

    // Validate PDF
    if (file.mimetype !== 'application/pdf') {
      throw new ForbiddenException('Seuls les fichiers PDF sont acceptés');
    }

    // Upload file
    const { fileUrl } = await this.storage.upload(file, `chartes/${charteId}`);
    const checksum = await this.storage.generateChecksum(file);

    // Deactivate previous versions
    await this.prisma.charteVersion.updateMany({
      where: { charteId, isActive: true },
      data: { isActive: false },
    });

    // Create new version
    const version = await this.prisma.charteVersion.create({
      data: {
        charteId,
        versionNumber,
        fileUrl,
        fileType: file.mimetype,
        fileSizeBytes: file.size,
        checksum,
        changeLog,
        publishedAt: new Date(),
        isActive: true,
      },
    });

    // Reset ALL users' chartesAcceptedAt when a mandatory charte gets a new version.
    // This forces every user to re-check and re-sign, which is correct because
    // chartesAcceptedAt represents "all mandatory chartes signed at current version".
    // Non-mandatory chartes should not trigger this global reset.
    if (charte.isMandatory) {
      await this.prisma.user.updateMany({
        where: { chartesAcceptedAt: { not: null } },
        data: { chartesAcceptedAt: null },
      });
    }

    // Audit log
    await this.audit.log({
      userId,
      action: 'CHARTE_VERSION_UPLOADED',
      resourceType: 'Charte',
      resourceId: charteId,
      metadata: { versionNumber, changeLog, fileUrl },
      severity: 'INFO',
    });

    return version;
  }

  // Mark charte as signed by Direction
  async markSignedByDirection(charteId: string, userId: string) {
    const charte = await this.prisma.charte.findUnique({ where: { id: charteId } });
    if (!charte) throw new NotFoundException('Charte not found');

    const updated = await this.prisma.charte.update({
      where: { id: charteId },
      data: { signedByDirection: true },
    });

    await this.audit.log({
      userId,
      action: 'CHARTE_SIGNED_BY_DIRECTION',
      resourceType: 'Charte',
      resourceId: charteId,
      severity: 'WARN',
    });

    return updated;
  }

  // User signs a specific version of a charte
  async sign(charteId: string, userId: string, ipAddress?: string, userAgent?: string) {
    const charte = await this.prisma.charte.findUnique({
      where: { id: charteId },
      include: { versions: { where: { isActive: true }, take: 1 } },
    });
    if (!charte) throw new NotFoundException('Charte not found');
    if (!charte.signedByDirection) throw new ForbiddenException('Cette charte n\'a pas encore été validée par la Direction');

    const activeVersion = charte.versions[0];
    if (!activeVersion) throw new NotFoundException('Aucune version active pour cette charte');

    const sig = await this.prisma.charteSignature.upsert({
      where: {
        charteId_charteVersionId_userId: { charteId, charteVersionId: activeVersion.id, userId },
      },
      create: { charteId, charteVersionId: activeVersion.id, userId, ipAddress, userAgent },
      update: { signedAt: new Date(), ipAddress, userAgent },
    });

    // Audit log for compliance tracking
    await this.audit.log({
      userId,
      action: 'CHARTE_SIGNED',
      resourceType: 'Charte',
      resourceId: charteId,
      metadata: {
        charteTitle: charte.title,
        versionNumber: activeVersion.versionNumber,
        charteVersionId: activeVersion.id,
        ipAddress,
      },
      severity: 'INFO',
    });

    await this.updateUserChartesStatus(userId);
    return sig;
  }

  // Get chartes the user hasn't signed (for the current active version)
  async getUnsignedChartes(userId: string) {
    const mandatory = await this.prisma.charte.findMany({
      where: { isActive: true, isMandatory: true, signedByDirection: true },
      include: {
        versions: { where: { isActive: true }, take: 1 },
      },
    });

    if (mandatory.length === 0) return [];

    // Get all active version IDs
    const activeVersionIds = mandatory
      .map(c => c.versions[0]?.id)
      .filter((id): id is string => !!id);

    // Single query: get all signatures for this user on these versions
    const existingSignatures = await this.prisma.charteSignature.findMany({
      where: {
        userId,
        charteVersionId: { in: activeVersionIds },
      },
      select: { charteId: true, charteVersionId: true },
    });

    const signedSet = new Set(existingSignatures.map(s => `${s.charteId}:${s.charteVersionId}`));

    return mandatory
      .filter(charte => {
        const activeVersion = charte.versions[0];
        if (!activeVersion) return false;
        return !signedSet.has(`${charte.id}:${activeVersion.id}`);
      })
      .map(charte => ({ ...charte, activeVersion: charte.versions[0] }));
  }

  async hasSignedAllChartes(userId: string): Promise<boolean> {
    const unsigned = await this.getUnsignedChartes(userId);
    return unsigned.length === 0;
  }

  private async updateUserChartesStatus(userId: string) {
    const allSigned = await this.hasSignedAllChartes(userId);
    if (allSigned) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { chartesAcceptedAt: new Date() },
      });
    }
  }

  // Admin: get all signatures for a charte with version info
  async getSignatures(charteId: string, versionId?: string) {
    const where: any = { charteId };
    if (versionId) where.charteVersionId = versionId;

    return this.prisma.charteSignature.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, role: true, departmentId: true } },
        charteVersion: { select: { id: true, versionNumber: true } },
      },
      orderBy: { signedAt: 'desc' },
    });
  }

  async remove(charteId: string, userId: string) {
    const charte = await this.prisma.charte.findUnique({ where: { id: charteId } });
    if (!charte) throw new NotFoundException('Charte not found');

    // Delete all signatures, versions, then the charte
    await this.prisma.charteSignature.deleteMany({ where: { charteId } });
    await this.prisma.charteVersion.deleteMany({ where: { charteId } });
    await this.prisma.charte.delete({ where: { id: charteId } });

    await this.audit.log({
      userId,
      action: 'CHARTE_DELETED',
      resourceType: 'Charte',
      resourceId: charteId,
      metadata: { title: charte.title, slug: charte.slug },
      severity: 'WARN',
    });

    return { message: 'Charte supprimée' };
  }

  async createFromDocument(documentId: string, slug: string, isMandatory: boolean, userId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!doc) throw new NotFoundException('Document not found');

    const version = doc.versions[0];
    if (!version) throw new NotFoundException('Document has no version');

    // Create the charte
    const charte = await this.prisma.charte.create({
      data: {
        title: doc.title,
        slug,
        isMandatory,
        classification: doc.classification || 'INTERNE',
        signedByDirection: false,
      },
    });

    // Create version from document version
    await this.prisma.charteVersion.create({
      data: {
        charteId: charte.id,
        versionNumber: version.versionNumber || '1.0',
        fileUrl: version.fileUrl,
        fileType: version.fileType,
        fileSizeBytes: version.fileSizeBytes,
        checksum: version.checksum,
        changeLog: `Importé depuis le document ${doc.reference}`,
        publishedAt: new Date(),
        isActive: true,
      },
    });

    await this.audit.log({
      userId,
      action: 'CHARTE_CREATED_FROM_DOCUMENT',
      resourceType: 'Charte',
      resourceId: charte.id,
      metadata: { documentId, documentRef: doc.reference, title: doc.title },
    });

    return charte;
  }

  // Admin: compliance report - who has NOT signed
  async getComplianceReport(charteId: string) {
    const charte = await this.prisma.charte.findUnique({
      where: { id: charteId },
      include: { versions: { where: { isActive: true }, take: 1 } },
    });
    if (!charte) throw new NotFoundException('Charte not found');
    const activeVersion = charte.versions[0];
    if (!activeVersion) return { signed: [], unsigned: [], charte };

    const allActiveUsers = await this.prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, email: true, role: true, departmentId: true },
    });

    const signatures = await this.prisma.charteSignature.findMany({
      where: { charteId, charteVersionId: activeVersion.id },
      select: { userId: true, signedAt: true },
    });

    const signedUserIds = new Set(signatures.map(s => s.userId));
    const signedMap = new Map(signatures.map(s => [s.userId, s.signedAt]));

    const signed = allActiveUsers
      .filter(u => signedUserIds.has(u.id))
      .map(u => ({ ...u, signedAt: signedMap.get(u.id) }));

    const unsigned = allActiveUsers.filter(u => !signedUserIds.has(u.id));

    return { signed, unsigned, charte, activeVersion };
  }
}
