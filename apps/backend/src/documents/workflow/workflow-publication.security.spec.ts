import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { WorkflowService } from './workflow.service';

describe('quality workflow publication boundary', () => {
  let service: WorkflowService;
  let db: any;
  let document: any;
  let actor: any;
  let notifications: any;
  let rules: any;
  let documents: any;

  beforeEach(() => {
    actor = { id: 'approver', role: 'DIRECTION', isActive: true, deletedAt: null };
    document = { id: 'document', reference: 'POL_001', title: 'Sécurité', category: 'POLICY', status: 'PENDING_APPROVAL',
      ownerId: 'owner', reviewerId: 'reviewer', approverId: 'approver', verifierId: null,
      currentVersionId: 'version', scanStatus: 'CLEAN', updatedAt: new Date(), deletedAt: null,
      validationRequests: [{ id: 'request', documentVersionId: 'version', status: 'PENDING', currentStep: 'APPROVAL', steps: [{ id: 'approval', stepType: 'APPROVAL' }] }] };
    db = {
      user: { findUnique: jest.fn(async () => actor) },
      document: { findUnique: jest.fn(async () => document), updateMany: jest.fn(async () => ({ count: 1 })) },
      approvalInstance: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []), update: jest.fn() },
      approvalStepInstance: { updateMany: jest.fn(async () => ({ count: 1 })) },
      approvalAuditLog: { create: jest.fn() },
      documentVersion: { create: jest.fn() },
      validationRequest: { create: jest.fn(async () => ({ id: 'new-request' })), updateMany: jest.fn(async () => ({ count: 1 })) },
      validationStep: { create: jest.fn(), findFirst: jest.fn(async () => ({ id: 'approved-review' })), updateMany: jest.fn(async () => ({ count: 1 })) },
      $transaction: jest.fn(async operation => operation(db)),
    };
    notifications = { create: jest.fn(async () => ({})) };
    rules = { applyAtSubmission: jest.fn(async () => ({})) };
    documents = { ensureNativeVersion: jest.fn(async () => document), notifyNewDocumentAvailable: jest.fn() };
    service = new WorkflowService(db, { log: jest.fn(async () => ({})) } as any, notifications,
      { autoAssignControls: jest.fn(async () => ({ assigned: 0 })) } as any, documents as any,
      undefined, undefined, rules);
  });

  it.each(['PENDING', 'REJECTED', 'CANCELLED', 'TIMEOUT_ESCALATED'])(
    'does not publish when the additional circuit is %s', async status => {
      db.approvalInstance.findFirst.mockResolvedValue({ status });
      await expect(service.approveDocument('document', 'approver')).rejects.toThrow(BadRequestException);
      expect(db.document.updateMany).not.toHaveBeenCalled();
      expect(notifications.create).not.toHaveBeenCalled();
    },
  );

  it('allows a completed additional circuit only for the same immutable version', async () => {
    db.approvalInstance.findFirst.mockResolvedValue({ status: 'APPROVED' });
    await service.approveDocument('document', 'approver');
    expect(db.approvalInstance.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { documentId: 'document', documentVersionId: 'version' } }));
    expect(db.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ currentVersionId: 'version', status: 'PENDING_APPROVAL', scanStatus: 'CLEAN' }) }));
  });

  it('denies self-approval even for an administrator', async () => {
    actor = { ...actor, id: 'owner', role: 'SUPER_ADMIN' };
    document.approverId = 'owner';
    await expect(service.approveDocument('document', 'owner')).rejects.toThrow(ForbiddenException);
    expect(db.document.updateMany).not.toHaveBeenCalled();
  });

  it.each(['PENDING', 'INFECTED', 'ERROR'] )('does not publish a file whose scan is %s', async scanStatus => {
    document.scanStatus = scanStatus;
    await expect(service.approveDocument('document', 'approver')).rejects.toThrow(BadRequestException);
  });

  it('requires the completed review and the pending final step of this version', async () => {
    db.validationStep.findFirst.mockResolvedValue(null);
    await expect(service.approveDocument('document', 'approver')).rejects.toThrow(BadRequestException);
    document.validationRequests[0].documentVersionId = 'old-version';
    await expect(service.approveDocument('document', 'approver')).rejects.toThrow(BadRequestException);
  });

  it('detects a concurrent edit instead of publishing the stale snapshot', async () => {
    db.document.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.approveDocument('document', 'approver')).rejects.toThrow(ConflictException);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('takes a real native snapshot and applies automatic rules inside submission', async () => {
    document = { ...document, isNative: true, content: '<p>Version à relire</p>', status: 'DRAFT' };
    await service.submitForReview('document', 'owner');
    expect(documents.ensureNativeVersion).toHaveBeenCalledWith('document', 'owner');
    expect(rules.applyAtSubmission).toHaveBeenCalledWith(db, document, 'owner');
    expect(db.validationRequest.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ documentVersionId: 'version' }) }));
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });

  it('does not launch automatic rules if another submission has claimed the draft', async () => {
    document.status = 'DRAFT'; db.document.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.submitForReview('document', 'owner')).rejects.toThrow(ConflictException);
    expect(rules.applyAtSubmission).not.toHaveBeenCalled();
  });
  it('closes every pending additional circuit when quality approval returns for correction', async () => {
    db.approvalInstance.findMany.mockResolvedValue([{ id: 'circuit' }]);
    await service.rejectDocument('document', 'approver', 'Préciser le responsable de chaque contrôle.');
    expect(db.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'PENDING_APPROVAL', currentVersionId: 'version' }), data: { status: 'DRAFT' } }));
    expect(db.approvalInstance.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'circuit' }, data: expect.objectContaining({ status: 'CANCELLED' }) }));
    expect(db.approvalStepInstance.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { instanceId: 'circuit', decision: 'PENDING' }, data: expect.objectContaining({ decision: 'SKIPPED' }) }));
    expect(db.approvalAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'APPROVAL_CANCELLED_FOR_CORRECTION' }) }));
  });

  it('preserves the immutable rejected snapshot until a real edit creates another version', async () => {
    actor.id = 'reviewer'; document.status = 'IN_REVIEW';
    document.validationRequests[0].currentStep = 'REVIEW';
    document.validationRequests[0].steps = [{ id: 'review', stepType: 'REVIEW' }];
    await service.rejectReview('document', 'reviewer', 'Préciser le responsable de chaque contrôle.');
    expect(db.documentVersion.create).not.toHaveBeenCalled();
    expect(db.validationStep.updateMany.mock.calls[0][0].data).toMatchObject({ action: 'REJECTED', decidedById: 'reviewer' });
  });

  it('does not revive a rejected request after a concurrent decision', async () => {
    db.document.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.rejectDocument('document', 'approver', 'Corriger les responsabilités documentées.')).rejects.toThrow(ConflictException);
    expect(notifications.create).not.toHaveBeenCalled();
    expect(db.approvalInstance.update).not.toHaveBeenCalled();
  });

  it('refuses a fabricated review state without the actual pending step', async () => {
    actor.id = 'reviewer'; document.status = 'IN_REVIEW';
    document.validationRequests[0].currentStep = 'REVIEW'; document.validationRequests[0].steps = [];
    await expect(service.approveReview('document', 'reviewer')).rejects.toThrow(ConflictException);
    expect(db.document.updateMany).not.toHaveBeenCalled();
  });

  it('does not send final approval twice if author confirmation races', async () => {
    document.status = 'REVIEW_APPROVED'; document.validationRequests[0].currentStep = 'REVIEW';
    db.validationRequest.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.requestApproval('document', 'owner')).rejects.toThrow(ConflictException);
    expect(db.validationStep.create).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

});
