import { RagService } from './rag.service';

describe('RAG document scope security', () => {
  let service: any;
  let db: any;
  const liveId = '12345678-1234-1234-1234-123456789012';
  const updatedAt = new Date('2026-11-13T12:00:00.123Z');
  const reader = { userId: 'reader', role: 'COLLABORATEUR', departmentId: 'primary' };
  beforeEach(() => {
    db = {
      user: { findUnique: jest.fn().mockResolvedValue({ departmentId: 'primary' }) },
      userDepartment: { findMany: jest.fn().mockResolvedValue([]) },
      document: { findMany: jest.fn().mockResolvedValue([{ id: liveId, currentVersionId: 'current', updatedAt }]) },
      wikiPage: { findMany: jest.fn().mockResolvedValue([{ id: 'published', updatedAt }]) },
      runbook: { findMany: jest.fn().mockResolvedValue([]) },
      approvalStepInstance: { findMany: jest.fn().mockResolvedValue([{ step: { order: 1 }, instance: { documentId: liveId, documentVersionId: 'current', currentStepOrder: 1 } }]) },
    };
    service = Object.create(RagService.prototype);
    service.prisma = db; service.logger = { error: jest.fn(), log: jest.fn() };
  });
  afterEach(() => delete process.env.RBAC_RAG_ENABLED);
  it('uses the GED policy including current-step grants, CLEAN files and current versions', async () => {
    await expect(service.getAccessibleDocumentIds(reader)).resolves.toEqual([liveId]);
    expect(db.document.findMany).toHaveBeenCalledWith({ where: { AND: [expect.objectContaining({ deletedAt: null, OR: expect.arrayContaining([{ classification: { in: ['PUBLIC', 'INTERNE'] }, status: 'APPROVED' }, { id: liveId, currentVersionId: 'current' }]) }), { scanStatus: 'CLEAN', currentVersionId: { not: null } }] }, select: { id: true, currentVersionId: true, updatedAt: true } });
  });
  it('also filters deleted and unscanned document chunks for administrators', async () => {
    await service.getAccessibleDocumentIds({ userId: 'admin', role: 'ADMIN' });
    expect(db.document.findMany).toHaveBeenCalledWith({ where: { AND: [{ deletedAt: null }, { scanStatus: 'CLEAN', currentVersionId: { not: null } }] }, select: { id: true, currentVersionId: true, updatedAt: true } });
  });
  it('does not expose GED chunks without an actor or when the old opt-out flag is disabled', async () => {
    const chunks = [{ sourceType: 'DOCUMENT', sourceId: 'denied' }, { sourceType: 'WIKI', sourceId: 'published', metadata: { sourceUpdatedAt: String(updatedAt.getTime()) } }];
    await expect(service.applyRbacFilter(chunks, undefined)).resolves.toEqual([chunks[1]]);
    process.env.RBAC_RAG_ENABLED = 'false';
    await expect(service.applyRbacFilter(chunks, reader)).resolves.toEqual([chunks[1]]);
  });
  it('rejects a legacy index, an old version, and a generation from before the current edit', async () => {
    const chunk = { sourceType: 'DOCUMENT', sourceId: liveId };
    const valid = { ...chunk, metadata: { documentVersionId: 'current', sourceUpdatedAt: String(updatedAt.getTime()) } };
    await expect(service.applyRbacFilter([chunk, { ...valid, metadata: { ...valid.metadata, documentVersionId: 'old' } }, { ...valid, metadata: { ...valid.metadata, sourceUpdatedAt: '0' } }, valid], reader)).resolves.toEqual([valid]);
    db.document.findMany.mockResolvedValue([]);
    await expect(service.applyRbacFilter([valid], reader)).resolves.toEqual([]);
  });
  it('excludes private or unpublished Wiki and Runbook chunks even without a GED actor', async () => {
    await expect(service.applyRbacFilter([{ sourceType: 'WIKI', sourceId: 'private' }, { sourceType: 'RUNBOOK', sourceId: 'draft' }])).resolves.toEqual([]);
    expect(db.wikiPage.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ isPublished: true, visibility: 'PUBLIC' }) }));
  });
  it('rejects non-UUID identifiers and includes live source provenance in vector/BM25 SQL', async () => {
    db.document.findMany.mockResolvedValue([{ id: "x'); DROP TABLE documents; --" }]);
    const sql = await service.buildAccessFilter(reader);
    expect(sql).not.toContain('DROP TABLE'); expect(sql).toContain('AND (FALSE');
    expect(sql).toContain('w.visibility = \'PUBLIC\'');
    db.document.findMany.mockResolvedValue([{ id: liveId }]);
    const filter = await service.buildAccessFilter(reader);
    expect(filter).toContain('documentVersionId'); expect(filter).toContain('sourceUpdatedAt'); expect(filter).toContain('d."deletedAt" IS NULL');
  });
});
