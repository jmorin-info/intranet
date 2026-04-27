import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { ApprovalDelegationScope, DocumentCategory } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * DelegationService — Délégation des approbations (item #27).
 *
 * Trois flux d'usage :
 *  1. Manuel : un utilisateur configure une période (vacances, mission…) et
 *     désigne un délégataire.
 *  2. Automatique : un cron quotidien re-route les approbations PENDING
 *     dépassant un seuil (default 48h) vers le manager du délégant. Si le
 *     manager est absent, escalade vers RSSI / SUPER_ADMIN.
 *  3. Résolution runtime : `resolveDelegate(userId)` retourne le délégataire
 *     actif à l'instant T pour un utilisateur donné — utilisé par le moteur
 *     d'approbation pour réassigner les step-instances avant notification.
 *
 * Toutes les actions (création / révocation / auto / escalade) sont tracées
 * dans `ApprovalAuditLog` afin de pouvoir reconstituer la chaîne en cas de
 * contestation (audit ISO 27001).
 */
@Injectable()
export class DelegationService {
  private readonly logger = new Logger(DelegationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Création / Listing / Révocation manuelles
  // ---------------------------------------------------------------------------

  /**
   * Crée une délégation manuelle. Refuse :
   *  - une auto-délégation (fromUserId === toUserId)
   *  - un endDate <= startDate
   *  - un délégataire désactivé / soft-deleted
   *  - un chevauchement strict avec une délégation active (SCOPE GLOBAL ↔
   *    GLOBAL ; on autorise GLOBAL + SCOPED côte à côte)
   */
  async create(
    fromUserId: string,
    data: {
      toUserId: string;
      startDate: string | Date;
      endDate: string | Date;
      reason?: string;
      scope?: ApprovalDelegationScope;
      categories?: DocumentCategory[];
    },
  ) {
    if (fromUserId === data.toUserId) {
      throw new BadRequestException(
        "Impossible de se déléguer à soi-même.",
      );
    }

    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException("Dates invalides.");
    }
    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException(
        "La date de fin doit être strictement postérieure à la date de début.",
      );
    }

    const target = await this.prisma.user.findUnique({
      where: { id: data.toUserId },
      select: { id: true, isActive: true, deletedAt: true },
    });
    if (!target || !target.isActive || target.deletedAt) {
      throw new BadRequestException(
        "L'utilisateur destinataire est introuvable ou inactif.",
      );
    }

    const scope = data.scope ?? "GLOBAL";

    // Refuse les chevauchements GLOBAL stricts pour éviter une cascade ambiguë.
    if (scope === "GLOBAL") {
      const overlap = await this.prisma.approvalDelegation.findFirst({
        where: {
          fromUserId,
          isActive: true,
          scope: "GLOBAL",
          // overlap si: existing.startDate < new.endDate ET existing.endDate > new.startDate
          startDate: { lt: end },
          endDate: { gt: start },
          revokedAt: null,
        },
      });
      if (overlap) {
        throw new BadRequestException(
          `Une délégation GLOBAL active existe déjà sur cette période (${overlap.startDate.toISOString()} → ${overlap.endDate.toISOString()}). Révoquez-la d'abord.`,
        );
      }
    }

    const delegation = await this.prisma.approvalDelegation.create({
      data: {
        fromUserId,
        toUserId: data.toUserId,
        startDate: start,
        endDate: end,
        reason: data.reason ?? null,
        scope,
        categories: data.categories ?? [],
        auto: false,
      },
    });

    await this.audit({
      actorId: fromUserId,
      action: "DELEGATION_CREATED",
      delegationId: delegation.id,
      metadata: {
        toUserId: data.toUserId,
        scope,
        categories: data.categories ?? [],
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
    });

    this.logger.log(
      `Delegation créée ${delegation.id} : ${fromUserId} → ${data.toUserId} ` +
        `[${start.toISOString()} → ${end.toISOString()}]`,
    );

    return delegation;
  }

  /** Liste les délégations émises par `userId` (actives et historiques). */
  async listGiven(userId: string) {
    return this.prisma.approvalDelegation.findMany({
      where: { fromUserId: userId },
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
      include: {
        toUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
          },
        },
      },
    });
  }

  /** Liste les délégations REÇUES par `userId` (actives uniquement par défaut). */
  async listReceived(userId: string, includeInactive = false) {
    return this.prisma.approvalDelegation.findMany({
      where: {
        toUserId: userId,
        ...(includeInactive ? {} : { isActive: true, revokedAt: null }),
      },
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
      include: {
        fromUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            jobTitle: true,
          },
        },
      },
    });
  }

  /**
   * Révoque une délégation. L'utilisateur appelant doit être :
   *  - le délégant (fromUserId), OU
   *  - un ADMIN / SUPER_ADMIN (vérification déléguée au controller via @Roles).
   */
  async revoke(delegationId: string, requesterId: string, isPrivileged: boolean) {
    const d = await this.prisma.approvalDelegation.findUnique({
      where: { id: delegationId },
    });
    if (!d) throw new NotFoundException(`Délégation ${delegationId} introuvable`);

    if (d.fromUserId !== requesterId && !isPrivileged) {
      throw new ForbiddenException(
        "Seul le délégant ou un administrateur peut révoquer cette délégation.",
      );
    }

    if (!d.isActive || d.revokedAt) {
      // Idempotent : on retourne la ligne telle quelle.
      return d;
    }

    const updated = await this.prisma.approvalDelegation.update({
      where: { id: delegationId },
      data: { isActive: false, revokedAt: new Date() },
    });

    await this.audit({
      actorId: requesterId,
      action: "DELEGATION_REVOKED",
      delegationId: delegationId,
      metadata: { byPrivileged: isPrivileged && requesterId !== d.fromUserId },
    });

    this.logger.log(
      `Delegation ${delegationId} révoquée par ${requesterId} (privilégié=${isPrivileged})`,
    );

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Résolution runtime
  // ---------------------------------------------------------------------------

  /**
   * Retourne l'userId du délégataire actif pour `fromUserId` à l'instant `at`,
   * ou `null` si aucune délégation n'est en cours.
   *
   * - Filtre par scope : si `category` est fourni et qu'une délégation SCOPED
   *   correspondante existe, elle est prioritaire sur GLOBAL.
   * - Si plusieurs délégations sont actives (ne devrait pas arriver en GLOBAL
   *   grâce à la garde anti-overlap, mais possible en SCOPED), on retient la
   *   plus récente (`createdAt desc`).
   *
   * Note : ne suit PAS la chaîne (A→B→C) : si B délègue à son tour, on
   * laisse l'engine d'approbation rappeler `resolveDelegate(B)` au prochain
   * tour. Cela évite les cycles infinis (et un cycle A→B→A ne fait pas
   * boucler : on s'arrête après UNE redirection).
   */
  async resolveDelegate(
    fromUserId: string,
    options: { category?: DocumentCategory | null; at?: Date } = {},
  ): Promise<string | null> {
    const at = options.at ?? new Date();
    const category = options.category ?? null;

    const active = await this.prisma.approvalDelegation.findMany({
      where: {
        fromUserId,
        isActive: true,
        revokedAt: null,
        startDate: { lte: at },
        endDate: { gte: at },
      },
      orderBy: { createdAt: "desc" },
    });

    if (active.length === 0) return null;

    // Priorité : SCOPED matchant la catégorie > GLOBAL
    if (category) {
      const scoped = active.find(
        (d) => d.scope === "SCOPED" && d.categories.includes(category),
      );
      if (scoped) return scoped.toUserId;
    }

    const global = active.find((d) => d.scope === "GLOBAL");
    return global ? global.toUserId : null;
  }

  // ---------------------------------------------------------------------------
  // Auto-délégation (cron)
  // ---------------------------------------------------------------------------

  /**
   * Pour chaque step-instance `PENDING` dont la `dueAt` ou la `createdAt + N heures`
   * est dépassée, crée une délégation automatique vers :
   *  1. Le manager (User.managerId) de l'assignee si présent et actif.
   *  2. Sinon, escalade vers le 1er user avec rôle SUPER_ADMIN actif.
   *
   * Renvoie le résumé `{ delegated, escalated, skipped }` pour visibilité côté
   * dashboard / log d'audit. La méthode est idempotente (on ne crée pas une
   * 2e délégation si elle existe déjà active sur la même période).
   *
   * @param thresholdHours Seuil au-delà duquel une step est éligible — peut
   *   provenir de `AppConfig.delegation.autoThresholdHours` (default 48h).
   */
  async runAutoDelegation(thresholdHours = 48): Promise<{
    delegated: number;
    escalated: number;
    skipped: number;
  }> {
    const cutoff = new Date(Date.now() - thresholdHours * 3600_000);
    let delegated = 0;
    let escalated = 0;
    let skipped = 0;

    // step-instances PENDING avec assignedTo et "vieilles" — on s'appuie sur
    // `dueAt` (si présent) sinon sur la date de démarrage de l'instance, car
    // ApprovalStepInstance n'a pas de champ `createdAt` propre.
    const stale = await this.prisma.approvalStepInstance.findMany({
      where: {
        decision: "PENDING",
        assignedToId: { not: null },
        instance: { status: "PENDING", startedAt: { lt: cutoff } },
        OR: [
          { dueAt: null },
          { dueAt: { lt: new Date() } },
        ],
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            isActive: true,
            deletedAt: true,
            managerId: true,
          },
        },
        step: { select: { id: true, name: true, slaHours: true } },
        instance: { select: { id: true, documentId: true } },
      },
      take: 200, // batch pour ne pas saturer
    });

    for (const si of stale) {
      const fromUser = si.assignedTo;
      if (!fromUser || !fromUser.isActive || fromUser.deletedAt) {
        skipped++;
        continue;
      }

      // 1. Tentative manager
      let targetUserId: string | null = null;
      let isEscalation = false;
      if (fromUser.managerId) {
        const mgr = await this.prisma.user.findUnique({
          where: { id: fromUser.managerId },
          select: { id: true, isActive: true, deletedAt: true },
        });
        if (mgr && mgr.isActive && !mgr.deletedAt) {
          targetUserId = mgr.id;
        }
      }

      // 2. Escalade SUPER_ADMIN
      if (!targetUserId) {
        const superAdmin = await this.prisma.user.findFirst({
          where: { role: "SUPER_ADMIN", isActive: true, deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });
        if (!superAdmin) {
          this.logger.warn(
            `Aucun SUPER_ADMIN disponible pour escalade — step-instance ${si.id} skip`,
          );
          skipped++;
          continue;
        }
        targetUserId = superAdmin.id;
        isEscalation = true;
      }

      // Anti-double : si une délégation active auto existe déjà
      const existing = await this.prisma.approvalDelegation.findFirst({
        where: {
          fromUserId: fromUser.id,
          toUserId: targetUserId,
          isActive: true,
          revokedAt: null,
          auto: true,
          endDate: { gt: new Date() },
        },
      });

      if (!existing) {
        // 7 jours de fenêtre auto-délégation par défaut.
        const start = new Date();
        const end = new Date(start.getTime() + 7 * 24 * 3600_000);
        const delegation = await this.prisma.approvalDelegation.create({
          data: {
            fromUserId: fromUser.id,
            toUserId: targetUserId,
            startDate: start,
            endDate: end,
            reason: isEscalation
              ? `Escalade automatique RSSI/SUPER_ADMIN (>${thresholdHours}h sans réponse)`
              : `Délégation automatique manager (>${thresholdHours}h sans réponse)`,
            scope: "GLOBAL",
            auto: true,
          },
        });

        await this.audit({
          actorId: null,
          action: isEscalation
            ? "DELEGATION_AUTO_ESCALATED"
            : "DELEGATION_AUTO_CREATED",
          delegationId: delegation.id,
          stepInstanceId: si.id,
          approvalInstanceId: si.instanceId,
          metadata: {
            thresholdHours,
            originalAssignee: fromUser.id,
            target: targetUserId,
          },
        });

        if (isEscalation) escalated++;
        else delegated++;
      }

      // Réassigne la step-instance au délégataire pour qu'il la voie.
      await this.prisma.approvalStepInstance.update({
        where: { id: si.id },
        data: { assignedToId: targetUserId },
      });
    }

    this.logger.log(
      `Auto-délégation : ${delegated} déléguées (manager), ${escalated} escaladées (SUPER_ADMIN), ${skipped} ignorées (sur ${stale.length} candidates)`,
    );

    return { delegated, escalated, skipped };
  }

  // ---------------------------------------------------------------------------
  // Audit log
  // ---------------------------------------------------------------------------

  /**
   * Insère une trace immuable dans `ApprovalAuditLog`. Toute action sur les
   * approbations & délégations passe par ici (création, révocation, auto…).
   *
   * Volontairement ne lance jamais : un échec d'audit ne doit pas bloquer
   * l'opération métier. On log l'erreur en CRITICAL pour alerting.
   */
  async audit(params: {
    actorId: string | null;
    action: string;
    delegationId?: string | null;
    approvalInstanceId?: string | null;
    stepInstanceId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.approvalAuditLog.create({
        data: {
          actorId: params.actorId,
          action: params.action,
          delegationId: params.delegationId ?? null,
          approvalInstanceId: params.approvalInstanceId ?? null,
          stepInstanceId: params.stepInstanceId ?? null,
          metadata: (params.metadata ?? null) as never,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write ApprovalAuditLog (action=${params.action}) : ${(err as Error).message}`,
      );
    }
  }
}
