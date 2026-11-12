import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { ApprovalDelegationScope, DocumentCategory } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { workflowTransaction } from "./workflow-transaction";

/**
 * DelegationService — Délégation des approbations (item #27).
 *
 * Trois flux d'usage :
 *  1. Manuel : un utilisateur configure une période (vacances, mission…) et
 *     désigne un délégataire.
 *  2. Automatique : le cron réattribue uniquement la tâche active en retard,
 *     vers la cible configurée, le manager, puis un SUPER_ADMIN disponible.
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
      select: { id: true, isActive: true, deletedAt: true, role: true },
    });
    if (!target || !target.isActive || target.deletedAt || ['AUDITEUR', 'PRESTATAIRE'].includes(target.role)) {
      throw new BadRequestException(
        "L'utilisateur destinataire est introuvable ou inactif.",
      );
    }

    const scope = data.scope ?? "GLOBAL";
    if (scope === 'SCOPED' && !data.categories?.length) throw new BadRequestException('Choisissez au moins une catégorie pour une délégation ciblée.');

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
        auto: false,
        isActive: true,
        revokedAt: null,
        startDate: { lte: at },
        endDate: { gt: at },
        toUser: { isActive: true, deletedAt: null, role: { notIn: ['AUDITEUR', 'PRESTATAIRE'] } },
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
   * Réassigne une seule fois une validation active en retard. Une escalade
   * porte sur cette validation, jamais sur les autres pouvoirs du délégant.
   *
   * @param thresholdHours Seuil au-delà duquel une step est éligible — peut
   *   provenir de `AppConfig.delegation.autoThresholdHours` (default 48h).
   */
  async runAutoDelegation(thresholdHours = 48): Promise<{
    delegated: number;
    escalated: number;
    skipped: number;
  }> {
    const now = new Date();
    const threshold = Number.isFinite(thresholdHours) && thresholdHours >= 1 ? thresholdHours : 48;
    let delegated = 0;
    let escalated = 0;
    let skipped = 0;

    const stale = await this.prisma.approvalStepInstance.findMany({
      where: {
        decision: "PENDING",
        escalatedAt: null,
        instance: { status: "PENDING" },
        OR: [{ dueAt: null }, { dueAt: { lte: now } }],
      },
      select: { id: true },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      take: 200, // batch pour ne pas saturer
    });

    for (const candidate of stale) {
      const result = await workflowTransaction(this.prisma, async db => {
        const si = await db.approvalStepInstance.findUnique({ where: { id: candidate.id }, include: { assignedTo: true, step: true, instance: true } });
        if (!si || si.decision !== 'PENDING' || si.escalatedAt || si.instance.status !== 'PENDING' || si.step.order !== si.instance.currentStepOrder || ['START', 'BRANCH', 'END'].includes(si.step.type)) return 'skipped';
        const document = await db.document.findUnique({ where: { id: si.instance.documentId }, select: { id: true, ownerId: true, currentVersionId: true, deletedAt: true, title: true, reference: true, status: true } });
        if (!document || document.deletedAt || ['APPROVED', 'ARCHIVED', 'OBSOLETE'].includes(document.status) || document.currentVersionId !== si.instance.documentVersionId) return 'skipped';
        const activated = await db.approvalAuditLog.findFirst({ where: { approvalInstanceId: si.instanceId, action: 'APPROVAL_STEP_ACTIVATED', metadata: { path: ['stepId'], equals: si.stepId } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
        const eligibleAt = si.dueAt ?? new Date((activated?.createdAt ?? si.instance.startedAt).getTime() + threshold * 3_600_000);
        if (eligibleAt > now) return 'skipped';
        const excluded = [si.assignedToId, document.ownerId].filter((id): id is string => Boolean(id));
        const targetIds = [si.step.escalateToUserId, si.assignedTo?.managerId].filter((id): id is string => Boolean(id) && !excluded.includes(id!));
        let target: { id: string } | null = null;
        let isEscalation = false;
        for (const id of targetIds) {
          target = await db.user.findFirst({ where: { id, isActive: true, deletedAt: null, role: { notIn: ['PRESTATAIRE', 'AUDITEUR'] } }, select: { id: true } });
          if (target) { isEscalation = id === si.step.escalateToUserId; break; }
        }
        if (!target) {
          target = await db.user.findFirst({ where: { role: 'SUPER_ADMIN', isActive: true, deletedAt: null, id: { notIn: excluded } }, orderBy: { createdAt: 'asc' }, select: { id: true } });
          isEscalation = true;
        }
        if (!target || excluded.includes(target.id)) return 'skipped';
        // Deux voix d'un quorum ne peuvent pas être réattribuées à la même personne.
        const peer = await db.approvalStepInstance.findFirst({ where: { instanceId: si.instanceId, stepId: si.stepId, id: { not: si.id }, OR: [{ assignedToId: target.id }, { decidedById: target.id, decision: 'APPROVED' }] }, select: { id: true } });
        if (peer) return 'skipped';
        const claimed = await db.approvalStepInstance.updateMany({ where: { id: si.id, decision: 'PENDING', escalatedAt: null, assignedToId: si.assignedToId, instance: { status: 'PENDING', currentStepOrder: si.step.order } }, data: { assignedToId: target.id, escalatedAt: now } });
        if (claimed.count !== 1) return 'skipped';
        await db.approvalAuditLog.create({ data: { actorId: null, action: isEscalation ? 'DELEGATION_AUTO_ESCALATED' : 'DELEGATION_AUTO_CREATED', approvalInstanceId: si.instanceId, stepInstanceId: si.id, metadata: { thresholdHours: threshold, originalAssignee: si.assignedToId, target: target.id, scope: 'STEP_ONLY' } } });
        await db.notification.create({ data: { userId: target.id, type: 'DOC_APPROVAL_NEEDED', title: `Validation réattribuée : ${document.reference}`, body: `Le document « ${document.title} » attend votre décision à l’étape « ${si.step.name} ».`, resourceType: 'Document', resourceId: document.id } });
        return isEscalation ? 'escalated' : 'delegated';
      });
      if (result === 'escalated') escalated++;
      else if (result === 'delegated') delegated++;
      else skipped++;
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
