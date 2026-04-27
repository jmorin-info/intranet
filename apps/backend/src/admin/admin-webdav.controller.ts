import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Query,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../common/enums";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

/**
 * Endpoints admin pour piloter la fonctionnalité WebDAV / Obsidian sync
 * (item 16). Permet à un SUPER_ADMIN d'activer/désactiver la feature
 * globalement et à un ADMIN+ d'activer/désactiver par utilisateur.
 *
 * - Feature globale (kill switch cluster-wide) : AppConfig "webdav.enabled"
 * - Permission per-user                          : User.webdavEnabled
 *
 * Le service WebDAV (apps/backend/src/webdav/webdav.service.ts) checke
 * les deux flags dans `ensureUserAllowed` ET `authenticate`.
 */
@Controller("admin/webdav")
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminWebdavController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Stats globales pour la page d'admin :
   *   - feature globale ON/OFF
   *   - nombre d'users avec webdavEnabled = true
   *   - nombre de tokens WebDAV actifs (non expirés)
   *   - dernière activité (lastUsedAt max)
   */
  @Get("stats")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getStats() {
    const [globalCfg, eligibleUsers, totalTokens, recentTokens] =
      await Promise.all([
        this.prisma.appConfig.findUnique({ where: { key: "webdav.enabled" } }),
        this.prisma.user.count({
          where: { webdavEnabled: true, deletedAt: null, isActive: true },
        }),
        (this.prisma as any).webDAVToken.count({
          where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        }),
        (this.prisma as any).webDAVToken.findFirst({
          orderBy: { lastUsedAt: "desc" },
          select: { lastUsedAt: true },
        }),
      ]);

    return {
      featureEnabled: parseEnabled(globalCfg?.value),
      eligibleUsers,
      activeTokens: totalTokens,
      lastActivityAt: recentTokens?.lastUsedAt ?? null,
    };
  }

  /**
   * Liste paginée des users avec leur statut webdavEnabled + nombre de tokens.
   * Utilisée par la page admin pour activer/désactiver.
   */
  @Get("users")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async listUsers(
    @Query("search") search?: string,
    @Query("only") only?: "enabled" | "disabled" | "all",
    @Query("page") page = "1",
    @Query("limit") limit = "50",
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

    const where: Record<string, unknown> = { deletedAt: null };
    if (only === "enabled") where.webdavEnabled = true;
    if (only === "disabled") where.webdavEnabled = false;
    if (search) {
      const s = search.trim();
      where.OR = [
        { email: { contains: s, mode: "insensitive" } },
        { firstName: { contains: s, mode: "insensitive" } },
        { lastName: { contains: s, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          webdavEnabled: true,
          isActive: true,
          _count: { select: { webdavTokens: true } as any },
        },
        orderBy: [{ webdavEnabled: "desc" }, { email: "asc" }],
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items,
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  /**
   * Toggle global de la feature WebDAV. Réservé SUPER_ADMIN.
   *
   * Body : { enabled: boolean }
   * → écrit dans AppConfig "webdav.enabled" (text JSON)
   */
  @Patch("global")
  @Roles(UserRole.SUPER_ADMIN)
  async toggleGlobal(@Body() body: { enabled: boolean }) {
    const enabled = Boolean(body?.enabled);
    const value = enabled ? "true" : "false";
    await this.prisma.appConfig.upsert({
      where: { key: "webdav.enabled" },
      create: { key: "webdav.enabled", value, updatedAt: new Date() },
      update: { value, updatedAt: new Date() },
    });
    void this.audit.log({
      action: enabled ? "WEBDAV_FEATURE_ENABLED" : "WEBDAV_FEATURE_DISABLED",
      resourceType: "AppConfig",
      resourceId: "webdav.enabled",
      severity: enabled ? "INFO" : "WARN",
    });
    return { enabled };
  }

  /**
   * Toggle per-user. Réservé ADMIN+ (SUPER_ADMIN inclus).
   *
   * Body : { userId, enabled }
   */
  @Patch("user")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async toggleUser(@Body() body: { userId: string; enabled: boolean }) {
    const enabled = Boolean(body?.enabled);
    const updated = await this.prisma.user.update({
      where: { id: body.userId },
      data: { webdavEnabled: enabled },
      select: { id: true, email: true, webdavEnabled: true },
    });
    void this.audit.log({
      userId: body.userId,
      action: enabled ? "WEBDAV_USER_ENABLED" : "WEBDAV_USER_DISABLED",
      resourceType: "User",
      resourceId: body.userId,
      severity: "INFO",
      metadata: { email: updated.email },
    });
    return updated;
  }
}

function parseEnabled(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const s = raw.trim();
  if (s === "true" || s === "1") return true;
  if (s === "false" || s === "0") return false;
  try {
    const parsed = JSON.parse(s) as unknown;
    if (typeof parsed === "boolean") return parsed;
    if (parsed && typeof parsed === "object" && "enabled" in parsed) {
      return Boolean((parsed as { enabled?: unknown }).enabled);
    }
  } catch {
    // ignore
  }
  return false;
}
