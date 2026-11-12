import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { WorkflowRuntimeService } from "../approval-workflows/workflow-runtime.service";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateWorkflowRuleDto } from "./dto/create-workflow-rule.dto";
import { UpdateWorkflowRuleDto } from "./dto/update-workflow-rule.dto";

/**
 * Contexte d'évaluation d'une règle. Construit à la soumission d'un document
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
 *  - Une condition inconnue ou absente du contexte ne matche pas. Une règle
 *    vide est le seul cas inconditionnel, avec une priorité explicite.
 */
@Injectable()
export class WorkflowRulesService {
  private readonly logger = new Logger(WorkflowRulesService.name);

  constructor(private readonly prisma: PrismaService, private readonly runtime: WorkflowRuntimeService) {}

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
  async findApplicableRule(ctx: RuleEvaluationContext, db: Prisma.TransactionClient = this.prisma) {
    const rules = await db.workflowRule.findMany({
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
    if (condition == null) return true;
    if (typeof condition !== "object" || Array.isArray(condition)) return false;
    const c = condition as Record<string, unknown>;

    for (const key of Object.keys(c)) {
      if (!["classification", "category", "departmentId", "minAmount"].includes(key)) return false;
      const expected = c[key];
      if (expected === null || expected === undefined) continue;

      if (key === "minAmount") {
        const amount = ctx.amount ?? null;
        if (typeof expected !== "number" || !Number.isFinite(expected)) return false;
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
    transaction?: Prisma.TransactionClient,
  ) {
    const instantiate = async (db: Prisma.TransactionClient) => {
      const rule = typeof ruleOrId === "string" ? await db.workflowRule.findUnique({ where: { id: ruleOrId } }) : ruleOrId;
      if (!rule) throw new NotFoundException("Règle introuvable.");
      const configurations = rule.steps as unknown as RuleStepConfig[];
      this.assertValidSteps(configurations);
      const doc = await db.document.findUnique({ where: { id: document.id } });
      if (!doc || doc.deletedAt) throw new NotFoundException("Document introuvable.");
      if (!doc.currentVersionId || document.currentVersionId && document.currentVersionId !== doc.currentVersionId) {
        throw new BadRequestException("Une version courante figée est requise avant de lancer la règle.");
      }
      const existing = await db.approvalInstance.findFirst({ where: { documentId: doc.id, status: "PENDING" }, include: { workflow: true } });
      if (existing) {
        if (existing.documentVersionId === doc.currentVersionId && existing.workflow.name.startsWith(`[rule:${rule.id}] `)) return existing;
        throw new BadRequestException("Un autre circuit est déjà actif. Terminez-le ou faites-le annuler avant cette soumission.");
      }
      const workflow = await db.approvalWorkflow.create({ data: {
        name: `[rule:${rule.id}] ${rule.name}`, description: `Règle automatique : ${rule.name}`,
        isActive: false, isDefault: false, createdById: actorId,
      } });
      const sorted = [...configurations].sort((left, right) => left.level - right.level);
      const groups: RuleStepConfig[][] = [];
      const byGroup = new Map<string, RuleStepConfig[]>();
      for (const configuration of sorted) {
        if (configuration.parallel && configuration.parallelGroupId) {
          const key = `${configuration.level}:${configuration.parallelGroupId}`;
          const existingGroup = byGroup.get(key);
          if (existingGroup) existingGroup.push(configuration);
          else { const group = [configuration]; byGroup.set(key, group); groups.push(group); }
        } else groups.push([configuration]);
      }
      const assignments: Record<string, { userIds: string[]; level: number; parallelGroupId: string | null }> = {};
      for (let index = 0; index < groups.length; index++) {
        const group = groups[index]!;
        const first = group[0]!;
        const combined = group.length > 1;
        const deadlines = group.flatMap(configuration => configuration.deadlineHours ? [configuration.deadlineHours] : []);
        const step = await db.workflowStep.create({ data: {
          workflowId: workflow.id, order: index + 1,
          name: combined ? `Niveau ${first.level} — validations parallèles` : first.name || `Niveau ${first.level}`,
          mode: first.parallel ? "PARALLEL_ALL" : "SINGLE",
          approverRole: combined ? null : (first.approverRole as UserRole | undefined) ?? null,
          approverUserId: combined ? null : first.approverUserId ?? null,
          approverDeptId: combined ? null : first.approverDeptId ?? null,
          slaHours: deadlines.length ? Math.min(...deadlines) : null,
          condition: { ruleId: rule.id, level: first.level, selectors: group as unknown as Prisma.InputJsonArray },
        } });
        {
          const ids = new Set<string>();
          for (const configuration of group) {
            for (const id of await this.runtime.approvers(db, {
              name: configuration.name || `Niveau ${configuration.level}`,
              approverRole: (configuration.approverRole as UserRole | undefined) ?? null,
              approverUserId: configuration.approverUserId ?? null, approverDeptId: configuration.approverDeptId ?? null,
            }, doc.ownerId)) ids.add(id);
          }
          assignments[step.id] = { userIds: [...ids], level: first.level, parallelGroupId: first.parallelGroupId ?? null };
        }
      }
      const instance = await this.runtime.startInTransaction(db, workflow.id, doc.id, doc.currentVersionId, actorId, [], true, assignments);
      await db.workflowRuleAuditLog.create({ data: { ruleId: rule.id, actorId, action: "RULE_INSTANTIATED", metadata: { documentId: doc.id, instanceId: instance.id, stepCount: groups.length } } });
      return instance;
    };
    return transaction ? instantiate(transaction) : this.runtime.transact(instantiate);
  }

  async applyAtSubmission(db: Prisma.TransactionClient, document: { id: string; category: string; classification: string; currentVersionId: string | null }, actorId: string) {
    const actor = await db.user.findUnique({ where: { id: actorId }, select: { departmentId: true } });
    const rule = await this.findApplicableRule({ category: document.category, classification: document.classification, departmentId: actor?.departmentId }, db);
    if (!rule) return null;
    if (!document.currentVersionId) throw new BadRequestException("Enregistrez une version du document avant sa soumission au circuit automatique.");
    return this.instantiateWorkflow(rule, document, actorId, db);
  }

  private assertValidSteps(steps: RuleStepConfig[] | undefined): void {
    if (!Array.isArray(steps) || steps.length === 0 || steps.length > 200) {
      throw new BadRequestException(
        "Une règle doit contenir au moins une étape",
      );
    }
    for (const s of steps) {
      if (!s || !Number.isInteger(s.level) || s.level < 1 || s.level > 100) throw new BadRequestException('Le niveau doit être compris entre 1 et 100.');
      if (s.approverRole && !Object.values(UserRole).includes(s.approverRole as UserRole)) throw new BadRequestException('Rôle d’approbateur inconnu.');
      if (s.deadlineHours != null && (!Number.isInteger(s.deadlineHours) || s.deadlineHours < 1 || s.deadlineHours > 8760)) throw new BadRequestException('Délai d’approbation invalide.');
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
