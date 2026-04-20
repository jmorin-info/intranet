import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * WorkflowsService — Workflows d'approbation configurables (ISO 27001 A.5.1).
 *
 * Ce service fournit :
 *  - le CRUD des templates de workflow et de leurs étapes ;
 *  - la création d'une instance (démarrage d'un workflow sur un document) ;
 *  - l'enregistrement d'une décision sur une étape ;
 *  - l'évaluation automatique de la progression (avance au step suivant ou termine) ;
 *  - la récupération des approbations en attente pour un utilisateur.
 *
 * NOTE: ce service est pour l'instant autonome — il n'est pas encore branché
 * sur le modèle Document existant (qui conserve son flow DRAFT → APPROVED figé).
 */
@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // CRUD Workflows
  // ---------------------------------------------------------------------------

  /** Liste tous les workflows (avec leurs étapes). */
  async findAll() {
    return this.prisma.approvalWorkflow.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: {
        steps: { orderBy: { order: 'asc' } },
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
          orderBy: { order: 'asc' },
          include: {
            approverUser: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            approverDept: true,
            escalateTo: {
              select: { id: true, firstName: true, lastName: true, email: true },
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
      documentCategory?: string | null;
      isDefault?: boolean;
    },
    userId: string,
  ) {
    // Un seul default par catégorie : on reset les autres si isDefault=true
    if (data.isDefault) {
      await this.prisma.approvalWorkflow.updateMany({
        where: { documentCategory: (data.documentCategory as any) ?? null, isDefault: true },
        data: { isDefault: false },
      });
    }
    return this.prisma.approvalWorkflow.create({
      data: {
        name: data.name,
        description: data.description,
        documentCategory: (data.documentCategory as any) ?? null,
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
      documentCategory?: string | null;
      isActive?: boolean;
      isDefault?: boolean;
    },
  ) {
    const existing = await this.prisma.approvalWorkflow.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Workflow ${id} introuvable`);

    if (data.isDefault) {
      await this.prisma.approvalWorkflow.updateMany({
        where: {
          documentCategory:
            (data.documentCategory as any) ?? existing.documentCategory,
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
        documentCategory: data.documentCategory as any,
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
      mode: 'SINGLE' | 'PARALLEL_ALL' | 'PARALLEL_ANY';
      approverRole: 'REVIEWER' | 'ADMIN' | 'SUPER_ADMIN';
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
        name: 'Validation simple',
        description: 'Relecture unique par un relecteur — idéal pour les notes de service et communications internes.',
        documentCategory: null,
        isDefault: false,
        steps: [
          { name: 'Relecture', mode: 'SINGLE', approverRole: 'REVIEWER', slaHours: 48 },
        ],
      },
      {
        name: 'Validation hiérarchique',
        description: 'Relecture puis validation admin. Workflow standard pour la majorité des documents.',
        documentCategory: null,
        isDefault: true,
        steps: [
          { name: 'Relecture métier', mode: 'SINGLE', approverRole: 'REVIEWER', slaHours: 48 },
          { name: 'Validation admin', mode: 'SINGLE', approverRole: 'ADMIN', slaHours: 72 },
        ],
      },
      {
        name: 'Validation sécurité RSSI',
        description: 'Parcours spécifique pour les politiques de sécurité — ISO 27001. Relecture puis double validation ADMIN + RSSI.',
        documentCategory: 'POLICY',
        isDefault: true,
        steps: [
          { name: 'Relecture technique', mode: 'SINGLE', approverRole: 'REVIEWER', slaHours: 72 },
          { name: 'Validation ADMIN + RSSI', mode: 'PARALLEL_ALL', approverRole: 'ADMIN', slaHours: 120 },
          { name: 'Approbation finale', mode: 'SINGLE', approverRole: 'SUPER_ADMIN', slaHours: 168 },
        ],
      },
      {
        name: 'Procédure ISO 27001',
        description: 'Workflow conforme pour les procédures opérationnelles : relecture, validation RSSI, approbation direction.',
        documentCategory: 'PROCEDURE',
        isDefault: true,
        steps: [
          { name: 'Revue qualité', mode: 'SINGLE', approverRole: 'REVIEWER', slaHours: 72 },
          { name: 'Validation RSSI', mode: 'SINGLE', approverRole: 'ADMIN', slaHours: 120 },
          { name: 'Approbation direction', mode: 'SINGLE', approverRole: 'SUPER_ADMIN', slaHours: 168 },
        ],
      },
      {
        name: 'Validation contrat',
        description: 'Contrats fournisseurs / prestataires — double validation ADMIN (juridique + achats), approbation SUPER_ADMIN finale.',
        documentCategory: 'CONTRACT',
        isDefault: true,
        steps: [
          { name: 'Revue juridique & achats', mode: 'PARALLEL_ALL', approverRole: 'ADMIN', slaHours: 120 },
          { name: 'Signature direction', mode: 'SINGLE', approverRole: 'SUPER_ADMIN', slaHours: 168 },
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
      mode?: 'SINGLE' | 'PARALLEL_ALL' | 'PARALLEL_ANY';
      approverRole?: string | null;
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
      include: { steps: { orderBy: { order: 'desc' }, take: 1 } },
    });
    if (!wf) throw new NotFoundException(`Workflow ${workflowId} introuvable`);

    const nextOrder = data.order ?? (wf.steps[0]?.order ?? 0) + 1;

    // Sanity: au moins un type d'approbateur défini
    if (!data.approverRole && !data.approverUserId && !data.approverDeptId) {
      throw new BadRequestException(
        "Une étape doit définir au moins un approbateur (rôle, utilisateur ou département)",
      );
    }

    return this.prisma.workflowStep.create({
      data: {
        workflowId,
        order: nextOrder,
        name: data.name,
        mode: (data.mode as any) ?? 'SINGLE',
        approverRole: data.approverRole as any,
        approverUserId: data.approverUserId,
        approverDeptId: data.approverDeptId,
        slaHours: data.slaHours ?? null,
        escalateToUserId: data.escalateToUserId ?? null,
        autoApproveOnTimeout: data.autoApproveOnTimeout ?? false,
      },
    });
  }

  async removeStep(stepId: string) {
    const step = await this.prisma.workflowStep.findUnique({ where: { id: stepId } });
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
   * Crée un ApprovalStepInstance pour chaque WorkflowStep en status PENDING.
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
      include: { steps: { orderBy: { order: 'asc' } } },
    });
    if (!wf) throw new NotFoundException(`Workflow ${workflowId} introuvable`);
    if (!wf.isActive) throw new BadRequestException('Workflow inactif');
    if (wf.steps.length === 0) {
      throw new BadRequestException("Le workflow ne contient aucune étape");
    }

    // Empêche les instances concurrentes sur le même document (une seule en cours)
    const existing = await this.prisma.approvalInstance.findFirst({
      where: { documentId, status: 'PENDING' },
    });
    if (existing) {
      throw new BadRequestException(
        'Une instance de workflow est déjà en cours pour ce document',
      );
    }

    // Map stepId -> approverUserId override (pour pré-assigner un approbateur)
    const overrideMap = new Map<string, string>();
    for (const ov of stepOverrides ?? []) {
      if (ov?.stepId && ov?.approverUserId) {
        overrideMap.set(ov.stepId, ov.approverUserId);
      }
    }

    // NOTE: on ne modifie pas le WorkflowStep template ; l'override est appliqué
    // uniquement via le champ `assignedToId` de l'ApprovalStepInstance si le
    // modèle l'expose. Sinon on s'appuie sur le `decidedById` au moment de la
    // décision. Pour que getPendingForUser fonctionne malgré tout, on duplique
    // l'info dans le commentaire initial (hack scaffold) — TODO proprement.
    const instance = await this.prisma.approvalInstance.create({
      data: {
        workflowId,
        documentId,
        documentVersionId,
        startedById: userId,
        currentStepOrder: 1,
        status: 'PENDING',
        stepResults: {
          create: wf.steps.map((s) => {
            const overrideUserId = overrideMap.get(s.id);
            return {
              stepId: s.id,
              decision: 'PENDING' as const,
              // Si override : on stocke l'info dans le commentaire pour rappel,
              // et on force le decidedById à null jusqu'à la décision effective.
              comment: overrideUserId
                ? `__override_approver__:${overrideUserId}`
                : null,
              dueAt: s.slaHours
                ? new Date(Date.now() + s.slaHours * 3600_000)
                : null,
            };
          }),
        },
      },
      include: { stepResults: true },
    });

    // TODO: PARALLEL_ALL / PARALLEL_ANY — créer N step-instances (une par
    // approbateur) au lieu d'une seule. Actuellement tous les modes utilisent
    // la même ligne, ce qui revient à un comportement SINGLE.

    this.logger.log(
      `Instance ${instance.id} démarrée (workflow=${workflowId}, doc=${documentId})`,
    );
    return instance;
  }

  /**
   * Enregistre une décision sur une étape-instance puis déclenche l'évaluation.
   */
  async decide(
    stepInstanceId: string,
    userId: string,
    decision: 'APPROVED' | 'REJECTED',
    comment?: string,
  ) {
    const si = await this.prisma.approvalStepInstance.findUnique({
      where: { id: stepInstanceId },
      include: {
        step: true,
        instance: true,
      },
    });
    if (!si) throw new NotFoundException(`Étape-instance ${stepInstanceId} introuvable`);
    if (si.decision !== 'PENDING') {
      throw new BadRequestException('Cette étape a déjà été décidée');
    }
    if (si.instance.status !== 'PENDING') {
      throw new BadRequestException("L'instance n'est plus en cours");
    }

    // Vérif très basique : le step doit correspondre au currentStepOrder
    if (si.step.order !== si.instance.currentStepOrder) {
      throw new ForbiddenException("Ce n'est pas l'étape courante de l'instance");
    }

    // TODO: vérifier que userId matche approverRole / approverUserId / approverDeptId
    // (pour l'instant on fait confiance au frontend + RolesGuard)

    await this.prisma.approvalStepInstance.update({
      where: { id: stepInstanceId },
      data: {
        decidedById: userId,
        decision,
        comment,
        decidedAt: new Date(),
      },
    });

    return this.evaluateProgress(si.instanceId);
  }

  /**
   * Calcule l'état du step courant (en fonction du `mode`) et avance si besoin.
   */
  async evaluateProgress(instanceId: string) {
    const instance = await this.prisma.approvalInstance.findUnique({
      where: { id: instanceId },
      include: {
        workflow: { include: { steps: { orderBy: { order: 'asc' } } } },
        stepResults: { include: { step: true } },
      },
    });
    if (!instance) throw new NotFoundException(`Instance ${instanceId} introuvable`);
    if (instance.status !== 'PENDING') return instance;

    const currentStep = instance.workflow.steps.find(
      (s) => s.order === instance.currentStepOrder,
    );
    if (!currentStep) {
      // Plus d'étapes : on termine en APPROVED
      return this.prisma.approvalInstance.update({
        where: { id: instanceId },
        data: { status: 'APPROVED', completedAt: new Date() },
      });
    }

    const currentResults = instance.stepResults.filter(
      (r) => r.stepId === currentStep.id,
    );

    // Si une seule ligne step-result est créée par step, le mode PARALLEL_* a
    // aujourd'hui la même sémantique (scaffold). On documente l'intention :
    // SINGLE         → on attend 1 décision
    // PARALLEL_ALL   → on attend que TOUTES les lignes soient décidées APPROVED
    // PARALLEL_ANY   → dès qu'UNE ligne est APPROVED, on passe
    const anyRejected = currentResults.some((r) => r.decision === 'REJECTED');
    if (anyRejected) {
      return this.prisma.approvalInstance.update({
        where: { id: instanceId },
        data: { status: 'REJECTED', completedAt: new Date() },
      });
    }

    let stepValidated = false;
    if (currentStep.mode === 'PARALLEL_ANY') {
      stepValidated = currentResults.some((r) => r.decision === 'APPROVED');
    } else if (currentStep.mode === 'PARALLEL_ALL') {
      stepValidated =
        currentResults.length > 0 &&
        currentResults.every((r) => r.decision === 'APPROVED');
    } else {
      // SINGLE
      stepValidated = currentResults.some((r) => r.decision === 'APPROVED');
    }

    if (!stepValidated) return instance; // toujours en attente

    // Passe au step suivant, ou termine en APPROVED
    const nextStep = instance.workflow.steps.find(
      (s) => s.order === instance.currentStepOrder + 1,
    );

    if (!nextStep) {
      return this.prisma.approvalInstance.update({
        where: { id: instanceId },
        data: { status: 'APPROVED', completedAt: new Date() },
      });
    }

    return this.prisma.approvalInstance.update({
      where: { id: instanceId },
      data: { currentStepOrder: nextStep.order },
    });
  }

  /**
   * Liste les étapes-instances en attente pour un utilisateur, en se basant
   * sur l'approverUserId explicite OU sur le rôle/département.
   */
  async getPendingForUser(userId: string, userRole: string, deptId?: string | null) {
    return this.prisma.approvalStepInstance.findMany({
      where: {
        decision: 'PENDING',
        instance: { status: 'PENDING' },
        OR: [
          { step: { approverUserId: userId } },
          { step: { approverRole: userRole as any } },
          ...(deptId ? [{ step: { approverDeptId: deptId } }] : []),
        ],
      },
      include: {
        step: true,
        instance: {
          include: {
            workflow: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { dueAt: 'asc' },
    });
  }

  /**
   * Retourne l'instance de workflow active (status PENDING) pour un document.
   * Inclut les étapes du workflow template et les résultats d'étape pour
   * permettre au front d'afficher une timeline complète.
   */
  async getActiveInstanceForDocument(documentId: string) {
    const instance = await this.prisma.approvalInstance.findFirst({
      where: { documentId, status: 'PENDING' },
      orderBy: { startedAt: 'desc' },
      include: {
        workflow: {
          include: {
            steps: {
              orderBy: { order: 'asc' },
              include: {
                approverUser: {
                  select: { id: true, firstName: true, lastName: true, email: true },
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
              select: { id: true, firstName: true, lastName: true, email: true },
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
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
  }
}
