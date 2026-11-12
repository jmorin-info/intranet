import { RagService } from './rag.service';

describe('RAG document scope security', () => {
  let service: any;
  let db: any;
  const liveId = '12345678-1234-1234-1234-123456789012';
  const reader = { userId: 'reader', role: 'COLLABORATEUR', departmentId: 'primary' };
  beforeEach(() => {
    db = {
      user: { findUnique: jest.fn().mockResolvedValue({ departmentId: 'primary' }) },
      userDepartment: { findMany: jest.fn().mockResolvedValue([]) },
      document: { findMany: jest.fn().mockResolvedValue([{ id: liveId }]) },
      approvalStepInstance: { findMany: jest.fn().mockResolvedValue([{ step: { order: 1 }, instance: { documentId: liveId, documentVersionId: 'current', currentStepOrder: 1 } }]) },
    };
    service = Object.create(RagService.prototype);
    service.prisma = db; service.logger = { error: jest.fn(), log: jest.fn() };
  });
  afterEach(() => delete process.env.RBAC_RAG_ENABLED);
  it('uses the GED SQL policy including current-step grants and clean files', async () => {
    await expect(service.getAccessibleDocumentIds(reader)).resolves.toEqual([liveId]);
    expect(db.document.findMany).toHaveBeenCalledWith({ where: { AND: [expect.objectContaining({ deletedAt: null, OR: expect.arrayContaining([{ classification: { in: ['PUBLIC', 'INTERNE'] }, status: 'APPROVED' }, { id: liveId, currentVersionId: 'current' }]) }), { scanStatus: 'CLEAN' }] }, select: { id: true } });
  });
  it('also filters deleted and unscanned document chunks for administrators', async () => {
    await service.getAccessibleDocumentIds({ userId: 'admin', role: 'ADMIN' });
    expect(db.document.findMany).toHaveBeenCalledWith({ where: { AND: [{ deletedAt: null }, { scanStatus: 'CLEAN' }] }, select: { id: true } });
  });
  it('does not expose GED chunks without an actor or when the old opt-out flag is disabled', async () => {
    const chunks = [{ sourceType: 'DOCUMENT', sourceId: 'denied' }, { sourceType: 'WIKI', sourceId: 'published' }];
    await expect(service.applyRbacFilter(chunks, undefined)).resolves.toEqual([chunks[1]]);
    process.env.RBAC_RAG_ENABLED = 'false';
    await expect(service.applyRbacFilter(chunks, reader)).resolves.toEqual([chunks[1]]);
  });
  it('rejects corrupted non-UUID identifiers before interpolating a vector or hybrid filter', async () => {
    db.document.findMany.mockResolvedValue([{ id: "x'); DROP TABLE documents; --" }]);
    await expect(service.buildAccessFilter(reader)).resolves.toBe('AND ("sourceType" != \'DOCUMENT\')');
    await expect(service.buildAccessFilter()).resolves.toBe('AND ("sourceType" != \'DOCUMENT\')');
  });
});
