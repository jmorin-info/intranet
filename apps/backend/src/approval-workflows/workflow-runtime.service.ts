import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Document, WorkflowStep } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../common/interfaces';
import { WorkflowEngineService } from './workflow-engine.service';
import { workflowTransaction } from './workflow-transaction';

const stateInclude = {
  workflow: { include: { steps: { orderBy: { order: 'asc' as const }, include: {
    approverUser: { select: { id: true, firstName: true, lastName: true, email: true } },
    approverDept: { select: { id: true, name: true, code: true } },
  } } } },
  stepResults: { orderBy: { id: 'asc' as const }, include: { step: true,
    decidedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
  } },
  startedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.ApprovalInstanceInclude;
type State = Prisma.ApprovalInstanceGetPayload<{ include: typeof stateInclude }>;
type Db = Prisma.TransactionClient;
const privileged = new Set(['ADMIN', 'SUPER_ADMIN']);
const technical = new Set(['START', 'BRANCH', 'END']);
const closedDocumentStatuses: Document['status'][] = ['APPROVED', 'ARCHIVED', 'OBSOLETE'];

@Injectable()
export class WorkflowRuntimeService {
  constructor(private readonly prisma: PrismaService, private readonly engine: WorkflowEngineService) {}

  async transact<T>(operation: (db: Db) => Promise<T>): Promise<T> {
    return workflowTransaction(this.prisma, operation);
  }

  private async actor(db: Db, id: string) {
    const user = await db.user.findUnique({ where: { id }, select: { id: true, role: true, departmentId: true, isActive: true, deletedAt: true } });
    if (!user || !user.isActive || user.deletedAt) throw new ForbiddenException('Utilisateur indisponible ou désactivé.');
    return user;
  }

  private async snapshot(db: Db, documentId: string, versionId?: string) {
    const document = await db.document.findUnique({ where: { id: documentId } });
    if (!document || document.deletedAt) throw new NotFoundException('Document introuvable.');
    if (versionId && closedDocumentStatuses.includes(document.status)) throw new ConflictException('Ce document est publié, archivé ou obsolète. Créez une version en brouillon avant de poursuivre un circuit.');
    if (versionId && document.currentVersionId !== versionId) throw new ConflictException('Le document a changé de version. Rechargez son circuit.');
    if (versionId && document.scanStatus !== 'CLEAN') throw new ConflictException('L’analyse de sécurité du document doit être terminée avant sa validation.');
    return document;
  }

  private matches(user: { id: string; role: string; departmentId: string | null }, step: WorkflowStep): boolean {
    if (step.approverUserId) return step.approverUserId === user.id;
    if (step.approverDeptId) return step.approverDeptId === user.departmentId;
    return Boolean(step.approverRole && step.approverRole === user.role);
  }

  async approvers(db: Db, step: Pick<WorkflowStep, 'name' | 'approverUserId' | 'approverDeptId' | 'approverRole'>, ownerId: string): Promise<string[]> {
    const selector = step.approverUserId ? { id: step.approverUserId }
      : step.approverDeptId ? { departmentId: step.approverDeptId }
        : step.approverRole ? { role: step.approverRole } : null;
    if (!selector) throw new BadRequestException(`L'étape « ${step.name} » n'a pas d'approbateur.`);
    const users = await db.user.findMany({ where: { ...selector, isActive: true, deletedAt: null, NOT: { id: ownerId }, AND: { role: { notIn: ['AUDITEUR', 'PRESTATAIRE'] } } }, select: { id: true }, take: 501 });
    if (!users.length) throw new BadRequestException(`Aucun approbateur actif distinct de l'auteur pour « ${step.name} ».`);
    if (users.length > 500) throw new BadRequestException('Ce groupe dépasse 500 approbateurs. Choisissez un groupe plus précis.');
    return users.map(user => user.id);
  }

  private audit(db: Db, action: string, instanceId: string, actorId: string | null, metadata: Prisma.InputJsonObject = {}, stepInstanceId?: string) {
    return db.approvalAuditLog.create({ data: { action, approvalInstanceId: instanceId, actorId, stepInstanceId, metadata } });
  }

  start(workflowId: string, documentId: string, versionId: string, actorId: string, overrides?: Array<{ stepId: string; approverUserId: string }>) {
    return this.transact(db => this.startInTransaction(db, workflowId, documentId, versionId, actorId, overrides));
  }

  async startInTransaction(db: Db, workflowId: string, documentId: string, versionId: string, actorId: string,
    overrides: Array<{ stepId: string; approverUserId: string }> = [], allowInactive = false,
    initialAssignments: Record<string, { userIds: string[]; level: number; parallelGroupId: string | null }> = {}) {
    const [workflow, actor, document] = await Promise.all([
      db.approvalWorkflow.findUnique({ where: { id: workflowId }, include: { steps: { orderBy: { order: 'asc' } } } }),
      this.actor(db, actorId), this.snapshot(db, documentId, versionId),
    ]);
    if (!workflow) throw new NotFoundException('Circuit introuvable.');
    if (!workflow.isActive && !allowInactive) throw new BadRequestException('Ce circuit est désactivé.');
    if (!workflow.steps.length || workflow.steps.length > 200) throw new BadRequestException('Un circuit doit comporter entre 1 et 200 étapes.');
    if (document.ownerId !== actorId && !privileged.has(actor.role)) throw new ForbiddenException("Seul l'auteur ou un administrateur peut démarrer ce circuit.");
    if (workflow.documentCategory && workflow.documentCategory !== document.category) throw new BadRequestException('Ce circuit ne correspond pas à la catégorie du document.');
    const version = await db.documentVersion.findUnique({ where: { id: versionId }, select: { documentId: true } });
    if (!version || version.documentId !== documentId) throw new BadRequestException('Cette version ne correspond pas au document.');
    if (await db.approvalInstance.findFirst({ where: { documentId, status: 'PENDING' }, select: { id: true } })) throw new ConflictException('Un circuit est déjà en cours pour ce document.');

    const overrideMap = new Map<string, string>();
    for (const override of overrides) {
      if (!workflow.steps.some(step => step.id === override.stepId) || overrideMap.has(override.stepId)) throw new BadRequestException('Une étape remplacée est inconnue ou dupliquée.');
      overrideMap.set(override.stepId, override.approverUserId);
    }
    const now = new Date();
    const rows: Prisma.ApprovalStepInstanceCreateWithoutInstanceInput[] = [];
    for (const step of workflow.steps) {
      if (technical.has(step.type)) {
        rows.push({ step: { connect: { id: step.id } }, decision: 'SKIPPED', comment: 'Étape de routage automatique.', decidedAt: now });
        continue;
      }
      const compiled = initialAssignments[step.id];
      if (!compiled && [step.approverUserId, step.approverRole, step.approverDeptId].filter(Boolean).length !== 1) throw new BadRequestException(`Définissez un seul type d'approbateur pour « ${step.name} ».`);
      const eligible = compiled?.userIds ?? await this.approvers(db, step, document.ownerId);
      const override = overrideMap.get(step.id);
      if (override && !eligible.includes(override)) throw new BadRequestException(`Le remplaçant choisi n'est pas habilité pour « ${step.name} ».`);
      if (step.mode !== 'SINGLE' && step.minApprovers > eligible.length) throw new BadRequestException(`Le quorum de « ${step.name} » dépasse le nombre d'approbateurs.`);
      const assigned = compiled ? eligible : step.mode === 'SINGLE' ? [override ?? step.approverUserId ?? null] : eligible;
      for (const userId of assigned) rows.push({ step: { connect: { id: step.id } }, decision: 'PENDING',
        level: compiled?.level ?? 1, parallelGroupId: compiled?.parallelGroupId ?? null,
        assignedTo: userId ? { connect: { id: userId } } : undefined });
    }
    const first = workflow.steps.find(step => step.type === 'START') ?? workflow.steps[0]!;
    const instance = await db.approvalInstance.create({ data: {
      workflowId, documentId, documentVersionId: versionId, startedById: actorId,
      currentStepOrder: first.order, status: 'PENDING', stepResults: { create: rows },
    } });
    await this.audit(db, 'APPROVAL_STARTED', instance.id, actorId, { documentId, documentVersionId: versionId });
    await this.activate(db, instance.id, first, now);
    return this.progress(db, instance.id, actorId);
  }

  private async activate(db: Db, instanceId: string, step: WorkflowStep, now = new Date()) {
    await db.approvalInstance.update({ where: { id: instanceId }, data: { currentStepOrder: step.order } });
    if (technical.has(step.type)) return;
    const due = step.slaHours ? new Date(now.getTime() + step.slaHours * 3_600_000) : null;
    await db.approvalStepInstance.updateMany({ where: { instanceId, stepId: step.id, decision: 'PENDING' }, data: { dueAt: due, deadlineAt: due } });
    await this.applyDelegations(db, instanceId, step, now);
    await this.audit(db, 'APPROVAL_STEP_ACTIVATED', instanceId, null, { stepId: step.id, order: step.order, dueAt: due?.toISOString() ?? null });
    const state = await this.readState(db, instanceId);
    const document = await this.snapshot(db, state.documentId, state.documentVersionId);
    const recipients = await this.recipients(db, state.stepResults.filter(row => row.stepId === step.id && row.decision === 'PENDING'), step, document.ownerId);
    if (recipients.length) await db.notification.createMany({ data: recipients.map(userId => ({
      userId, type: 'DOC_APPROVAL_NEEDED' as const, title: `À valider : ${document.reference}`,
      body: `Le document « ${document.title} » attend votre décision à l’étape « ${step.name} ».`,
      resourceType: 'Document', resourceId: document.id,
    })) });
  }

  private async applyDelegations(db: Db, instanceId: string, step: WorkflowStep, now: Date) {
    const state = await this.readState(db, instanceId);
    const document = await this.snapshot(db, state.documentId, state.documentVersionId);
    const rows = state.stepResults.filter(row => row.stepId === step.id && row.decision === 'PENDING');
    const occupied = new Set(rows.map(row => row.assignedToId).filter((id): id is string => Boolean(id)));
    for (const row of rows) {
      if (!row.assignedToId) continue;
      const delegations = await db.approvalDelegation.findMany({ where: { fromUserId: row.assignedToId, auto: false, isActive: true, revokedAt: null, startDate: { lte: now }, endDate: { gt: now }, toUser: { isActive: true, deletedAt: null, role: { notIn: ['AUDITEUR', 'PRESTATAIRE'] } } }, orderBy: { createdAt: 'desc' } });
      const delegation = delegations.find(item => item.scope === 'SCOPED' && item.categories.includes(document.category)) ?? delegations.find(item => item.scope === 'GLOBAL');
      if (!delegation || delegation.toUserId === document.ownerId || occupied.has(delegation.toUserId)) continue;
      await db.approvalStepInstance.updateMany({ where: { id: row.id, decision: 'PENDING', assignedToId: row.assignedToId }, data: { assignedToId: delegation.toUserId } });
      occupied.delete(row.assignedToId);
      occupied.add(delegation.toUserId);
      await this.audit(db, 'APPROVAL_DELEGATION_APPLIED', instanceId, null, { delegationId: delegation.id, fromUserId: row.assignedToId, toUserId: delegation.toUserId }, row.id);
    }
  }

  private async recipients(db: Db, rows: Array<{ assignedToId: string | null }>, step: WorkflowStep, ownerId: string) {
    const assigned = rows.map(row => row.assignedToId).filter((id): id is string => Boolean(id));
    const ids = assigned.length ? (await db.user.findMany({ where: { id: { in: assigned }, isActive: true, deletedAt: null, NOT: { id: ownerId } }, select: { id: true } })).map(user => user.id)
      : await this.approvers(db, step, ownerId);
    return [...new Set(ids)];
  }

  decide(stepInstanceId: string, userId: string, decision: 'APPROVED' | 'REJECTED', comment?: string) {
    if (!['APPROVED', 'REJECTED'].includes(decision)) throw new BadRequestException('Décision invalide.');
    const reason = comment?.trim();
    if (decision === 'REJECTED' && !reason) throw new BadRequestException('Précisez les corrections attendues avant de refuser.');
    return this.transact(async db => {
      const row = await db.approvalStepInstance.findUnique({ where: { id: stepInstanceId }, include: { instance: true, step: true } });
      if (!row) throw new NotFoundException('Étape introuvable.');
      const [user, document] = await Promise.all([this.actor(db, userId), this.snapshot(db, row.instance.documentId, row.instance.documentVersionId)]);
      if (userId === document.ownerId) throw new ForbiddenException("L'auteur ne peut pas approuver son propre document.");
      if (row.assignedToId ? row.assignedToId !== userId : !this.matches(user, row.step)) throw new ForbiddenException('Cette validation est réservée à un autre approbateur.');
      if (row.decision !== 'PENDING') {
        if (row.decision === decision && row.decidedById === userId) return this.readState(db, row.instanceId);
        throw new ConflictException('Cette étape a déjà reçu une décision. Rechargez le circuit.');
      }
      if (row.instance.status !== 'PENDING' || row.step.order !== row.instance.currentStepOrder) throw new ConflictException("Cette étape n'est plus l'étape active.");
      if (technical.has(row.step.type)) throw new BadRequestException('Une étape technique ne reçoit pas de décision humaine.');
      const result = await db.approvalStepInstance.updateMany({
        where: { id: row.id, decision: 'PENDING', instance: { status: 'PENDING', currentStepOrder: row.step.order } },
        data: { decision, decidedById: userId, comment: reason ?? null, decidedAt: new Date() },
      });
      if (result.count !== 1) throw new ConflictException('Une autre décision a déjà modifié cette étape.');
      await this.audit(db, `APPROVAL_STEP_${decision}`, row.instanceId, userId, { comment: reason ?? null, stepId: row.stepId }, row.id);
      return this.progress(db, row.instanceId, userId);
    });
  }

  evaluate(instanceId: string) { return this.transact(db => this.progress(db, instanceId, null)); }

  private async readState(db: Db, instanceId: string): Promise<State> {
    const state = await db.approvalInstance.findUnique({ where: { id: instanceId }, include: stateInclude });
    if (!state) throw new NotFoundException('Circuit introuvable.');
    return state;
  }

  private next(state: State, step: WorkflowStep, document: Document): WorkflowStep | undefined {
    const graph = state.workflow.steps.some(item => item.type === 'START');
    if (!graph) return state.workflow.steps.find(item => item.order > step.order);
    if (step.type === 'END') return undefined;
    const [id] = this.engine.computeNextSteps(step, state.workflow.steps, { category: document.category, classification: document.classification, priority: document.priority });
    return state.workflow.steps.find(target => target.id === id);
  }

  private async progress(db: Db, instanceId: string, actorId: string | null): Promise<State> {
    for (let transitions = 0; transitions <= 200; transitions++) {
      const state = await this.readState(db, instanceId);
      if (state.status !== 'PENDING') return state;
      const document = await this.snapshot(db, state.documentId, state.documentVersionId);
      const step = state.workflow.steps.find(item => item.order === state.currentStepOrder);
      if (!step) throw new ConflictException('La définition de l’étape active a disparu.');
      const rows = state.stepResults.filter(row => row.stepId === step.id);
      if (!rows.length) throw new ConflictException('Cette étape ne comporte aucune validation.');
      let done = technical.has(step.type);
      if (!done) {
        if (rows.some(row => row.decision === 'REJECTED')) return this.finish(db, state, 'REJECTED', actorId);
        const approved = rows.filter(row => row.decision === 'APPROVED').length;
        const quorum = Math.max(1, step.minApprovers);
        done = step.mode === 'PARALLEL_ALL'
          ? (quorum > 1 && quorum < rows.length ? approved >= quorum : rows.every(row => row.decision === 'APPROVED'))
          : approved >= (step.mode === 'PARALLEL_ANY' ? quorum : 1);
      }
      if (!done) return state;
      await db.approvalStepInstance.updateMany({ where: { instanceId, stepId: step.id, decision: 'PENDING' }, data: { decision: 'SKIPPED', decidedAt: new Date(), comment: 'Quorum atteint ou étape de routage.' } });
      const next = this.next(state, step, document);
      if (!next) return this.finish(db, state, 'APPROVED', actorId);
      await this.activate(db, instanceId, next);
    }
    throw new BadRequestException('Le circuit contient une boucle ou trop de transitions.');
  }

  private async finish(db: Db, state: State, status: 'APPROVED' | 'REJECTED' | 'CANCELLED', actorId: string | null): Promise<State> {
    await db.approvalInstance.update({ where: { id: state.id }, data: { status, completedAt: new Date() } });
    await db.approvalStepInstance.updateMany({ where: { instanceId: state.id, decision: 'PENDING' }, data: { decision: 'SKIPPED', decidedAt: new Date(), comment: `Circuit terminé : ${status}.` } });
    await this.audit(db, `APPROVAL_${status}`, state.id, actorId, { documentId: state.documentId, documentVersionId: state.documentVersionId });
    if (status === 'REJECTED') {
      const document = await this.snapshot(db, state.documentId, state.documentVersionId);
      await db.document.updateMany({ where: { id: document.id, currentVersionId: state.documentVersionId, status: { in: ['IN_REVIEW', 'REVIEW_APPROVED', 'PENDING_APPROVAL'] } }, data: { status: 'DRAFT' } });
      await db.validationRequest.updateMany({ where: { documentId: document.id, documentVersionId: state.documentVersionId, status: 'PENDING' }, data: { status: 'REJECTED' } });
      const reason = state.stepResults.find(row => row.decision === 'REJECTED')?.comment;
      await db.notification.createMany({ data: [{ userId: document.ownerId, type: 'DOC_REJECTED', title: `Corrections demandées : ${document.reference}`, body: `Le document « ${document.title} » est revenu en brouillon.${reason ? ` ${reason}` : ''}`, resourceType: 'Document', resourceId: document.id }] });
    }
    // Le circuit dynamique ne publie jamais : la validation qualité finale reste distincte.
    return this.readState(db, state.id);
  }

  cancel(instanceId: string, actorId: string) {
    return this.transact(async db => {
      const [state, actor] = await Promise.all([this.readState(db, instanceId), this.actor(db, actorId)]);
      if (!privileged.has(actor.role)) throw new ForbiddenException('Annulation réservée aux administrateurs.');
      if (state.status === 'CANCELLED') return state;
      if (state.status !== 'PENDING') throw new ConflictException('Ce circuit est déjà terminé.');
      return this.finish(db, state, 'CANCELLED', actorId);
    });
  }

  async pending(userId: string) {
    const user = await this.actor(this.prisma, userId);
    const candidates = await this.prisma.approvalStepInstance.findMany({
      where: { decision: 'PENDING', instance: { status: 'PENDING' }, OR: [
        { assignedToId: userId }, { assignedToId: null, step: { OR: [{ approverUserId: userId }, { approverRole: user.role }, ...(user.departmentId ? [{ approverDeptId: user.departmentId }] : [])] } },
      ] },
      include: { step: true, instance: { include: { workflow: { select: { id: true, name: true } } } }, assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { dueAt: { sort: 'asc', nulls: 'last' } }, take: 1000,
    });
    const current = candidates.filter(row => row.step.order === row.instance.currentStepOrder && !technical.has(row.step.type) && (row.assignedToId === userId || (!row.assignedToId && this.matches(user, row.step))));
    if (!current.length) return [];
    const documents = await this.prisma.document.findMany({ where: { id: { in: [...new Set(current.map(row => row.instance.documentId))] }, deletedAt: null, status: { notIn: closedDocumentStatuses } }, select: { id: true, title: true, reference: true, status: true, ownerId: true, currentVersionId: true } });
    const byId = new Map(documents.map(document => [document.id, document]));
    const now = Date.now();
    return current.flatMap(row => {
      const document = byId.get(row.instance.documentId);
      if (!document || closedDocumentStatuses.includes(document.status) || document.currentVersionId !== row.instance.documentVersionId || document.ownerId === userId) return [];
      return [{ ...row, instance: { ...row.instance, document }, isOverdue: Boolean(row.dueAt && row.dueAt.getTime() < now) }];
    });
  }

  private async canRead(db: Db, state: State, actor: RequestUser) {
    const document = await this.snapshot(db, state.documentId);
    const user = await this.actor(db, actor.id);
    if (privileged.has(user.role) || [document.ownerId, document.verifierId, document.reviewerId, document.approverId, state.startedById].includes(user.id)) return;
    const row = state.stepResults.find(item => item.step.order === state.currentStepOrder && (item.assignedToId ? item.assignedToId === user.id : this.matches(user, item.step)));
    if (!row) throw new ForbiddenException('Ce circuit ne vous est pas accessible.');
  }

  async active(documentId: string, actor: RequestUser) {
    const state = await this.prisma.approvalInstance.findFirst({ where: { documentId, status: 'PENDING' }, orderBy: { startedAt: 'desc' }, include: stateInclude });
    if (!state) {
      const document = await this.snapshot(this.prisma, documentId);
      const user = await this.actor(this.prisma, actor.id);
      if (!privileged.has(user.role) && ![document.ownerId, document.verifierId, document.reviewerId, document.approverId].includes(user.id)) throw new ForbiddenException('Ce document ne vous est pas accessible.');
      return null;
    }
    await this.canRead(this.prisma, state, actor);
    return state;
  }

  async history(documentId: string, actor: RequestUser) {
    const instances = await this.prisma.approvalInstance.findMany({ where: { documentId }, orderBy: { startedAt: 'desc' }, take: 20, include: stateInclude });
    if (!instances[0]) return { instances: [], events: [] };
    await this.canRead(this.prisma, instances[0], actor);
    const events = await this.prisma.approvalAuditLog.findMany({ where: { approvalInstanceId: { in: instances.map(instance => instance.id) } }, orderBy: { createdAt: 'asc' }, take: 500 });
    return { instances, events };
  }

  remind(instanceId: string, actorId: string | null, automatic = false, now = new Date()) {
    return this.transact(async db => {
      const state = await this.readState(db, instanceId);
      const document = await this.snapshot(db, state.documentId, state.documentVersionId);
      if (actorId) {
        const actor = await this.actor(db, actorId);
        if (actorId !== state.startedById && !privileged.has(actor.role)) throw new ForbiddenException('Seul le demandeur ou un administrateur peut relancer ce circuit.');
      } else if (!automatic) throw new ForbiddenException('Auteur de relance requis.');
      if (state.status !== 'PENDING') throw new ConflictException('Ce circuit est terminé.');
      const step = state.workflow.steps.find(item => item.order === state.currentStepOrder);
      const rows = state.stepResults.filter(row => row.stepId === step?.id && row.decision === 'PENDING');
      if (!step || technical.has(step.type) || !rows[0]) return { sent: 0, alreadySent: false, recipientCount: 0 };
      const active = await db.approvalAuditLog.findFirst({ where: { approvalInstanceId: state.id, action: 'APPROVAL_STEP_ACTIVATED', metadata: { path: ['stepId'], equals: step.id } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
      const dueAt = rows.find(row => row.dueAt)?.dueAt ?? null;
      if (automatic && (dueAt ? dueAt > now : now.getTime() - (active?.createdAt ?? state.startedAt).getTime() < 48 * 3_600_000)) return { sent: 0, alreadySent: false, recipientCount: 0 };
      const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
      const existing = await db.approvalAuditLog.findFirst({ where: { approvalInstanceId: state.id, action: 'APPROVAL_REMINDER_SENT', stepInstanceId: rows[0].id, metadata: { path: ['day'], equals: day } }, select: { id: true } });
      if (existing) return { sent: 0, alreadySent: true, recipientCount: 0 };
      const ids = await this.recipients(db, rows, step, document.ownerId);
      if (!ids.length) return { sent: 0, alreadySent: false, recipientCount: 0 };
      await db.notification.createMany({ data: ids.map(userId => ({ userId, type: 'DOC_APPROVAL_NEEDED' as const, title: `Validation attendue : ${document.reference}`, body: `Le document « ${document.title} » attend votre décision à l’étape « ${step.name} ».${dueAt ? ` Échéance : ${dueAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.` : ''}`, resourceType: 'Document', resourceId: document.id })) });
      await this.audit(db, 'APPROVAL_REMINDER_SENT', state.id, actorId, { day, stepId: step.id, recipients: ids, channel: 'in_app', automatic }, rows[0].id);
      return { sent: ids.length, alreadySent: false, recipientCount: ids.length };
    });
  }

  async remindOverdue() {
    let sent = 0;
    let examined = 0;
    let cursor: string | undefined;
    for (;;) {
      const instances = await this.prisma.approvalInstance.findMany({ where: { status: 'PENDING' }, orderBy: { id: 'asc' }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true } });
      for (const instance of instances) {
        try { sent += (await this.remind(instance.id, null, true)).sent; }
        catch (error) { if (!(error instanceof ConflictException || error instanceof NotFoundException || error instanceof BadRequestException)) throw error; }
      }
      examined += instances.length;
      if (instances.length < 100) break;
      cursor = instances[instances.length - 1]!.id;
    }
    return { examined, sent };
  }
}
