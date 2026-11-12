import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type {
  DocumentCategory,
  Prisma,
  UserRole,
  WorkflowStepMode,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { WorkflowRuntimeService } from './workflow-runtime.service';
import type { RequestUser } from '../common/interfaces';
import { randomUUID } from 'crypto';

/**
 * WorkflowsService — Workflows d'approbation configurables (ISO 27001 A.5.1).
 *
 * Modes supportés (enum WorkflowStepMode) :
 *  - SINGLE        : une seule décision suffit (1 ligne ApprovalStepInstance).
 *  - PARALLEL_ALL  : N approbateurs résolus dynamiquement, tous doivent
 *                    approuver avant passage à l'étape suivante.
 *  - PARALLEL_ANY  : N approbateurs, dès qu'UNE approbation arrive, l'étape
 *                    est validée et les autres step-instances non décidées
 *                    sont marquées SKIPPED.
 *
 * Un rejet par n'importe quel approbateur (tous modes confondus) → l'étape
 * entière et l'instance sont rejetées immédiatement.
 *
 * Validation stricte : une étape doit cibler EXACTEMENT UN type d'approbateur
 * parmi {approverRole, approverUserId, approverDeptId} — sinon BadRequest.
 */
@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(private readonly prisma: PrismaService, private readonly runtime: WorkflowRuntimeService) {}

  // ---------------------------------------------------------------------------
  // Helpers — validation & résolution d'approbateurs
  // ---------------------------------------------------------------------------

  /**
   * Valide qu'une définition d'étape cible EXACTEMENT UN type d'approbateur.
   * Retourne un BadRequestException avec message explicite si le sélecteur
   * est vide, ambigu (plusieurs renseignés), ou invalide.
   */
  private validateApproverSelector(sel: {
    approverRole?: string | null;
    approverUserId?: string | null;
    approverDeptId?: string | null;
  }): void {
    const provided = [
      sel.approverRole ? "approverRole" : null,
      sel.approverUserId ? "approverUserId" : null,
      sel.approverDeptId ? "approverDeptId" : null,
    ].filter((v): v is string => v !== null);

    if (provided.length === 0) {
      throw new BadRequestException(
        "Une étape doit définir exactement UN approbateur : 'approverRole', 'approverUserId' ou 'approverDeptId'.",
      );
    }
    if (provided.length > 1) {
      throw new BadRequestException(
        `Une étape ne peut définir qu'UN SEUL type d'approbateur à la fois. Reçus : ${provided.join(
          ", ",
        )}.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // CRUD Workflows
  // ---------------------------------------------------------------------------

  /** Liste tous les workflows (avec leurs étapes). */
  async findAll() {
    const workflows = await this.prisma.approvalWorkflow.findMany({
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: {
        steps: { orderBy: { order: "asc" } },
        _count: { select: { instances: true } },
      },
    });
    return workflows.map(workflow => ({ ...workflow, definitionLocked: workflow._count.instances > 0 }));
  }

  /** Récupère un workflow par id, avec étapes et approbateurs. */
  async findOne(id: string) {
    const wf = await this.prisma.approvalWorkflow.findUnique({
      where: { id },
      include: {
        steps: {
          orderBy: { order: "asc" },
          include: {
            approverUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            approverDept: true,
            escalateTo: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: { select: { instances: true } },
      },
    });
    if (!wf) throw new NotFoundException(`Workflow ${id} introuvable`);
    return { ...wf, definitionLocked: wf._count.instances > 0 };
  }

  /** Crée un nouveau workflow (sans étapes). */
  async create(
    data: {
      name: string;
      description?: string;
      documentCategory?: DocumentCategory | null;
      isDefault?: boolean;
    },
    userId: string,
  ) {
    // Un seul default par catégorie : on reset les autres si isDefault=true
    if (data.isDefault) {
      await this.prisma.approvalWorkflow.updateMany({
        where: {
          documentCategory: data.documentCategory ?? null,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }
    return this.prisma.approvalWorkflow.create({
      data: {
        name: data.name,
        description: data.description,
        documentCategory: data.documentCategory ?? null,
        isDefault: data.isDefault ?? false,
        createdById: userId,
      },
    });
  }

  /** Met à jour un workflow. */
  async update(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      documentCategory?: DocumentCategory | null;
      isActive?: boolean;
      isDefault?: boolean;
    },
  ) {
    return this.runtime.transact(async db => {
      const existing = await db.approvalWorkflow.findUnique({
        where: { id },
      });
      if (!existing) throw new NotFoundException(`Workflow ${id} introuvable`);

      if (data.name !== undefined || data.description !== undefined || data.documentCategory !== undefined) {
        await this.assertDefinitionUnused(id, db);
      }

      if (data.isDefault) {
        await db.approvalWorkflow.updateMany({
          where: {
            documentCategory: data.documentCategory ?? existing.documentCategory,
            isDefault: true,
            id: { not: id },
          },
          data: { isDefault: false },
        });
      }

      return db.approvalWorkflow.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          documentCategory: data.documentCategory,
          isActive: data.isActive,
          isDefault: data.isDefault,
        },
      });
    });
  }

  /** Désactive (soft delete) un workflow. */
  async deactivate(id: string) {
    return this.prisma.approvalWorkflow.update({
      where: { id },
      data: { isActive: false, isDefault: false },
    });
  }

  // ---------------------------------------------------------------------------
  // Presets pré-définis
  // ---------------------------------------------------------------------------

  /**
   * Crée (ou vérifie) 5 workflows d'approbation prêts à l'emploi couvrant les
   * cas les plus fréquents chez OMNITECH. Idempotent : si un workflow de même
   * nom existe déjà, il est ignoré — jamais écrasé.
   *
   * Les étapes utilisent uniquement `approverRole` pour rester portable (pas
   * de dépendance à un département ou utilisateur spécifique).
   */
  async seedPresets(userId: string) {
    type PresetStep = {
      name: string;
      mode: "SINGLE" | "PARALLEL_ALL" | "PARALLEL_ANY";
      approverRole: "REVIEWER" | "ADMIN" | "SUPER_ADMIN";
      slaHours?: number;
      autoApproveOnTimeout?: boolean;
      minApprovers?: number;
    };
    type Preset = {
      name: string;
      description: string;
      documentCategory: string | null;
      isDefault: boolean;
      steps: PresetStep[];
    };

    const presets: Preset[] = [
      {
        name: "Validation simple",
        description:
          "Relecture unique par un relecteur — idéal pour les notes de service et communications internes.",
        documentCategory: null,
        isDefault: false,
        steps: [
          {
            name: "Relecture",
            mode: "SINGLE",
            approverRole: "REVIEWER",
            slaHours: 48,
          },
        ],
      },
      {
        name: "Validation hiérarchique",
        description:
          "Relecture puis validation admin. Workflow standard pour la majorité des documents.",
        documentCategory: null,
        isDefault: true,
        steps: [
          {
            name: "Relecture métier",
            mode: "SINGLE",
            approverRole: "REVIEWER",
            slaHours: 48,
          },
          {
            name: "Validation admin",
            mode: "SINGLE",
            approverRole: "ADMIN",
            slaHours: 72,
          },
        ],
      },
      {
        name: "Validation sécurité RSSI",
        description:
          "Parcours spécifique pour les politiques de sécurité — ISO 27001. Relecture puis double validation ADMIN + RSSI.",
        documentCategory: "POLICY",
        isDefault: true,
        steps: [
          {
            name: "Relecture technique",
            mode: "SINGLE",
            approverRole: "REVIEWER",
            slaHours: 72,
          },
          {
            name: "Validation ADMIN + RSSI",
            mode: "PARALLEL_ALL",
            approverRole: "ADMIN",
            slaHours: 120,
          },
          {
            name: "Approbation finale",
            mode: "SINGLE",
            approverRole: "SUPER_ADMIN",
            slaHours: 168,
          },
        ],
      },
      {
        name: "Procédure ISO 27001",
        description:
          "Workflow conforme pour les procédures opérationnelles : relecture, validation RSSI, approbation direction.",
        documentCategory: "PROCEDURE",
        isDefault: true,
        steps: [
          {
            name: "Revue qualité",
            mode: "SINGLE",
            approverRole: "REVIEWER",
            slaHours: 72,
          },
          {
            name: "Validation RSSI",
            mode: "SINGLE",
            approverRole: "ADMIN",
            slaHours: 120,
          },
          {
            name: "Approbation direction",
            mode: "SINGLE",
            approverRole: "SUPER_ADMIN",
            slaHours: 168,
          },
        ],
      },
      {
        name: "Validation contrat",
        description:
          "Contrats fournisseurs / prestataires — double validation ADMIN (juridique + achats), approbation SUPER_ADMIN finale.",
        documentCategory: "CONTRACT",
        isDefault: true,
        steps: [
          {
            name: "Revue juridique & achats",
            mode: "PARALLEL_ALL",
            approverRole: "ADMIN",
            slaHours: 120,
          },
          {
            name: "Signature direction",
            mode: "SINGLE",
            approverRole: "SUPER_ADMIN",
            slaHours: 168,
          },
        ],
      },
    ];

    const created: string[] = [];
    const skipped: string[] = [];

    for (const preset of presets) {
      const existing = await this.prisma.approvalWorkflow.findFirst({
        where: { name: preset.name },
      });
      if (existing) {
        skipped.push(preset.name);
        continue;
      }

      if (preset.isDefault) {
        await this.prisma.approvalWorkflow.updateMany({
          where: {
            documentCategory: (preset.documentCategory as never) ?? null,
            isDefault: true,
          },
          data: { isDefault: false },
        });
      }

      const wf = await this.prisma.approvalWorkflow.create({
        data: {
          name: preset.name,
          description: preset.description,
          documentCategory: (preset.documentCategory as never) ?? null,
          isDefault: preset.isDefault,
          createdById: userId,
        },
      });

      for (let i = 0; i < preset.steps.length; i++) {
        const step = preset.steps[i]!;
        await this.prisma.workflowStep.create({
          data: {
            workflowId: wf.id,
            order: i + 1,
            name: step.name,
            mode: step.mode as never,
            approverRole: step.approverRole as never,
            slaHours: step.slaHours ?? null,
            autoApproveOnTimeout: step.autoApproveOnTimeout ?? false,
          },
        });
      }

      created.push(preset.name);
    }

    return { created, skipped, total: presets.length };
  }

  // ---------------------------------------------------------------------------
  // CRUD Steps
  // ---------------------------------------------------------------------------

  async addStep(
    workflowId: string,
    data: {
      name: string;
      mode?: WorkflowStepMode;
      approverRole?: UserRole | null;
      approverUserId?: string | null;
      approverDeptId?: string | null;
      slaHours?: number | null;
      escalateToUserId?: string | null;
      autoApproveOnTimeout?: boolean;
      order?: number;
      minApprovers?: number;
    },
  ) {
    return this.runtime.transact(async db => {
      await this.assertDefinitionUnused(workflowId, db);
      const wf = await db.approvalWorkflow.findUnique({
        where: { id: workflowId },
        include: { steps: { orderBy: { order: "desc" }, take: 1 } },
      });
      if (!wf) throw new NotFoundException(`Workflow ${workflowId} introuvable`);

      const nextOrder = data.order ?? (wf.steps[0]?.order ?? 0) + 1;

      // Validation stricte : exactement UN type d'approbateur
      this.validateApproverSelector({
        approverRole: data.approverRole,
        approverUserId: data.approverUserId,
        approverDeptId: data.approverDeptId,
      });

      // Sanity supplémentaire : si user ou dept fourni, on vérifie son existence.
      if (data.approverUserId) {
        const u = await db.user.findUnique({
          where: { id: data.approverUserId },
          select: { id: true },
        });
        if (!u) {
          throw new BadRequestException(
            `Utilisateur approbateur ${data.approverUserId} introuvable`,
          );
        }
      }
      if (data.approverDeptId) {
        const d = await db.department.findUnique({
          where: { id: data.approverDeptId },
          select: { id: true },
        });
        if (!d) {
          throw new BadRequestException(
            `Département approbateur ${data.approverDeptId} introuvable`,
          );
        }
      }

      return db.workflowStep.create({
        data: {
          workflowId,
          order: nextOrder,
          name: data.name,
          mode: data.mode ?? "SINGLE",
          approverRole: data.approverRole ?? null,
          approverUserId: data.approverUserId ?? null,
          approverDeptId: data.approverDeptId ?? null,
          slaHours: data.slaHours ?? null,
          escalateToUserId: data.escalateToUserId ?? null,
          autoApproveOnTimeout: data.autoApproveOnTimeout ?? false,
          minApprovers: data.minApprovers ?? 1,
        },
      });
    });
  }

  async removeStep(stepId: string) {
    return this.runtime.transact(async db => {
      const step = await db.workflowStep.findUnique({ where: { id: stepId } });
      if (!step) throw new NotFoundException("Étape introuvable.");
      await this.assertDefinitionUnused(step.workflowId, db);
      return db.workflowStep.delete({ where: { id: stepId } });
    });
  }

  async reorderSteps(workflowId: string, orderedStepIds: string[]) {
    if (!Array.isArray(orderedStepIds) || !orderedStepIds.length || new Set(orderedStepIds).size !== orderedStepIds.length) {
      throw new BadRequestException("Fournissez chaque étape une seule fois.");
    }
    return this.runtime.transact(async db => {
      await this.assertDefinitionUnused(workflowId, db);
      const steps = await db.workflowStep.findMany({ where: { workflowId }, select: { id: true } });
      const known = new Set(steps.map(step => step.id));
      if (known.size !== orderedStepIds.length || orderedStepIds.some(id => !known.has(id))) {
        throw new BadRequestException("L’ordre doit contenir exactement les étapes de ce circuit.");
      }
      // The unique (workflowId, order) constraint also applies during a swap.
      for (let index = 0; index < orderedStepIds.length; index++) {
        await db.workflowStep.update({ where: { id: orderedStepIds[index] }, data: { order: -index - 1 } });
      }
      for (let index = 0; index < orderedStepIds.length; index++) {
        await db.workflowStep.update({ where: { id: orderedStepIds[index] }, data: { order: index + 1 } });
      }
      return db.workflowStep.findMany({ where: { workflowId }, orderBy: { order: "asc" } });
    });
  }

  // ---------------------------------------------------------------------------
  // Instances
  // ---------------------------------------------------------------------------

  createInstance(workflowId: string, documentId: string, documentVersionId: string, userId: string,
    stepOverrides?: Array<{ stepId: string; approverUserId: string }>) {
    return this.runtime.start(workflowId, documentId, documentVersionId, userId, stepOverrides);
  }

  decide(stepInstanceId: string, userId: string, decision: "APPROVED" | "REJECTED", comment?: string) {
    return this.runtime.decide(stepInstanceId, userId, decision, comment);
  }

  evaluateProgress(instanceId: string) { return this.runtime.evaluate(instanceId); }

  getPendingForUser(userId: string, _userRole: string, _deptId?: string | null) { return this.runtime.pending(userId); }

  getActiveInstanceForDocument(documentId: string, user: RequestUser) { return this.runtime.active(documentId, user); }

  getHistory(documentId: string, user: RequestUser) { return this.runtime.history(documentId, user); }

  remind(instanceId: string, userId: string) { return this.runtime.remind(instanceId, userId); }

  cancelInstance(instanceId: string, userId: string) { return this.runtime.cancel(instanceId, userId); }

  private async assertDefinitionUnused(workflowId: string, db: Prisma.TransactionClient = this.prisma) {
    if (await db.approvalInstance.count({ where: { workflowId } })) {
      throw new BadRequestException("Ce circuit a déjà été utilisé. Dupliquez-le pour modifier ses étapes sans altérer l’historique.");
    }
  }

  duplicate(workflowId: string, actorId: string) {
    return this.runtime.transact(async db => {
      const original = await db.approvalWorkflow.findUnique({ where: { id: workflowId }, include: { steps: { orderBy: { order: "asc" } } } });
      if (!original) throw new NotFoundException("Circuit introuvable.");
      const mapping = new Map<string, string>(original.steps.map(step => [step.id, randomUUID()]));
      return db.approvalWorkflow.create({ data: {
        name: `${original.name} (copie)`, description: original.description,
        documentCategory: original.documentCategory, createdById: actorId, isActive: false, isDefault: false,
        steps: { create: original.steps.map(step => ({
          id: mapping.get(step.id), order: step.order, name: step.name, mode: step.mode, type: step.type,
          approverRole: step.approverRole, approverUserId: step.approverUserId, approverDeptId: step.approverDeptId,
          slaHours: step.slaHours, escalateToUserId: step.escalateToUserId,
          autoApproveOnTimeout: step.autoApproveOnTimeout, minApprovers: step.minApprovers,
          positionX: step.positionX, positionY: step.positionY,
          ...(step.condition === null ? {} : { condition: step.condition }),
          nextStepIds: step.nextStepIds.map(id => mapping.get(id)).filter((id): id is string => Boolean(id)),
        })) },
      }, include: { steps: { orderBy: { order: "asc" } } } });
    });
  }
}
