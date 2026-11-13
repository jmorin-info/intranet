import { ConflictException } from '@nestjs/common';
import { RagService } from './rag.service';
import { RagReindexScheduler } from './rag-reindex.scheduler';
import * as safety from './reindex-safety';
import * as lease from './reindex-lease';

jest.mock('./reindex-lease', () => ({ acquireReindexLease: jest.fn() }));
const reader = { userId: 'admin', role: 'ADMIN' };
const date = new Date('2026-11-13T10:00:00.123Z');
const current = () => ({ id: 'doc', title: 'Canonical title', reference: 'D-1', classification: 'INTERNE', deletedAt: null, scanStatus: 'CLEAN', currentVersionId: 'v1', content: null, updatedAt: date });

describe('RAG index generation integrity', () => {
  let service: RagService;
  let db: any;
  let source: any;
  let rows: any[];
  let embed: jest.Mock;
  let extract: jest.Mock;
  let rejectCreate = false;
  let release: jest.Mock;
  beforeEach(() => {
    source = current(); rows = [{ id: 'old', content: 'previous complete index' }]; rejectCreate = false;
    const matches = (where: any) => source && Object.entries(where).every(([key, value]) => key === 'currentVersionId' && typeof value === 'object' ? source.currentVersionId !== null : key === 'updatedAt' ? source.updatedAt.getTime() === (value as Date).getTime() : source[key] === value);
    const document = { findFirst: jest.fn(async ({ where }) => matches(where) ? { ...source } : null), findMany: jest.fn().mockResolvedValue([]) };
    db = {
      document, documentVersion: { findFirst: jest.fn().mockResolvedValue({ id: 'v1', fileUrl: '/storage/current.txt', fileType: 'text/plain' }) },
      wikiPage: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) }, runbook: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (callback) => {
        const staged = [...rows];
        const tx: any = { document, wikiPage: db.wikiPage, runbook: db.runbook, $queryRaw: jest.fn(), $executeRaw: jest.fn(), ragChunk: {
          deleteMany: jest.fn(async () => { const count = staged.length; staged.length = 0; return { count }; }),
          create: jest.fn(async ({ data }) => { staged.push(data); if (rejectCreate) throw new Error('database failure'); return { id: 'new' }; }),
        } };
        const value = await callback(tx); rows = staged; return value;
      }),
    };
    embed = jest.fn().mockResolvedValue(Array(1024).fill(0.1));
    extract = jest.fn().mockResolvedValue('canonical current text');
    service = new RagService(db, { extractText: extract } as any, { isEnabled: () => true, embed } as any, {} as any, {} as any, {} as any, {} as any, { isEnabled: () => false, fixedSizeChunks: (text: string) => text ? [text] : [] } as any);
    jest.spyOn(safety, 'assertBackgroundCapacity').mockImplementation(() => {});
    release = jest.fn().mockResolvedValue(undefined);
    jest.mocked(lease.acquireReindexLease).mockResolvedValue(release);
  });
  afterEach(() => { jest.restoreAllMocks(); delete process.env.RAG_REINDEX_SEMANTIC_ENABLED; delete process.env.RAG_MAINTENANCE_MODE; delete process.env.RAG_REINDEX_ENABLED; delete process.env.RAG_ENABLED; });

  it('extracts the exact CLEAN current version and overwrites untrusted caller metadata/content', async () => {
    await expect(service.indexSource('DOCUMENT', 'doc', 'attacker supplied text', { documentVersionId: 'newer-but-not-current' })).resolves.toBe(1);
    expect(db.documentVersion.findFirst).toHaveBeenCalledWith({ where: { id: 'v1', documentId: 'doc' } });
    expect(extract).toHaveBeenCalledWith('/storage/current.txt', 'text/plain', undefined);
    expect(rows).toEqual([expect.objectContaining({ content: 'canonical current text', metadata: expect.objectContaining({ documentVersionId: 'v1', sourceUpdatedAt: String(date.getTime()), title: 'Canonical title' }) })]);
  });
  it.each(['PENDING', 'INFECTED', 'ERROR'])('never parses or indexes a %s document', async (status) => {
    source.scanStatus = status;
    await expect(service.indexSource('DOCUMENT', 'doc', 'untrusted')).resolves.toBe(0);
    expect(extract).not.toHaveBeenCalled(); expect(embed).not.toHaveBeenCalled(); expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('checks CLEAN state again immediately before opening a file', async () => {
    db.documentVersion.findFirst.mockImplementation(async () => { source.scanStatus = 'PENDING'; return { id: 'v1' }; });
    await expect(service.indexSource('DOCUMENT', 'doc', '')).resolves.toBe(0);
    expect(extract).not.toHaveBeenCalled(); expect(rows[0].id).toBe('old');
  });
  it('preserves the previous complete index when extraction is unsupported or fails', async () => {
    extract.mockResolvedValue(null);
    await expect(service.indexSource('DOCUMENT', 'doc', '')).rejects.toThrow('previous index preserved');
    expect(rows[0].id).toBe('old'); expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('rejects a stale concurrent generation after embedding, preserving a newer index', async () => {
    embed.mockImplementation(async () => { source.currentVersionId = 'v2'; source.updatedAt = new Date(date.getTime() + 1); rows = [{ id: 'newer' }]; return Array(1024).fill(0.1); });
    await expect(service.indexSource('DOCUMENT', 'doc', '')).rejects.toThrow('changed during indexing');
    expect(rows).toEqual([{ id: 'newer' }]);
  });
  it('rolls back delete and partial insertion on database failure', async () => {
    rejectCreate = true;
    await expect(service.indexSource('DOCUMENT', 'doc', '')).rejects.toThrow('database failure');
    expect(rows).toEqual([{ id: 'old', content: 'previous complete index' }]);
  });
  it('allows a complete lexical generation when Ollama fails', async () => {
    embed.mockRejectedValue(new Error('Ollama unavailable'));
    await expect(service.indexSource('DOCUMENT', 'doc', '')).resolves.toBe(1);
    expect(rows[0].content).toBe('canonical current text');
  });
  it('does not replace the old index after cancellation during an embedding', async () => {
    const controller = new AbortController();
    embed.mockImplementation(async () => { controller.abort(new Error('operator cancelled')); throw new Error('network abort'); });
    await expect(service.indexSource('DOCUMENT', 'doc', '', undefined, { signal: controller.signal })).rejects.toThrow('operator cancelled');
    expect(rows[0].id).toBe('old'); expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('stops when memory drops during an embedding instead of replacing the index lexically', async () => {
    embed.mockImplementation(async () => { jest.mocked(safety.assertBackgroundCapacity).mockImplementation(() => { throw new Error('capacity'); }); throw new Error('failed'); });
    await expect(service.indexSource('DOCUMENT', 'doc', '')).rejects.toThrow('capacity');
    expect(rows[0].id).toBe('old');
  });
  it('does not index a private wiki page or unpublished runbook', async () => {
    await expect(service.indexSource('WIKI', 'private', 'secret')).resolves.toBe(0);
    await expect(service.indexSource('RUNBOOK', 'draft', 'secret')).resolves.toBe(0);
    expect(db.wikiPage.findFirst).toHaveBeenCalledWith({ where: { id: 'private', isPublished: true, visibility: 'PUBLIC' } });
    expect(db.runbook.findFirst).toHaveBeenCalledWith({ where: { id: 'draft', isPublished: true } });
  });
  it('serializes whole reindex runs, opts in semantic work, and releases its distributed lease', async () => {
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => { resume = resolve; });
    db.document.findMany.mockImplementationOnce(async () => { await gate; return [{ id: 'doc' }]; });
    const run = service.reindexAll();
    await Promise.resolve(); await Promise.resolve();
    await expect(service.reindexAll()).rejects.toBeInstanceOf(ConflictException);
    resume();
    await expect(run).resolves.toEqual({ indexed: { DOCUMENT: 1, WIKI: 0, PROCEDURE: 0, RUNBOOK: 0, FAQ: 0 }, errors: [] });
    expect(embed).not.toHaveBeenCalled(); expect(release).toHaveBeenCalledTimes(1);
    expect(db.document.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: null, scanStatus: 'CLEAN', currentVersionId: { not: null } }, select: { id: true }, take: 10 }));
  });
  it('fails closed before source queries if the global reindex lock is unavailable', async () => {
    jest.mocked(lease.acquireReindexLease).mockRejectedValueOnce(new Error('lock down'));
    await expect(service.reindexAll()).rejects.toThrow('lock down');
    expect(db.document.findMany).not.toHaveBeenCalled();
    await expect(service.reindexAll()).resolves.toBeDefined();
  });
  it('aborts an active run on shutdown and releases the lease', async () => {
    db.document.findMany.mockImplementationOnce(async () => { service.onModuleDestroy(); return [{ id: 'doc' }]; });
    await expect(service.reindexAll()).rejects.toThrow('shutting down');
    expect(rows[0].id).toBe('old'); expect(release).toHaveBeenCalled();
  });
  it('requires cron opt-in and honors the maintenance switch', async () => {
    const mock = { reindexAll: jest.fn(), isEnabled: () => true };
    const scheduler = new RagReindexScheduler(mock as any);
    await scheduler.reindexNightly(); expect(mock.reindexAll).not.toHaveBeenCalled();
    process.env.RAG_REINDEX_ENABLED = 'true'; process.env.RAG_MAINTENANCE_MODE = 'true';
    await scheduler.reindexNightly(); expect(mock.reindexAll).not.toHaveBeenCalled();
  });
  it('falls back to lexical retrieval in vector mode if semantic retrieval fails', async () => {
    jest.spyOn(service, 'getSearchMode').mockReturnValue('vector'); jest.spyOn(service, 'isSemanticEnabled').mockReturnValue(true);
    jest.spyOn(service, 'vectorSearch').mockResolvedValue([]); jest.spyOn(service, 'searchSimilar').mockResolvedValue([{ sourceId: 'safe', sourceType: 'DOCUMENT', title: 'safe', snippet: 'safe', score: 1 }]);
    await expect((service as any).retrieveOnce('safe', 10, reader)).resolves.toEqual([expect.objectContaining({ sourceId: 'safe' })]);
  });
});
