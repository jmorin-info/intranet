import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { DocumentCategory, Prisma, UserRole, WorkflowStepMode } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

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

  constructor(private readonly prisma: PrismaService) {}

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

  /**
   * Résout la liste des userIds éligibles à approuver une étape donnée,
   * en fonction de son sélecteur (role / user / dept). Exclut les users
   * soft-supprimés et inactifs. Pour approverRole, retourne TOUS les users
   * ayant ce rôle.
   */
  private async resolveStepApprovers(step: {
    approverRole: UserRole | null;
    approverUserId: string | null;
    approverDeptId: string | null;
  }): Promise<string[]> {
    if (step.approverUserId) {
      return [step.approverUserId];
    }
    if (step.approverDeptId) {
      const users = await this.prisma.user.findMany({
        where: {
          departmentId: step.approverDeptId,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }
    if (step.approverRole) {
      const users = await this.prisma.user.findMany({
        where: {
          role: step.approverRole,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }
    return [];
  }

  /**
   * Vérifie que `userId` est éligible à décider sur la step-instance donnée.
   * Règles :
   *  - Si `assignedToId` est renseigné (mode parallèle ou pré-assigné) :
   *    seul cet utilisateur précis peut décider.
   *  - Sinon on compare le rôle / département de l'user aux sélecteurs du
   *    WorkflowStep template.
   */
  private async assertUserCanDecide(
    userId: string,
    stepInstance: {
      assignedToId: string | null;
      step: {
        approverRole: UserRole | null;
        approverUserId: string | null;
        approverDeptId: string | null;
      };
    },
  ): Promise<void> {
    if (stepInstance.assignedToId) {
      if (stepInstance.assignedToId !== userId) {
        throw new ForbiddenException(
          "Cette étape est assignée à un autre approbateur.",
        );
      }
      return;
    }

    // Fallback : résolution dynamique via rôle/dept/user du template.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        departmentId: true,
        isActive: true,
        deletedAt: true,
      },
    });
    if (!user || !user.isActive || user.deletedAt) {
      throw new ForbiddenException("Utilisateur invalide ou désactivé.");
    }

    const { step } = stepInstance;
    if (step.approverUserId && step.approverUserId !== userId) {
      throw new ForbiddenException(
        "Cette étape est réservée à un approbateur spécifique.",
      );
    }
    if (step.approverDeptId && step.approverDeptId !== user.departmentId) {
      throw new ForbiddenException(
        "Cette étape doit être validée par un membre du département désigné.",
      );
    }
    if (step.approverRole && step.approverRole !== user.role) {
      throw new ForbiddenException(
        `Cette étape doit être validée par un utilisateur avec le rôle ${step.approverRole}.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // CRUD Workflows
  // ---------------------------------------------------------------------------

  /** Liste tous les workflows (avec leurs étapes). */
  async findAll() {
    return this.prisma.approvalWorkflow.findMany({
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: {
        steps: { orderBy: { order: "asc" } },
        _count: { select: { instances: true } },
      },
    });
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
      },
    });
    if (!wf) throw new NotFoundException(`Workflow ${id} introuvable`);
    return wf;
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
    const existing = await this.prisma.approvalWorkflow.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException(`Workflow ${id} introuvable`);

    if (data.isDefault) {
      await this.prisma.approvalWorkflow.updateMany({
        where: {
          documentCategory:
            data.documentCategory ?? existing.documentCategory,
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.approvalWorkflow.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        documentCategory: data.documentCategory,
        isActive: data.isActive,
        isDefault: data.isDefault,
      },
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
    },
  ) {
    const wf = await this.prisma.approvalWorkflow.findUnique({
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
      const u = await this.prisma.user.findUnique({
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
      const d = await this.prisma.department.findUnique({
        where: { id: data.approverDeptId },
        select: { id: true },
      });
      if (!d) {
        throw new BadRequestException(
          `Département approbateur ${data.approverDeptId} introuvable`,
        );
      }
    }

    return this.prisma.workflowStep.create({
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
      },
    });
  }

  async removeStep(stepId: string) {
    const step = await this.prisma.workflowStep.findUnique({
      where: { id: stepId },
    });
    if (!step) throw new NotFoundException(`Étape ${stepId} introuvable`);
    return this.prisma.workflowStep.delete({ where: { id: stepId } });
  }

  async reorderSteps(workflowId: string, orderedStepIds: string[]) {
    // Transaction : réassigne les ordres en partant de 1
    return this.prisma.$transaction(
      orderedStepIds.map((stepId, idx) =>
        this.prisma.workflowStep.update({
          where: { id: stepId },
          data: { order: idx + 1 },
        }),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Instances
  // ---------------------------------------------------------------------------

  /**
   * Démarre une instance de workflow pour un document (+ version donnée).
   *
   * Pour chaque WorkflowStep :
   *  - SINGLE        : 1 ApprovalStepInstance (assignedToId optionnel : override
   *                    explicite sinon null, résolution dynamique à `decide`).
   *  - PARALLEL_ALL  : N lignes, une par approbateur résolu, assignedToId
   *                    renseigné. Toutes doivent être APPROVED pour valider.
   *  - PARALLEL_ANY  : N lignes, une par approbateur résolu. La 1re APPROVED
   *                    valide l'étape ; les autres sont SKIPPED automatiquement.
   */
  async createInstance(
    workflowId: string,
    documentId: string,
    documentVersionId: string,
    userId: string,
    stepOverrides?: Array<{ stepId: string; approverUserId: string }>,
  ) {
    const wf = await this.prisma.approvalWorkflow.findUnique({
      where: { id: workflowId },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    if (!wf) throw new NotFoundException(`Workflow ${workflowId} introuvable`);
    if (!wf.isActive) throw new BadRequestException("Workflow inactif");
    if (wf.steps.length === 0) {
      throw new BadRequestException("Le workflow ne contient aucune étape");
    }

    // Validation préventive de chaque step (coherence des sélecteurs)
    for (const step of wf.steps) {
      this.validateApproverSelector({
        approverRole: step.approverRole,
        approverUserId: step.approverUserId,
        approverDeptId: step.approverDeptId,
      });
    }

    // Empêche les instances concurrentes sur le même document (une seule en cours)
    const existing = await this.prisma.approvalInstance.findFirst({
      where: { documentId, status: "PENDING" },
    });
    if (existing) {
      throw new BadRequestException(
        "Une instance de workflow est déjà en cours pour ce document",
      );
    }

    // Map stepId -> approverUserId override (pour pré-assigner un approbateur)
    const overrideMap = new Map<string, string>();
    for (const ov of stepOverrides ?? []) {
      if (ov?.stepId && ov?.approverUserId) {
        overrideMap.set(ov.stepId, ov.approverUserId);
      }
    }

    // Construction des step-instances à créer (avec matérialisation PARALLEL)
    const stepResultsCreate: Prisma.ApprovalStepInstanceCreateWithoutInstanceInput[] =
      [];
    for (const step of wf.steps) {
      const dueAt = step.slaHours
        ? new Date(Date.now() + step.slaHours * 3600_000)
        : null;

      const mode = (step.mode as WorkflowStepMode) ?? "SINGLE";
      const overrideUserId = overrideMap.get(step.id);

      if (mode === "PARALLEL_ALL" || mode === "PARALLEL_ANY") {
        // Résolution dynamique des approbateurs (role/user/dept)
        const approverIds = await this.resolveStepApprovers({
          approverRole: step.approverRole,
          approverUserId: step.approverUserId,
          approverDeptId: step.approverDeptId,
        });

        if (approverIds.length === 0) {
          throw new BadRequestException(
            `L'étape "${step.name}" (${mode}) n'a aucun approbateur éligible (rôle/département vide ?).`,
          );
        }

        for (const approverId of approverIds) {
          stepResultsCreate.push({
            step: { connect: { id: step.id } },
            decision: "PENDING",
            assignedTo: { connect: { id: approverId } },
            dueAt,
          });
        }
      } else {
        // SINGLE — une seule ligne. Si override fourni → assignedToId, sinon
        // null et résolution dynamique au moment de la décision.
        const resolvedAssignee =
          overrideUserId ?? (step.approverUserId ? step.approverUserId : null);
        stepResultsCreate.push({
          step: { connect: { id: step.id } },
          decision: "PENDING",
          assignedTo: resolvedAssignee
            ? { connect: { id: resolvedAssignee } }
            : undefined,
          dueAt,
        });
      }
    }

    const instance = await this.prisma.approvalInstance.create({
      data: {
        workflowId,
        documentId,
        documentVersionId,
        startedById: userId,
        currentStepOrder: 1,
        status: "PENDING",
        stepResults: {
          create: stepResultsCreate,
        },
      },
      include: { stepResults: true },
    });

    this.logger.log(
      `Instance ${instance.id} démarrée (workflow=${workflowId}, doc=${documentId}, ` +
        `${stepResultsCreate.length} step-instances créées)`,
    );
    return instance;
  }

  /**
   * Enregistre une décision sur une étape-instance puis déclenche l'évaluation.
   *
   * - Vérifie que `userId` est éligible (assignedTo OU selector du template).
   * - Trace la décision individuelle (audit log via log()).
   * - Appelle evaluateProgress qui gère l'avancement / rejet / SKIP des autres.
   */
  async decide(
    stepInstanceId: string,
    userId: string,
    decision: "APPROVED" | "REJECTED",
    comment?: string,
  ) {
    const si = await this.prisma.approvalStepInstance.findUnique({
      where: { id: stepInstanceId },
      include: {
        step: true,
        instance: true,
      },
    });
    if (!si)
      throw new NotFoundException(
        `Étape-instance ${stepInstanceId} introuvable`,
      );
    if (si.decision !== "PENDING") {
      throw new BadRequestException("Cette étape a déjà été décidée");
    }
    if (si.instance.status !== "PENDING") {
      throw new BadRequestException("L'instance n'est plus en cours");
    }

    // Vérif basique : le step doit correspondre au currentStepOrder
    if (si.step.order !== si.instance.currentStepOrder) {
      throw new ForbiddenException(
        "Ce n'est pas l'étape courante de l'instance",
      );
    }

    // Validation stricte : l'utilisateur est-il éligible à décider ?
    await this.assertUserCanDecide(userId, {
      assignedToId: si.assignedToId,
      step: {
        approverRole: si.step.approverRole,
        approverUserId: si.step.approverUserId,
        approverDeptId: si.step.approverDeptId,
      },
    });

    await this.prisma.approvalStepInstance.update({
      where: { id: stepInstanceId },
      data: {
        decidedById: userId,
        decision,
        comment,
        decidedAt: new Date(),
      },
    });

    this.logger.log(
      `Décision ${decision} enregistrée sur step-instance ${stepInstanceId} ` +
        `(instance=${si.instanceId}, step=${si.step.name}, mode=${si.step.mode}, user=${userId})`,
    );

    return this.evaluateProgress(si.instanceId);
  }

  /**
   * Calcule l'état du step courant (en fonction du `mode`) et avance si besoin.
   *
   * Logique par mode :
   *  - Tout mode : si AU MOINS UNE ligne REJECTED → instance REJECTED
   *  - SINGLE / PARALLEL_ANY : dès qu'UNE ligne APPROVED → étape validée
   *    + les autres lignes pending deviennent SKIPPED
   *  - PARALLEL_ALL : étape validée SSI toutes les lignes sont APPROVED
   *
   * Une fois l'étape validée, on passe au currentStepOrder + 1 ou on termine.
   */
  async evaluateProgress(instanceId: string) {
    const instance = await this.prisma.approvalInstance.findUnique({
      where: { id: instanceId },
      include: {
        workflow: { include: { steps: { orderBy: { order: "asc" } } } },
        stepResults: { include: { step: true } },
      },
    });
    if (!instance)
      throw new NotFoundException(`Instance ${instanceId} introuvable`);
    if (instance.status !== "PENDING") return instance;

    const currentStep = instance.workflow.steps.find(
      (s) => s.order === instance.currentStepOrder,
    );
    if (!currentStep) {
      // Plus d'étapes : on termine en APPROVED
      return this.prisma.approvalInstance.update({
        where: { id: instanceId },
        data: { status: "APPROVED", completedAt: new Date() },
      });
    }

    const currentResults = instance.stepResults.filter(
      (r) => r.stepId === currentStep.id,
    );

    // Rejet immédiat : un seul REJECTED suffit à faire tomber l'instance
    const anyRejected = currentResults.some((r) => r.decision === "REJECTED");
    if (anyRejected) {
      this.logger.warn(
        `Instance ${instanceId} REJETÉE (étape "${currentStep.name}" mode=${currentStep.mode})`,
      );
      return this.prisma.approvalInstance.update({
        where: { id: instanceId },
        data: { status: "REJECTED", completedAt: new Date() },
      });
    }

    let stepValidated = false;
    const mode = currentStep.mode as WorkflowStepMode;

    if (mode === "PARALLEL_ALL") {
      // TOUTES les lignes doivent être APPROVED (pas de PENDING restante)
      stepValidated =
        currentResults.length > 0 &&
        currentResults.every((r) => r.decision === "APPROVED");
    } else {
      // SINGLE ou PARALLEL_ANY : 1 APPROVED suffit
      stepValidated = currentResults.some((r) => r.decision === "APPROVED");
    }

    if (!stepValidated) return instance; // toujours en attente

    // Étape validée — pour PARALLEL_ANY, skip les lignes pending restantes
    // pour nettoyer la file d'attente et éviter des décisions caduques.
    if (mode === "PARALLEL_ANY") {
      const pendingSiblings = currentResults.filter(
        (r) => r.decision === "PENDING",
      );
      if (pendingSiblings.length > 0) {
        await this.prisma.approvalStepInstance.updateMany({
          where: {
            id: { in: pendingSiblings.map((r) => r.id) },
          },
          data: {
            decision: "SKIPPED",
            decidedAt: new Date(),
            comment: "Caduc (PARALLEL_ANY résolu par une autre approbation)",
          },
        });
        this.logger.log(
          `${pendingSiblings.length} step-instances SKIPPED (PARALLEL_ANY, instance=${instanceId})`,
        );
      }
    }

    // Passe au step suivant, ou termine en APPROVED
    const nextStep = instance.workflow.steps.find(
      (s) => s.order === instance.currentStepOrder + 1,
    );

    if (!nextStep) {
      this.logger.log(
        `Instance ${instanceId} APPROUVÉE (toutes étapes validées)`,
      );
      return this.prisma.approvalInstance.update({
        where: { id: instanceId },
        data: { status: "APPROVED", completedAt: new Date() },
      });
    }

    return this.prisma.approvalInstance.update({
      where: { id: instanceId },
      data: { currentStepOrder: nextStep.order },
    });
  }

  /**
   * Liste les étapes-instances en attente pour un utilisateur, en se basant sur
   * trois sources cumulatives :
   *   1. `assignedToId` == userId (pré-assignation explicite — prioritaire)
   *   2. Le step du template cible `approverUserId` == userId
   *   3. Le step cible `approverRole` == userRole OU `approverDeptId` == deptId
   *      ET la step-instance n'a PAS d'assignedToId (sinon on exclurait les
   *      autres approbateurs parallèles).
   */
  async getPendingForUser(
    userId: string,
    userRole: string,
    deptId?: string | null,
  ) {
    return this.prisma.approvalStepInstance.findMany({
      where: {
        decision: "PENDING",
        instance: { status: "PENDING" },
        OR: [
          { assignedToId: userId },
          {
            assignedToId: null,
            step: {
              OR: [
                { approverUserId: userId },
                { approverRole: userRole as UserRole },
                ...(deptId ? [{ approverDeptId: deptId }] : []),
              ],
            },
          },
        ],
      },
      include: {
        step: true,
        instance: {
          include: {
            workflow: { select: { id: true, name: true } },
          },
        },
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { dueAt: "asc" },
    });
  }

  /**
   * Retourne l'instance de workflow active (status PENDING) pour un document.
   * Inclut les étapes du workflow template et les résultats d'étape pour
   * permettre au front d'afficher une timeline complète.
   */
  async getActiveInstanceForDocument(documentId: string) {
    const instance = await this.prisma.approvalInstance.findFirst({
      where: { documentId, status: "PENDING" },
      orderBy: { startedAt: "desc" },
      include: {
        workflow: {
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
              },
            },
          },
        },
        stepResults: {
          include: {
            step: true,
            decidedBy: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            assignedTo: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        startedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    return instance;
  }

  /** Annule une instance (ex : doc retiré). */
  async cancelInstance(instanceId: string) {
    return this.prisma.approvalInstance.update({
      where: { id: instanceId },
      data: { status: "CANCELLED", completedAt: new Date() },
    });
  }
}
