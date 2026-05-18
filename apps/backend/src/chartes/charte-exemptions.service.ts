import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Gestion des exemptions de charte mandatory pour des utilisateurs nominatifs.
 *
 * Modèle :
 *  - Une charte mandatory est exigée pour TOUS les users actifs sauf ceux
 *    ayant une `CharteExemption` active (revokedAt = NULL et non expirée).
 *  - Une exemption est tracée (auteur, motif, date) — ISO 27001 A.5.34.
 *  - Lever une exemption ne supprime pas l'enregistrement (soft revoke) pour
 *    préserver la traçabilité historique.
 */
@Injectable()
export class CharteExemptionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liste les exemptions actives d'une charte avec les détails users.
   * Utilisé pour le panel d'administration côté frontend.
   */
  async listForCharte(charteId: string) {
    return this.prisma.charteExemption.findMany({
      where: { charteId, revokedAt: null },
      orderBy: { exemptedAt: "desc" },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
        exemptedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }

  /**
   * Liste les exemptions actives d'un user (toutes chartes confondues).
   * Utilisé pour vérifier rapidement si un user est exempté d'une charte X.
   */
  async listForUser(userId: string) {
    return this.prisma.charteExemption.findMany({
      where: { userId, revokedAt: null },
      include: {
        charte: { select: { id: true, title: true, slug: true } },
      },
    });
  }

  /**
   * Accorde une exemption nominative. Motif obligatoire (audit).
   * Si une exemption active existe déjà pour cette paire (charte, user),
   * BadRequest — l'admin doit d'abord la révoquer pour éviter les doublons.
   */
  async grant(params: {
    charteId: string;
    userId: string;
    reason: string;
    expiresAt?: Date | null;
    grantedById: string;
  }) {
    if (!params.reason?.trim()) {
      throw new BadRequestException("reason is required (audit ISO 27001)");
    }

    const charte = await this.prisma.charte.findUnique({
      where: { id: params.charteId },
    });
    if (!charte) throw new NotFoundException("Charte not found");

    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
    });
    if (!user) throw new NotFoundException("User not found");

    const existing = await this.prisma.charteExemption.findFirst({
      where: {
        charteId: params.charteId,
        userId: params.userId,
        revokedAt: null,
      },
    });
    if (existing) {
      throw new BadRequestException(
        "An active exemption already exists for this user on this charte. Revoke it first.",
      );
    }

    const exemption = await this.prisma.charteExemption.create({
      data: {
        charteId: params.charteId,
        userId: params.userId,
        reason: params.reason.trim(),
        exemptedById: params.grantedById,
        expiresAt: params.expiresAt ?? null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: params.grantedById,
        action: "CHARTE_EXEMPTION_GRANTED",
        resourceType: "CharteExemption",
        resourceId: exemption.id,
        severity: "WARN",
        metadata: {
          charteId: params.charteId,
          charteTitle: charte.title,
          targetUserId: params.userId,
          targetUserEmail: user.email,
          reason: params.reason,
          expiresAt: params.expiresAt?.toISOString() ?? null,
        },
      },
    });

    return exemption;
  }

  /**
   * Révoque (soft) une exemption — l'user redevient soumis à l'obligation.
   * On garde la ligne avec `revokedAt` + `revokeReason` pour audit.
   */
  async revoke(params: {
    exemptionId: string;
    revokedById: string;
    revokeReason?: string;
  }) {
    const exemption = await this.prisma.charteExemption.findUnique({
      where: { id: params.exemptionId },
      include: {
        charte: { select: { title: true } },
        user: { select: { email: true } },
      },
    });
    if (!exemption) throw new NotFoundException("Exemption not found");
    if (exemption.revokedAt) {
      throw new BadRequestException("Exemption already revoked");
    }

    const updated = await this.prisma.charteExemption.update({
      where: { id: params.exemptionId },
      data: {
        revokedAt: new Date(),
        revokedById: params.revokedById,
        revokeReason: params.revokeReason?.trim() ?? null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: params.revokedById,
        action: "CHARTE_EXEMPTION_REVOKED",
        resourceType: "CharteExemption",
        resourceId: exemption.id,
        severity: "INFO",
        metadata: {
          charteId: exemption.charteId,
          charteTitle: exemption.charte.title,
          targetUserId: exemption.userId,
          targetUserEmail: exemption.user.email,
          revokeReason: params.revokeReason ?? null,
        },
      },
    });

    return updated;
  }
}
