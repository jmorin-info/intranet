import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Prisma, BehaviorAlertSeverity, BehaviorAlertStatus } from "@prisma/client";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequestUser } from "../common/interfaces";
import { UserRole } from "../common/enums";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { BehaviorDetectionService } from "./behavior-detection.service";
import {
  ListAlertsDto,
  TransitionAlertDto,
  UpdateRuleDto,
} from "./dto/list-alerts.dto";

/**
 * Wave D — Item 28 — Endpoints alertes UEBA + admin règles.
 *
 * Tous les endpoints sont ADMIN+ (ou SUPER_ADMIN pour la maintenance des
 * règles). Le rôle "RSSI" n'existe pas dans l'enum UserRole — le filtrage
 * applicatif RSSI passe par les SUPER_ADMIN + heuristique email "rssi".
 */
@Controller("admin/behavior-alerts")
@UseGuards(JwtAuthGuard, RolesGuard)
export class BehaviorAlertController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly detection: BehaviorDetectionService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async list(@Query() query: ListAlertsDto) {
    const where: Prisma.BehaviorAlertWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.ruleCode) where.ruleCode = query.ruleCode;
    if (query.userId) where.userId = query.userId;
    if (query.severity) {
      const sevs = query.severity
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s): s is BehaviorAlertSeverity =>
          ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(s),
        );
      if (sevs.length > 0) where.severity = { in: sevs };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total, counts] = await Promise.all([
      this.prisma.behaviorAlert.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          acknowledgedBy: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          resolvedBy: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.behaviorAlert.count({ where }),
      this.computeCounts(),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      counts,
    };
  }

  /**
   * Compteurs en haut de la page (NEW HIGH+CRITICAL en rouge, etc).
   */
  private async computeCounts() {
    const [
      newCritical,
      newHigh,
      newMedium,
      newLow,
      acknowledged,
      resolved24h,
    ] = await Promise.all([
      this.prisma.behaviorAlert.count({
        where: { status: "NEW", severity: "CRITICAL" },
      }),
      this.prisma.behaviorAlert.count({
        where: { status: "NEW", severity: "HIGH" },
      }),
      this.prisma.behaviorAlert.count({
        where: { status: "NEW", severity: "MEDIUM" },
      }),
      this.prisma.behaviorAlert.count({
        where: { status: "NEW", severity: "LOW" },
      }),
      this.prisma.behaviorAlert.count({ where: { status: "ACKNOWLEDGED" } }),
      this.prisma.behaviorAlert.count({
        where: {
          status: { in: ["RESOLVED", "FALSE_POSITIVE"] },
          resolvedAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
        },
      }),
    ]);
    return { newCritical, newHigh, newMedium, newLow, acknowledged, resolved24h };
  }

  @Get(":id")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async get(@Param("id", ParseUUIDPipe) id: string) {
    return this.prisma.behaviorAlert.findUniqueOrThrow({
      where: { id },
      include: {
        user: true,
        acknowledgedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        resolvedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  @Patch(":id/acknowledge")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async acknowledge(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: TransitionAlertDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.transition(id, "ACKNOWLEDGED", user.id, body.comment);
  }

  @Patch(":id/resolve")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async resolve(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: TransitionAlertDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.transition(id, "RESOLVED", user.id, body.comment);
  }

  @Patch(":id/false-positive")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async falsePositive(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: TransitionAlertDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.transition(id, "FALSE_POSITIVE", user.id, body.comment);
  }

  private async transition(
    id: string,
    next: BehaviorAlertStatus,
    actorId: string,
    comment?: string,
  ) {
    const alert = await this.prisma.behaviorAlert.findUniqueOrThrow({
      where: { id },
    });
    const now = new Date();
    const update: Prisma.BehaviorAlertUpdateInput = {
      status: next,
      resolutionNote: comment ?? alert.resolutionNote,
    };
    if (next === "ACKNOWLEDGED" && !alert.acknowledgedAt) {
      update.acknowledgedAt = now;
      update.acknowledgedBy = { connect: { id: actorId } };
    }
    if (next === "RESOLVED" || next === "FALSE_POSITIVE") {
      update.resolvedAt = now;
      update.resolvedBy = { connect: { id: actorId } };
      if (!alert.acknowledgedAt) {
        // Auto-acknowledge si on saute l'étape ACK (RSSI peut résoudre direct)
        update.acknowledgedAt = now;
        update.acknowledgedBy = { connect: { id: actorId } };
      }
    }
    const updated = await this.prisma.behaviorAlert.update({
      where: { id },
      data: update,
    });
    await this.audit.log({
      userId: actorId,
      action: `BEHAVIOR_ALERT_${next}`,
      resourceType: "BehaviorAlert",
      resourceId: id,
      metadata: {
        ruleCode: alert.ruleCode,
        severity: alert.severity,
        comment: comment ?? null,
      },
      severity: alert.severity === "CRITICAL" ? "CRITICAL" : "WARN",
    });
    return updated;
  }

  /**
   * Trigger manuel d'un cycle de détection (utile pour debug RSSI ou tests).
   * SUPER_ADMIN seulement pour éviter d'amplifier le coût Postgres.
   */
  @Post("run-now")
  @Roles(UserRole.SUPER_ADMIN)
  async runNow(@CurrentUser() user: RequestUser) {
    const result = await this.detection.runDetection();
    await this.audit.log({
      userId: user.id,
      action: "BEHAVIOR_DETECTION_MANUAL_RUN",
      resourceType: "BehaviorAlert",
      metadata: {
        rulesEvaluated: result.rulesEvaluated,
        alertsCreated: result.alertsCreated,
      },
      severity: "INFO",
    });
    return result;
  }
}

/**
 * Endpoints de gestion des règles UEBA (toggle enabled, ajustement threshold).
 * SUPER_ADMIN exclusivement : toucher aux règles a un impact sur la sensibilité
 * du système entier.
 */
@Controller("admin/behavior-rules")
@UseGuards(JwtAuthGuard, RolesGuard)
export class BehaviorRuleController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async list() {
    return this.prisma.behaviorRule.findMany({ orderBy: { code: "asc" } });
  }

  @Get(":code")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async get(@Param("code") code: string) {
    return this.prisma.behaviorRule.findUniqueOrThrow({ where: { code } });
  }

  @Patch(":code")
  @Roles(UserRole.SUPER_ADMIN)
  async update(
    @Param("code") code: string,
    @Body() body: UpdateRuleDto,
    @CurrentUser() user: RequestUser,
  ) {
    const previous = await this.prisma.behaviorRule.findUniqueOrThrow({
      where: { code },
    });
    const data: Prisma.BehaviorRuleUpdateInput = {};
    if (typeof body.enabled === "boolean") data.enabled = body.enabled;
    if (body.threshold) data.threshold = body.threshold as Prisma.InputJsonValue;
    if (body.severity) data.severity = body.severity;
    const updated = await this.prisma.behaviorRule.update({
      where: { code },
      data,
    });
    await this.audit.log({
      userId: user.id,
      action: "BEHAVIOR_RULE_UPDATED",
      resourceType: "BehaviorRule",
      resourceId: previous.id,
      metadata: {
        code,
        before: {
          enabled: previous.enabled,
          severity: previous.severity,
          threshold: previous.threshold,
        },
        after: {
          enabled: updated.enabled,
          severity: updated.severity,
          threshold: updated.threshold,
        },
      },
      severity: "WARN",
    });
    return updated;
  }
}
