import { cancelPendingDocumentCircuits } from './document-circuit-cancellation';

describe('Document exits close pending circuits without rewriting decisions', () => {
  it('cancels only pending instances and steps, closes quality requests and preserves an audit event', async () => {
    const db: any = {
      approvalInstance: { findMany: jest.fn().mockResolvedValue([{ id: 'instance' }]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      approvalStepInstance: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      approvalAuditLog: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
      validationRequest: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    await cancelPendingDocumentCircuits(db, ['doc', 'doc'], 'owner', 'Retour en brouillon');
    expect(db.approvalInstance.findMany).toHaveBeenCalledWith({ where: { documentId: { in: ['doc'] }, status: 'PENDING' }, select: { id: true } });
    expect(db.approvalStepInstance.updateMany).toHaveBeenCalledWith({ where: { instanceId: { in: ['instance'] }, decision: 'PENDING' }, data: { decision: 'SKIPPED', decidedAt: expect.any(Date), comment: 'Retour en brouillon' } });
    expect(db.approvalAuditLog.createMany).toHaveBeenCalledWith({ data: [{ action: 'APPROVAL_CANCELLED', approvalInstanceId: 'instance', actorId: 'owner', metadata: { reason: 'Retour en brouillon', documentIds: ['doc'] } }] });
    expect(db.validationRequest.updateMany).toHaveBeenCalledWith({ where: { documentId: { in: ['doc'] }, status: 'PENDING' }, data: { status: 'CANCELLED' } });
  });
});
