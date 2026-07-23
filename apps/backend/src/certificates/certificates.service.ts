import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import sharp from "sharp";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { NotificationType } from "@prisma/client";
import { CreateCertificateDto } from "./dto/create-certificate.dto";
import { UpdateCertificateDto } from "./dto/update-certificate.dto";
import { RequestUser } from "../common/interfaces";

const THUMBS_DIR = path.join(process.cwd(), "uploads", "certificates", "thumbs");
const THUMB_SIZE = 256;
const IMAGE_MIMES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Génère un thumbnail 256x256 (mode cover) à partir d'un fichier de certificat.
   * - Image (jpg/png/webp/gif) → sharp resize WebP
   * - PDF → tente pdftoppm (poppler-utils). Si binaire absent ou erreur,
   *         retourne null sans planter (à installer au déploiement, cf. README).
   * - Autre → null
   * Retourne le path public-relatif (ex: /uploads/certificates/thumbs/xxx.webp)
   * ou null si non générable.
   */
  async generateThumbnail(filePath: string, mimeType: string): Promise<string | null> {
    try {
      if (!fs.existsSync(THUMBS_DIR)) {
        fs.mkdirSync(THUMBS_DIR, { recursive: true });
      }
    } catch (err) {
      this.logger.warn(`Création dossier thumbs certificats échouée : ${err}`);
      return null;
    }

    const mime = (mimeType || "").toLowerCase();
    const baseName = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const outPath = path.join(THUMBS_DIR, `${baseName}.webp`);
    const publicUrl = `/uploads/certificates/thumbs/${baseName}.webp`;

    if (IMAGE_MIMES.has(mime)) {
      try {
        await sharp(filePath)
          .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover", position: "attention" })
          .webp({ quality: 82 })
          .toFile(outPath);
        return publicUrl;
      } catch (err) {
        this.logger.warn(`Thumbnail certificat (image) échoué pour ${filePath} : ${err}`);
        return null;
      }
    }

    if (mime === "application/pdf") {
      // pdftoppm produit "<outBase>-1.jpg" pour la première page.
      const tmpBase = path.join(THUMBS_DIR, `${baseName}.pdf-tmp`);
      const ok = await new Promise<boolean>((resolve) => {
        const proc = spawn(
          "pdftoppm",
          ["-r", "72", "-f", "1", "-l", "1", "-jpeg", filePath, tmpBase],
          { stdio: ["ignore", "ignore", "pipe"] },
        );
        let stderr = "";
        proc.stderr?.on("data", (d: Buffer) => {
          stderr += d.toString();
        });
        proc.on("error", (err) => {
          this.logger.warn(`pdftoppm indisponible (poppler-utils non installé ?) : ${err.message}`);
          resolve(false);
        });
        proc.on("close", (code) => {
          if (code !== 0) {
            this.logger.warn(`pdftoppm exit=${code} stderr=${stderr.slice(-200)}`);
            resolve(false);
          } else {
            resolve(true);
          }
        });
        setTimeout(() => {
          proc.kill("SIGKILL");
          resolve(false);
        }, 15_000);
      });

      const tmpJpg = `${tmpBase}-1.jpg`;
      if (!ok) {
        // Cleanup éventuels résidus
        try {
          if (fs.existsSync(tmpJpg)) fs.unlinkSync(tmpJpg);
        } catch {
          /* ignore */
        }
        return null;
      }

      try {
        await sharp(tmpJpg)
          .resize(THUMB_SIZE, THUMB_SIZE, { fit: "cover", position: "attention" })
          .webp({ quality: 82 })
          .toFile(outPath);
        return publicUrl;
      } catch (err) {
        this.logger.warn(`sharp resize PDF preview échoué pour ${filePath} : ${err}`);
        return null;
      } finally {
        try {
          if (fs.existsSync(tmpJpg)) fs.unlinkSync(tmpJpg);
        } catch {
          /* ignore */
        }
      }
    }

    return null;
  }

  /**
   * Wrapper qui génère le thumbnail à partir d'un fileUrl public-relatif
   * (ex: /uploads/certificates/xxx.pdf) et met à jour le certificat.
   * Best-effort : ne lève jamais — un échec laisse simplement thumbnailUrl null.
   */
  async regenerateThumbnailForCert(
    certId: string,
    fileUrl: string | null | undefined,
    mimeOrExt: string | null | undefined,
  ): Promise<void> {
    try {
      if (!fileUrl) return;
      const absPath = path.join(process.cwd(), fileUrl.replace(/^\//, ""));
      if (!fs.existsSync(absPath)) return;

      // Déduit le mime depuis l'extension si absent
      let mime = (mimeOrExt || "").toLowerCase();
      if (!mime || !mime.includes("/")) {
        const ext = path.extname(absPath).toLowerCase();
        if (ext === ".pdf") mime = "application/pdf";
        else if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
        else if (ext === ".png") mime = "image/png";
        else if (ext === ".webp") mime = "image/webp";
        else if (ext === ".gif") mime = "image/gif";
      }

      const thumbnailUrl = await this.generateThumbnail(absPath, mime);
      if (thumbnailUrl) {
        await this.prisma.certificate.update({
          where: { id: certId },
          data: { thumbnailUrl },
        });
      }
    } catch (err) {
      this.logger.warn(`regenerateThumbnailForCert échoué pour ${certId} : ${err}`);
    }
  }

  private addStatus<T extends { expiresAt: Date | null }>(
    cert: T,
  ): T & { status: "valid" | "expired" } {
    const now = new Date();
    const status = cert.expiresAt && cert.expiresAt < now ? "expired" : "valid";
    return { ...cert, status };
  }

  async findMy(userId: string) {
    const certs = await this.prisma.certificate.findMany({
      where: { userId },
      orderBy: { obtainedAt: "desc" },
    });
    return certs.map((c) => this.addStatus(c));
  }

  async findAll(filters: {
    userId?: string;
    externalPersonId?: string;
    certType?: string;
    status?: "valid" | "expired" | "all";
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const where: any = {};

    if (filters.userId) where.userId = filters.userId;
    if (filters.externalPersonId) where.externalPersonId = filters.externalPersonId;
    if (filters.certType) where.certType = filters.certType;

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { certType: { contains: filters.search, mode: "insensitive" } },
        {
          user: {
            OR: [
              {
                firstName: {
                  contains: filters.search,
                  mode: "insensitive",
                },
              },
              {
                lastName: {
                  contains: filters.search,
                  mode: "insensitive",
                },
              },
            ],
          },
        },
        {
          externalPerson: {
            OR: [
              {
                firstName: {
                  contains: filters.search,
                  mode: "insensitive",
                },
              },
              {
                lastName: {
                  contains: filters.search,
                  mode: "insensitive",
                },
              },
            ],
          },
        },
      ];
    }

    const now = new Date();
    if (filters.status === "valid") {
      where.OR = [...(where.OR || []), { expiresAt: null }, { expiresAt: { gte: now } }];
      // If we already had an OR from search, we need AND logic
      if (filters.search) {
        const searchOr = where.OR.slice(0, -2);
        const statusOr = where.OR.slice(-2);
        delete where.OR;
        where.AND = [{ OR: searchOr }, { OR: statusOr }];
      }
    } else if (filters.status === "expired") {
      where.expiresAt = { lt: now };
    }

    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);

    const [data, total] = await Promise.all([
      this.prisma.certificate.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          externalPerson: true,
          createdBy: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { obtainedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.certificate.count({ where }),
    ]);

    return {
      data: data.map((c) => this.addStatus(c)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getStats() {
    const now = new Date();
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);

    const [total, expired, expiringIn30Days, byTypeRaw] = await Promise.all([
      this.prisma.certificate.count(),
      this.prisma.certificate.count({
        where: { expiresAt: { lt: now } },
      }),
      this.prisma.certificate.count({
        where: { expiresAt: { gte: now, lte: in30Days } },
      }),
      this.prisma.certificate.groupBy({
        by: ["certType"],
        _count: { _all: true },
      }),
    ]);

    const valid = total - expired;
    const byType = byTypeRaw.map((g) => ({
      certType: g.certType,
      count: g._count._all,
    }));

    return { total, valid, expired, expiringIn30Days, byType };
  }

  async findExpiring() {
    const now = new Date();
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);

    const certs = await this.prisma.certificate.findMany({
      where: {
        expiresAt: { gte: now, lte: in30Days },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        externalPerson: true,
      },
      orderBy: { expiresAt: "asc" },
    });

    return certs.map((c) => this.addStatus(c));
  }

  async findOne(id: string) {
    const cert = await this.prisma.certificate.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        externalPerson: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    if (!cert) throw new NotFoundException("Certificate not found");
    return this.addStatus(cert);
  }

  async create(dto: CreateCertificateDto, createdById: string) {
    if (!dto.userId && !dto.externalPersonId) {
      throw new BadRequestException("userId or externalPersonId must be provided");
    }
    if (dto.userId && dto.externalPersonId) {
      throw new BadRequestException("Provide either userId or externalPersonId, not both");
    }

    const cert = await this.prisma.certificate.create({
      data: {
        name: dto.name,
        certType: dto.certType,
        obtainedAt: new Date(dto.obtainedAt),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        fileUrl: dto.fileUrl ?? null,
        fileName: dto.fileName ?? null,
        fileSizeBytes: dto.fileSizeBytes ?? null,
        notes: dto.notes ?? null,
        userId: dto.userId ?? null,
        externalPersonId: dto.externalPersonId ?? null,
        createdById,
      },
    });

    await this.audit.log({
      userId: createdById,
      action: "CERTIFICATE_CREATED",
      resourceType: "Certificate",
      resourceId: cert.id,
      metadata: { name: cert.name, certType: cert.certType },
    });

    return this.addStatus(cert);
  }

  async createMy(dto: CreateCertificateDto, user: RequestUser) {
    // Force ownership: user can only create certificates for themselves
    dto.userId = user.id;
    dto.externalPersonId = undefined;

    const pendingNote = "En attente de validation";
    const notes = dto.notes ? `[${pendingNote}] ${dto.notes}` : pendingNote;

    const cert = await this.prisma.certificate.create({
      data: {
        name: dto.name,
        certType: dto.certType,
        obtainedAt: new Date(dto.obtainedAt),
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        fileUrl: dto.fileUrl ?? null,
        fileName: dto.fileName ?? null,
        fileSizeBytes: dto.fileSizeBytes ?? null,
        notes,
        userId: user.id,
        externalPersonId: null,
        createdById: user.id,
      },
    });

    await this.audit.log({
      userId: user.id,
      action: "CERTIFICATE_CREATED",
      resourceType: "Certificate",
      resourceId: cert.id,
      metadata: { name: cert.name, certType: cert.certType, selfService: true },
    });

    // Notify all admins
    const [admins, adminUser] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, isActive: true },
        select: { id: true },
      }),
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: { firstName: true, lastName: true },
      }),
    ]);
    const fullName = adminUser ? `${adminUser.firstName} ${adminUser.lastName}`.trim() : user.email;
    if (admins.length > 0) {
      // createMany : pas de valeur de retour par ligne exploitée ci-dessus,
      // évite le N+1 en écriture (une requête au lieu d'une par admin).
      await this.prisma.notification.createMany({
        data: admins.map((admin) => ({
          userId: admin.id,
          type: "TICKET_CREATED" as NotificationType,
          title: "Nouveau certificat a valider",
          body: `${fullName} a ajoute le certificat "${cert.name}" (${cert.certType}). Validation requise.`,
          resourceType: "Certificate",
          resourceId: cert.id,
        })),
      });
    }

    return this.addStatus(cert);
  }

  async updateMy(id: string, dto: UpdateCertificateDto, user: RequestUser) {
    const cert = await this.prisma.certificate.findUnique({ where: { id } });
    if (!cert) throw new NotFoundException("Certificate not found");
    if (cert.userId !== user.id) {
      throw new ForbiddenException("You can only edit your own certificates");
    }

    // Prevent changing ownership
    dto.userId = undefined;
    dto.externalPersonId = undefined;

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.certType !== undefined) data.certType = dto.certType;
    if (dto.obtainedAt !== undefined) data.obtainedAt = new Date(dto.obtainedAt);
    if (dto.expiresAt !== undefined)
      data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.fileUrl !== undefined) data.fileUrl = dto.fileUrl;
    if (dto.fileName !== undefined) data.fileName = dto.fileName;
    if (dto.fileSizeBytes !== undefined) data.fileSizeBytes = dto.fileSizeBytes;
    if (dto.notes !== undefined) data.notes = dto.notes;

    const updated = await this.prisma.certificate.update({
      where: { id },
      data,
    });

    await this.audit.log({
      userId: user.id,
      action: "CERTIFICATE_UPDATED",
      resourceType: "Certificate",
      resourceId: updated.id,
      metadata: { updatedFields: Object.keys(data), selfService: true },
    });

    return this.addStatus(updated);
  }

  async update(id: string, dto: UpdateCertificateDto, updatedById: string) {
    await this.findOne(id);

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.certType !== undefined) data.certType = dto.certType;
    if (dto.obtainedAt !== undefined) data.obtainedAt = new Date(dto.obtainedAt);
    if (dto.expiresAt !== undefined)
      data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.fileUrl !== undefined) data.fileUrl = dto.fileUrl;
    if (dto.fileName !== undefined) data.fileName = dto.fileName;
    if (dto.fileSizeBytes !== undefined) data.fileSizeBytes = dto.fileSizeBytes;
    if (dto.notes !== undefined) data.notes = dto.notes;

    const cert = await this.prisma.certificate.update({
      where: { id },
      data,
    });

    await this.audit.log({
      userId: updatedById,
      action: "CERTIFICATE_UPDATED",
      resourceType: "Certificate",
      resourceId: cert.id,
      metadata: { updatedFields: Object.keys(data) },
    });

    return this.addStatus(cert);
  }

  async remove(id: string, deletedById: string) {
    const cert = await this.findOne(id);

    await this.prisma.certificate.delete({ where: { id } });

    await this.audit.log({
      userId: deletedById,
      action: "CERTIFICATE_DELETED",
      resourceType: "Certificate",
      resourceId: id,
      metadata: { name: cert.name, certType: cert.certType },
    });

    return { deleted: true };
  }

  async updateFile(
    id: string,
    fileUrl: string,
    fileName: string,
    fileSizeBytes: number,
    updatedById: string,
  ) {
    await this.findOne(id);

    const cert = await this.prisma.certificate.update({
      where: { id },
      data: { fileUrl, fileName, fileSizeBytes },
    });

    await this.audit.log({
      userId: updatedById,
      action: "CERTIFICATE_UPDATED",
      resourceType: "Certificate",
      resourceId: cert.id,
      metadata: { updatedFields: ["fileUrl", "fileName", "fileSizeBytes"] },
    });

    return this.addStatus(cert);
  }
}
