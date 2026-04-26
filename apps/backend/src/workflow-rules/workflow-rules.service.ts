import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateWorkflowRuleDto } from "./dto/create-workflow-rule.dto";
import { UpdateWorkflowRuleDto } from "./dto/update-workflow-rule.dto";

/**
 * Contexte d'évaluation d'une règle. Construit à la création d'un document
 * (ou en dry-run) ; les clés correspondent aux conditions supportées par
 * WorkflowRuleConditionDto.
 */
export interface RuleEvaluationContext {
  classification?: string | null;
  category?: string | null;
  departmentId?: string | null;
  amount?: number | null;
}

interface RuleStepConfig {
  level: number;
  name?: string;
  approverRole?: string;
  approverUserId?: string;
  approverDeptId?: string;
  deadlineHours?: number;
  parallel?: boolean;
  parallelGroupId?: string;
}

/**
 * Service WorkflowRule — moteur de règles dynamiques pour l'approbation N+1
 * (ISO 27001 A.5.1). Sélectionne la règle applicable par priorité, instancie
 * un workflow (Approval{Workflow,Step,Instance,StepInstance}) à la volée et
 * journalise toutes les mutations dans WorkflowRuleAuditLog.
 *
 * Design notes :
 *  - Les règles ne s'auto-portent pas en runtime : on matérialise un
 *    ApprovalWorkflow éphémère + ses WorkflowStep pour préserver le schéma
 *    de FK existant (ApprovalStepInstance.stepId est NOT NULL).
 *  - Le workflow ainsi créé est marqué `isActive=false, isDefault=false` pour
 *    qu'il n'apparaisse pas dans les sélecteurs UI ; son nom est préfixé
 *    `[rule:<ruleId>]` pour audit.
 *  - Le matching des conditions est tolérant : une clé absente du contexte
 *    est ignorée silencieusement (pas d'échec). Une clé renseignée doit
 *    matcher (égalité scalaire ou inclusion si la condition est un tableau).
 */
@Injectable()
export class WorkflowRulesService {
  private readonly logger = new Logger(WorkflowRulesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async findAll() {
    return this.prisma.workflowRule.findMany({
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    });
  }

  async findOne(id: string) {
    const rule = await this.prisma.workflowRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException(`WorkflowRule ${id} introuvable`);
    return rule;
  }

  async create(dto: CreateWorkflowRuleDto, actorId: string) {
    this.assertValidSteps(dto.steps);
    const rule = await this.prisma.workflowRule.create({
      data: {
        name: dto.name,
        priority: dto.priority ?? 100,
        condition: (dto.condition ?? {}) as unknown as Prisma.InputJsonValue,
        steps: dto.steps as unknown as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
        createdById: actorId,
      },
    });
    await this.audit(rule.id, actorId, "RULE_CREATED", { name: rule.name });
    return rule;
  }

  async update(id: string, dto: UpdateWorkflowRuleDto, actorId: string) {
    const existing = await this.prisma.workflowRule.findUnique({
      where: { id },
    });
    if (!existing)
      throw new NotFoundException(`WorkflowRule ${id} introuvable`);

    if (dto.steps) this.assertValidSteps(dto.steps);

    const data: Prisma.WorkflowRuleUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.condition !== undefined) {
      data.condition = dto.condition as unknown as Prisma.InputJsonValue;
    }
    if (dto.steps !== undefined) {
      data.steps = dto.steps as unknown as Prisma.InputJsonValue;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const updated = await this.prisma.workflowRule.update({
      where: { id },
      data,
    });
    await this.audit(id, actorId, "RULE_UPDATED", {
      changes: Object.keys(dto),
    });
    return updated;
  }

  async remove(id: string, actorId: string) {
    const existing = await this.prisma.workflowRule.findUnique({
      where: { id },
    });
    if (!existing)
      throw new NotFoundException(`WorkflowRule ${id} introuvable`);
    await this.prisma.workflowRule.delete({ where: { id } });
    await this.audit(id, actorId, "RULE_DELETED", { name: existing.name });
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Matching
  // ---------------------------------------------------------------------------

  /**
   * Sélectionne la première règle applicable au contexte donné, en respectant
   * l'ordre `priority ASC` puis `createdAt DESC` (en cas d'égalité de
   * priorité, la plus récente l'emporte).
   * Retourne null si aucune règle ne matche.
   */
  async findApplicableRule(ctx: RuleEvaluationContext) {
    const rules = await this.prisma.workflowRule.findMany({
      where: { isActive: true },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    });
    for (const rule of rules) {
      if (this.matches(rule.condition as unknown, ctx)) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Évaluation pure (dry-run) — utile pour le bouton "tester" de l'UI admin.
   * Renvoie la règle qui matcherait + la trace des conditions évaluées.
   */
  async evaluate(ctx: RuleEvaluationContext) {
    const rule = await this.findApplicableRule(ctx);
    return {
      context: ctx,
      matchedRuleId: rule?.id ?? null,
      matchedRuleName: rule?.name ?? null,
      steps: rule ? ((rule.steps as unknown as RuleStepConfig[]) ?? []) : [],
    };
  }

  /**
   * Matching d'une condition JSONB contre un contexte. Pour chaque clé :
   *  - condition[key] absente ou null/undefined → ignoré
   *  - condition[key] = scalaire → égalité stricte avec ctx[key]
   *  - condition[key] = tableau  → ctx[key] doit ∈ tableau
   *  - clé `minAmount` → comparaison numérique (ctx.amount ≥ minAmount)
   */
  private matches(condition: unknown, ctx: RuleEvaluationContext): boolean {
    if (!condition || typeof condition !== "object") return true;
    const c = condition as Record<string, unknown>;

    for (const key of Object.keys(c)) {
      const expected = c[key];
      if (expected === null || expected === undefined) continue;

      if (key === "minAmount") {
        const amount = ctx.amount ?? null;
        if (typeof expected !== "number") continue;
        if (amount === null || amount < expected) return false;
        continue;
      }

      const actual = (ctx as Record<string, unknown>)[key];
      if (actual === undefined || actual === null) {
        // Si la condition existe mais que le ctx ne fournit pas la clé,
        // on considère le match comme un échec (sinon une règle vide
        // matcherait tout n'importe comment, ce qui est déjà couvert par
        // condition = {}).
        return false;
      }

      if (Array.isArray(expected)) {
        if (!expected.includes(actual as never)) return false;
      } else if (expected !== actual) {
        return false;
      }
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Instanciation d'un workflow depuis une règle
  // ---------------------------------------------------------------------------

  /**
   * Instancie un ApprovalWorkflow éphémère + ApprovalInstance + step-instances
   * à partir des steps de la règle. Le workflow créé est marqué inactif pour
   * ne pas polluer les sélecteurs ; l'instance est immédiatement PENDING.
   */
  async instantiateWorkflow(
    ruleOrId: string | { id: string; name: string; steps: unknown },
    document: { id: string; currentVersionId?: string | null },
    actorId: string,
  ) {
    const rule =
      typeof ruleOrId === "string" ? await this.findOne(ruleOrId) : ruleOrId;

    const steps = (rule.steps as unknown as RuleStepConfig[]) ?? [];
    if (!Array.isArray(steps) || steps.length === 0) {
      throw new BadRequestException(
        `La règle ${rule.id} ne contient aucune étape`,
      );
    }

    // Le schema actuel impose un documentVersionId NOT NULL. On utilise la
    // version courante du document, sinon on ne peut pas instancier — dans
    // ce cas on remonte un BadRequest pour signaler au caller (documents
    // service) qu'il doit retomber sur le fallback reviewerId.
    const docVersionId =
      document.currentVersionId ??
      (
        await this.prisma.documentVersion.findFirst({
          where: { documentId: document.id },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        })
      )?.id ??
      null;

    if (!docVersionId) {
      throw new BadRequestException(
        "Document sans version — impossible d'instancier un workflow",
      );
    }

    // Crée un ApprovalWorkflow éphémère pour porter les étapes (FK requirement)
    const ephemeralWf = await this.prisma.approvalWorkflow.create({
      data: {
        name: `[rule:${rule.id}] ${rule.name}`,
        description: `Workflow instancié depuis la règle ${rule.name}`,
        isActive: false,
        isDefault: false,
        createdById: actorId,
      },
    });

    // Trie les steps par level pour respecter l'ordre hiérarchique
    const sorted = [...steps].sort((a, b) => (a.level ?? 1) - (b.level ?? 1));

    const stepRows: Array<{ id: string; cfg: RuleStepConfig; order: number }> =
      [];
    for (let i = 0; i < sorted.length; i++) {
      const cfg = sorted[i]!;
      const created = await this.prisma.workflowStep.create({
        data: {
          workflowId: ephemeralWf.id,
          order: i + 1,
          name: cfg.name ?? `Niveau ${cfg.level}`,
          mode: cfg.parallel ? "PARALLEL_ALL" : "SINGLE",
          approverRole: (cfg.approverRole as never) ?? null,
          approverUserId: cfg.approverUserId ?? null,
          approverDeptId: cfg.approverDeptId ?? null,
          slaHours: cfg.deadlineHours ?? null,
          autoApproveOnTimeout: false,
        },
      });
      stepRows.push({ id: created.id, cfg, order: i + 1 });
    }

    // Crée l'instance + step-instances initialement toutes PENDING
    const instance = await this.prisma.approvalInstance.create({
      data: {
        workflowId: ephemeralWf.id,
        documentId: document.id,
        documentVersionId: docVersionId,
        startedById: actorId,
        currentStepOrder: 1,
        status: "PENDING",
        stepResults: {
          create: stepRows.map((row) => ({
            step: { connect: { id: row.id } },
            decision: "PENDING",
            level: row.cfg.level,
            parallelGroupId: row.cfg.parallelGroupId ?? null,
            deadlineAt: row.cfg.deadlineHours
              ? new Date(Date.now() + row.cfg.deadlineHours * 3600_000)
              : null,
            dueAt: row.cfg.deadlineHours
              ? new Date(Date.now() + row.cfg.deadlineHours * 3600_000)
              : null,
          })),
        },
      },
    });

    await this.audit(rule.id, actorId, "RULE_INSTANTIATED", {
      documentId: document.id,
      instanceId: instance.id,
      stepCount: stepRows.length,
    });

    this.logger.log(
      `WorkflowRule ${rule.id} appliquée sur document ${document.id} ` +
        `→ instance ${instance.id} (${stepRows.length} étapes)`,
    );

    return instance;
  }

  // ---------------------------------------------------------------------------
  // Cron : surveillance des deadlines
  // ---------------------------------------------------------------------------

  /**
   * Tâche planifiée — détecte les step-instances dont la deadline est dépassée.
   * Première version : log seulement (no-op métier). Une itération ultérieure
   * pourra escalader les approbateurs ou notifier un délégué.
   */
  @Cron("0 9 * * *")
  async evaluateOverdue() {
    try {
      const now = new Date();
      const overdue = await this.prisma.approvalStepInstance.findMany({
        where: {
          decision: "PENDING",
          deadlineAt: { not: null, lt: now },
        },
        select: { id: true, instanceId: true, deadlineAt: true },
      });
      if (overdue.length === 0) {
        this.logger.log(
          "WorkflowRules.evaluateOverdue : aucune step en retard",
        );
        return { overdueCount: 0 };
      }
      this.logger.warn(
        `WorkflowRules.evaluateOverdue : ${overdue.length} step-instances en retard`,
      );
      return { overdueCount: overdue.length };
    } catch (err) {
      this.logger.error("evaluateOverdue failed", err as Error);
      return { overdueCount: 0, error: (err as Error).message };
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private assertValidSteps(steps: RuleStepConfig[] | undefined): void {
    if (!steps || steps.length === 0) {
      throw new BadRequestException(
        "Une règle doit contenir au moins une étape",
      );
    }
    for (const s of steps) {
      const provided = [
        s.approverRole,
        s.approverUserId,
        s.approverDeptId,
      ].filter(Boolean).length;
      if (provided === 0) {
        throw new BadRequestException(
          `Étape niveau ${s.level} : aucun approbateur défini ` +
            `(approverRole / approverUserId / approverDeptId)`,
        );
      }
      if (provided > 1) {
        throw new BadRequestException(
          `Étape niveau ${s.level} : un seul type d'approbateur autorisé`,
        );
      }
    }
  }

  private async audit(
    ruleId: string | null,
    actorId: string | null,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.workflowRuleAuditLog.create({
        data: {
          ruleId,
          actorId,
          action,
          metadata: metadata as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      // L'audit ne doit jamais bloquer la mutation principale.
      this.logger.warn(
        `Audit log skipped (${action}): ${(err as Error).message}`,
      );
    }
  }
}
