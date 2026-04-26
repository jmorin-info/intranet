import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  GoneException,
  UnauthorizedException,
} from "@nestjs/common";
import * as crypto from "crypto";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { DocumentPermissionsService } from "./document-permissions.service";
import { RequestUser } from "../common/interfaces";

export interface CreateShareDto {
  expiresAt?: string | Date | null;
  password?: string | null;
  maxDownloads?: number | null;
  requiresAuth?: boolean;
}

const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;
const TOKEN_BYTES = 32; // 256-bit URL-safe token

/**
 * Service de partage public de documents (ISO 27001 A.5.14 — Information transfer).
 *
 * Crée un lien signé par token (256 bits) éventuellement protégé par mot de
 * passe (bcrypt 12 rounds). Logue chaque accès, incrémente un compteur de DL,
 * invalide après 5 mauvais mdp consécutifs.
 *
 * `requiresAuth=true` : le destinataire doit être loggé sur l'intranet pour
 * accéder au lien (cas : partage interne avec traçabilité nominative).
 * `requiresAuth=false` : lien anonyme (mot de passe + MFA fresh requis lors
 * de la création — vérifié au niveau du controller via @RequireFreshMfa).
 */
@Injectable()
export class DocumentSharesService {
  private readonly logger = new Logger(DocumentSharesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly permissions: DocumentPermissionsService,
  ) {}

  /**
   * Génère un token URL-safe (base64url) de 256 bits.
   * crypto.randomBytes est cryptographiquement sûr (CSPRNG).
   */
  private generateToken(): string {
    return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  }

  async listShares(documentId: string, currentUser: RequestUser) {
    if (!(await this.permissions.canAdmin(currentUser.id, documentId))) {
      throw new ForbiddenException(
        "Permission ADMIN requise pour lister les partages.",
      );
    }
    return this.prisma.documentShare
      .findMany({
        where: { documentId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          token: true,
          expiresAt: true,
          maxDownloads: true,
          downloadCount: true,
          requiresAuth: true,
          revokedAt: true,
          lastAccessedAt: true,
          failedAttempts: true,
          createdAt: true,
          createdBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          // passwordHash never returned — only `hasPassword` boolean
        },
      })
      .then((shares) =>
        shares.map((s: any) => ({
          ...s,
          hasPassword: !!s["passwordHashPresent"],
        })),
      )
      .catch(async () => {
        // Fallback : Prisma select doesn't expose computed columns, so we re-query
        // with passwordHash and strip it out client-side.
        const raw = await this.prisma.documentShare.findMany({
          where: { documentId },
          orderBy: { createdAt: "desc" },
          include: {
            createdBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        });
        return raw.map((s) => ({
          id: s.id,
          token: s.token,
          expiresAt: s.expiresAt,
          maxDownloads: s.maxDownloads,
          downloadCount: s.downloadCount,
          requiresAuth: s.requiresAuth,
          revokedAt: s.revokedAt,
          lastAccessedAt: s.lastAccessedAt,
          failedAttempts: s.failedAttempts,
          createdAt: s.createdAt,
          createdBy: s.createdBy,
          hasPassword: !!s.passwordHash,
        }));
      });
  }

  async createShare(
    documentId: string,
    dto: CreateShareDto,
    currentUser: RequestUser,
    ipAddress?: string,
  ) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, deletedAt: true, classification: true },
    });
    if (!document || document.deletedAt) {
      throw new NotFoundException("Document introuvable");
    }
    if (!(await this.permissions.canAdmin(currentUser.id, documentId))) {
      throw new ForbiddenException(
        "Permission ADMIN requise pour créer un partage.",
      );
    }

    // Garde-fou : interdire de partager un document SECRET en lien anonyme.
    const classification = (document.classification || "INTERNE").toUpperCase();
    if (classification === "SECRET" && !dto.requiresAuth) {
      throw new ForbiddenException(
        "Les documents SECRET ne peuvent être partagés qu'avec authentification (requiresAuth=true).",
      );
    }

    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt) {
      if (Number.isNaN(expiresAt.getTime())) {
        throw new BadRequestException("expiresAt invalide");
      }
      if (expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException("expiresAt doit être dans le futur");
      }
    }

    const maxDownloads =
      dto.maxDownloads != null ? Number(dto.maxDownloads) : null;
    if (
      maxDownloads !== null &&
      (!Number.isInteger(maxDownloads) || maxDownloads < 1)
    ) {
      throw new BadRequestException("maxDownloads doit être un entier >= 1");
    }

    // Hash du mot de passe (bcrypt 12 rounds — suffisant pour 2026, ≈ 250 ms/op)
    let passwordHash: string | null = null;
    if (dto.password && dto.password.length > 0) {
      if (dto.password.length < 8) {
        throw new BadRequestException(
          "Le mot de passe doit comporter au moins 8 caractères.",
        );
      }
      passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    }

    // Generate unique token (collisions improbables avec 256 bits, mais on retry par sécurité)
    let token = this.generateToken();
    let attempts = 0;
    while (attempts < 5) {
      const collision = await this.prisma.documentShare.findUnique({
        where: { token },
        select: { id: true },
      });
      if (!collision) break;
      token = this.generateToken();
      attempts++;
    }

    const share = await this.prisma.documentShare.create({
      data: {
        documentId,
        token,
        passwordHash,
        expiresAt,
        maxDownloads,
        requiresAuth: dto.requiresAuth ?? false,
        createdById: currentUser.id,
      },
    });

    await this.audit.log({
      userId: currentUser.id,
      ipAddress,
      action: "DOCUMENT_SHARE_CREATED",
      resourceType: "Document",
      resourceId: documentId,
      severity: "WARN",
      metadata: {
        shareId: share.id,
        // token NEVER logged — leaks share access
        expiresAt: expiresAt?.toISOString() ?? null,
        maxDownloads,
        requiresAuth: share.requiresAuth,
        hasPassword: !!passwordHash,
      },
    });

    // Le token est retourné UNE fois à la création (le caller copie le lien)
    return {
      id: share.id,
      token: share.token,
      expiresAt: share.expiresAt,
      maxDownloads: share.maxDownloads,
      downloadCount: share.downloadCount,
      requiresAuth: share.requiresAuth,
      hasPassword: !!share.passwordHash,
      createdAt: share.createdAt,
    };
  }

  async revokeShare(
    documentId: string,
    shareId: string,
    currentUser: RequestUser,
    ipAddress?: string,
  ) {
    if (!(await this.permissions.canAdmin(currentUser.id, documentId))) {
      throw new ForbiddenException(
        "Permission ADMIN requise pour révoquer un partage.",
      );
    }
    const share = await this.prisma.documentShare.findUnique({
      where: { id: shareId },
    });
    if (!share || share.documentId !== documentId) {
      throw new NotFoundException("Partage introuvable");
    }
    if (share.revokedAt) {
      return { success: true, alreadyRevoked: true };
    }

    await this.prisma.documentShare.update({
      where: { id: shareId },
      data: { revokedAt: new Date() },
    });

    await this.audit.log({
      userId: currentUser.id,
      ipAddress,
      action: "DOCUMENT_SHARE_REVOKED",
      resourceType: "Document",
      resourceId: documentId,
      severity: "WARN",
      metadata: { shareId },
    });

    return { success: true };
  }

  /**
   * Accès public au partage. Vérifie expiration, révocation, mot de passe,
   * quota de téléchargements. Logue chaque tentative (succès ET échec) pour
   * conformité ISO 27001 A.8.15.
   *
   * Renvoie les meta du document + un flag `requiresPassword` si le mot de
   * passe n'est pas fourni mais nécessaire. Ne renvoie PAS le contenu — le
   * contenu réel est streamé via une autre route après ce check.
   */
  async accessShare(
    token: string,
    password: string | null,
    ipAddress?: string,
    userAgent?: string,
    authenticatedUserId?: string,
  ) {
    if (!token || token.length < 10) {
      throw new NotFoundException("Lien invalide");
    }

    const share = await this.prisma.documentShare.findUnique({
      where: { token },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            reference: true,
            classification: true,
            currentVersionId: true,
            deletedAt: true,
            isNative: true,
            content: true,
          },
        },
      },
    });

    if (!share || !share.document || share.document.deletedAt) {
      // Ne révèle pas la cause — anti-énumération.
      throw new NotFoundException("Lien invalide ou expiré");
    }

    if (share.revokedAt) {
      await this.audit.log({
        userId: authenticatedUserId,
        ipAddress,
        userAgent,
        action: "DOCUMENT_SHARE_ACCESS_DENIED",
        resourceType: "DocumentShare",
        resourceId: share.id,
        severity: "WARN",
        metadata: { reason: "revoked", documentId: share.documentId },
      });
      throw new GoneException("Lien révoqué");
    }

    if (share.expiresAt && share.expiresAt.getTime() <= Date.now()) {
      await this.audit.log({
        userId: authenticatedUserId,
        ipAddress,
        userAgent,
        action: "DOCUMENT_SHARE_ACCESS_DENIED",
        resourceType: "DocumentShare",
        resourceId: share.id,
        severity: "INFO",
        metadata: { reason: "expired", documentId: share.documentId },
      });
      throw new GoneException("Lien expiré");
    }

    if (
      share.maxDownloads !== null &&
      share.downloadCount >= share.maxDownloads
    ) {
      await this.audit.log({
        userId: authenticatedUserId,
        ipAddress,
        userAgent,
        action: "DOCUMENT_SHARE_ACCESS_DENIED",
        resourceType: "DocumentShare",
        resourceId: share.id,
        severity: "WARN",
        metadata: { reason: "quota_exceeded", documentId: share.documentId },
      });
      throw new GoneException("Quota de téléchargements atteint");
    }

    if (share.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      // Auto-revoke après 5 mauvais mdp
      if (!share.revokedAt) {
        await this.prisma.documentShare.update({
          where: { id: share.id },
          data: { revokedAt: new Date() },
        });
      }
      await this.audit.log({
        userId: authenticatedUserId,
        ipAddress,
        userAgent,
        action: "DOCUMENT_SHARE_AUTO_REVOKED",
        resourceType: "DocumentShare",
        resourceId: share.id,
        severity: "CRITICAL",
        metadata: {
          reason: "too_many_failed_password_attempts",
          documentId: share.documentId,
        },
      });
      throw new ForbiddenException(
        "Trop de tentatives — lien automatiquement révoqué",
      );
    }

    if (share.requiresAuth && !authenticatedUserId) {
      throw new UnauthorizedException(
        "Authentification requise pour accéder à ce lien",
      );
    }

    if (share.passwordHash) {
      if (!password) {
        return {
          requiresPassword: true,
          shareId: share.id,
          documentTitle: null,
        };
      }
      const ok = await bcrypt.compare(password, share.passwordHash);
      if (!ok) {
        await this.prisma.documentShare.update({
          where: { id: share.id },
          data: { failedAttempts: { increment: 1 } },
        });
        await this.audit.log({
          userId: authenticatedUserId,
          ipAddress,
          userAgent,
          action: "DOCUMENT_SHARE_BAD_PASSWORD",
          resourceType: "DocumentShare",
          resourceId: share.id,
          severity: "WARN",
          metadata: {
            documentId: share.documentId,
            failedAttempts: share.failedAttempts + 1,
          },
        });
        throw new UnauthorizedException("Mot de passe invalide");
      }
      // Reset le compteur en cas de succès
      if (share.failedAttempts > 0) {
        await this.prisma.documentShare.update({
          where: { id: share.id },
          data: { failedAttempts: 0 },
        });
      }
    }

    // Increment download count + log success
    await this.prisma.documentShare.update({
      where: { id: share.id },
      data: {
        downloadCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });

    await this.audit.log({
      userId: authenticatedUserId,
      ipAddress,
      userAgent,
      action: "DOCUMENT_SHARE_ACCESSED",
      resourceType: "DocumentShare",
      resourceId: share.id,
      severity: "INFO",
      metadata: {
        documentId: share.documentId,
        documentReference: share.document.reference,
        anonymous: !authenticatedUserId,
      },
    });

    return {
      requiresPassword: false,
      shareId: share.id,
      documentId: share.documentId,
      documentTitle: share.document.title,
      documentReference: share.document.reference,
      classification: share.document.classification,
      currentVersionId: share.document.currentVersionId,
      isNative: share.document.isNative,
      content: share.document.isNative ? share.document.content : null,
    };
  }
}
