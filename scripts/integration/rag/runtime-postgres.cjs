'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const source = process.env.INTRANET_INTEGRATION_SOURCE;
const runDir = process.env.INTEGRATION_RUN_DIR;
assert.ok(source && runDir && process.env.INTEGRATION_ALLOWED === 'throwaway-postgres-only');
const url = new URL(process.env.INTRANET_INTEGRATION_DATABASE_URL);
assert.equal(url.protocol, 'postgresql:'); assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, process.env.INTEGRATION_PG_PORT); assert.equal(decodeURIComponent(url.username), 'approval_it');
assert.match(url.pathname, /^\/approval_it_[a-z0-9]+$/);
const localRequire = createRequire(path.join(source, 'apps/backend/package.json'));
const { PrismaClient } = localRequire('@prisma/client');
const { RagService } = require(path.join(process.env.INTRANET_INTEGRATION_BACKEND_DIST, 'rag/rag.service.js'));
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
let checks = 0, user, embeddingHook, extracted = [];
const fileTexts = new Map();
const embedding = { isEnabled: () => true, embed: async (...args) => embeddingHook(...args) };
const extractor = { extractText: async (fileUrl) => { extracted.push(fileUrl); return fileTexts.get(fileUrl) || 'current version canonical'; } };
const chunker = { isEnabled: () => false, fixedSizeChunks: (content) => content ? [content] : [] };
const service = new RagService(prisma, extractor, embedding, {}, {}, {}, {}, chunker);
const reader = { userId: crypto.randomUUID(), role: 'ADMIN' };
const report = { schemaVersion: 1, status: 'running', tests: [], startedAt: new Date().toISOString(), safety: { noProductionData: true, applicationServerStarted: false, externalNotifications: false, projectSeedExecuted: false, host: '127.0.0.1', noPublishedPorts: true } };
function equal(a, b) { checks++; assert.deepStrictEqual(a, b); }
function ok(value) { checks++; assert.ok(value); }
async function rejects(operation, expression) { checks++; await assert.rejects(operation, expression); }
function save() { fs.writeFileSync(path.join(runDir, 'results.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); }
async function test(name, operation) {
  const before = checks;
  try { embeddingHook = async () => { throw new Error('Synthetic embedding offline'); }; extracted = []; await operation(); report.tests.push({ name, status: 'passed', checks: checks - before }); save(); }
  catch (error) { report.tests.push({ name, status: 'failed', error: String(error.message).replaceAll(url.password, '[redacted]') }); throw error; }
}
async function fixture(content = 'canonical initial policy') {
  const doc = await prisma.document.create({ data: { title: 'Synthetic RAG test', reference: 'IT-' + crypto.randomUUID(), category: 'POLICY', classification: 'INTERNE', scanStatus: 'CLEAN', status: 'APPROVED', ownerId: user.id, content } });
  const version = await prisma.documentVersion.create({ data: { documentId: doc.id, versionNumber: '1.0', fileUrl: `/integration/${doc.id}.txt`, fileType: 'text/plain', fileSizeBytes: 0, checksum: 'synthetic', uploadedById: user.id } });
  fileTexts.set(version.fileUrl, content || 'current version canonical');
  await prisma.document.update({ where: { id: doc.id }, data: { currentVersionId: version.id } });
  return { id: doc.id, version: version.id };
}
const index = (id, options = {}) => service.indexSource('DOCUMENT', id, 'ignored caller content', undefined, { semantic: false, ...options });
async function chunks(id) { return prisma.ragChunk.findMany({ where: { sourceType: 'DOCUMENT', sourceId: id }, orderBy: { chunkIndex: 'asc' } }); }
async function sqlHits(actor = reader) { const filter = await service.buildAccessFilter(actor); return prisma.$queryRawUnsafe('SELECT id, "sourceId" FROM "RagChunk" WHERE true ' + filter); }
async function main() {
  await prisma.$connect();
  const [identity] = await prisma.$queryRaw`SELECT current_database() AS database, current_user AS username, host(inet_server_addr()) AS address, inet_server_port() AS port, version() AS version`;
  equal(identity.database, decodeURIComponent(url.pathname.slice(1))); equal(identity.username, 'approval_it'); equal(identity.address, '127.0.0.1'); equal(identity.port, Number(url.port)); report.postgresql = identity.version;
  user = await prisma.user.create({ data: { email: `${crypto.randomUUID()}@integration.invalid`, passwordHash: 'SYNTHETIC_NO_LOGIN', firstName: 'Test', lastName: 'RAG', role: 'ADMIN', isActive: true } }); reader.userId = user.id;
  await test('current immutable version selected instead of latest upload; canonical provenance in real SQL', async () => {
    const f = await fixture(null);
    await prisma.documentVersion.create({ data: { documentId: f.id, versionNumber: '2.0', fileUrl: '/integration/newer-not-current.txt', fileType: 'text/plain', fileSizeBytes: 0, checksum: 'newer', uploadedById: user.id } });
    equal(await index(f.id), 1); equal(extracted, [`/integration/${f.id}.txt`]);
    const rows = await chunks(f.id); equal(rows[0].metadata.documentVersionId, f.version);
    ok((await sqlHits()).some((r) => r.sourceId === f.id));
    ok((await service.searchSimilar('canonical', 100, reader)).some((r) => r.sourceId === f.id));
    ok(!(await sqlHits(null)).some((r) => r.sourceId === f.id));
  });
  await test('legacy chunks, obsolete generations, PENDING, ERROR, INFECTED and deleted sources are invisible', async () => {
    const f = await fixture('legacy secrettest');
    await prisma.ragChunk.create({ data: { sourceType: 'DOCUMENT', sourceId: f.id, chunkIndex: 0, content: 'legacy secrettest' } });
    ok(!(await sqlHits()).some((r) => r.sourceId === f.id)); equal((await service.searchSimilar('secrettest', 100, reader)).length, 0);
    await index(f.id); ok((await sqlHits()).some((r) => r.sourceId === f.id));
    for (const scanStatus of ['PENDING', 'ERROR', 'INFECTED']) {
      await prisma.document.update({ where: { id: f.id }, data: { scanStatus } });
      equal(await index(f.id), 0); ok(!(await sqlHits()).some((r) => r.sourceId === f.id));
      equal((await service.searchSimilar('secrettest', 100, reader)).length, 0);
    }
    equal(extracted.length, 1);
    await prisma.document.update({ where: { id: f.id }, data: { scanStatus: 'CLEAN', deletedAt: new Date() } });
    ok(!(await sqlHits()).some((r) => r.sourceId === f.id)); equal(await index(f.id), 0);
  });
  await test('concurrent stale index cannot replace a newer valid generation', async () => {
    const f = await fixture('old text'); await index(f.id);
    let resume, entered; const started = new Promise((resolve) => { entered = resolve; });
    embeddingHook = async () => { entered(); return new Promise((resolve) => { resume = () => resolve(undefined); }); };
    const stale = index(f.id, { semantic: true }); const rejected = rejects(stale, /changed during indexing/); await started;
    const version = await prisma.documentVersion.create({ data: { documentId: f.id, versionNumber: '2.0', fileUrl: '/integration/current2.txt', fileType: 'text/plain', fileSizeBytes: 0, checksum: 'version2', uploadedById: user.id } });
    fileTexts.set(version.fileUrl, 'new complete generation');
    await prisma.document.update({ where: { id: f.id }, data: { currentVersionId: version.id, content: 'new complete generation' } });
    await index(f.id); resume(); await rejected;
    const rows = await chunks(f.id); equal(rows.length, 1); equal(rows[0].content, 'new complete generation'); equal(rows[0].metadata.documentVersionId, version.id);
  });
  await test('SQL rollback restores previous chunks after failure following delete and insert', async () => {
    const f = await fixture('valid previous text'); await index(f.id); const before = await chunks(f.id);
    const proxy = new Proxy(prisma, { get(target, prop) { if (prop !== '$transaction') return Reflect.get(target, prop); return (callback, options) => target.$transaction(async (tx) => callback(new Proxy(tx, { get(db, key) { if (key !== 'ragChunk') return Reflect.get(db, key); return new Proxy(db.ragChunk, { get(chunks, method) { if (method !== 'create') return Reflect.get(chunks, method); return async (...args) => { await chunks.create(...args); throw new Error('injected insertion failure'); }; } }); } })), options); } });
    const failing = new RagService(proxy, extractor, embedding, {}, {}, {}, {}, chunker);
    await rejects(failing.indexSource('DOCUMENT', f.id, '', undefined, { semantic: false }), /injected insertion failure/);
    equal(await chunks(f.id), before);
  });
  await test('embedding cancellation preserves the exact previous generation; lexical failure remains searchable', async () => {
    const f = await fixture('fallback searchabletext'); await index(f.id); const before = await chunks(f.id);
    const controller = new AbortController();
    embeddingHook = async () => { controller.abort(new Error('operator cancelled')); throw new Error('transport aborted'); };
    await rejects(index(f.id, { semantic: true, signal: controller.signal }), /operator cancelled/); equal(await chunks(f.id), before);
    embeddingHook = async () => { throw new Error('synthetic Ollama offline'); };
    equal(await index(f.id, { semantic: true }), 1);
    ok((await service.searchSimilar('searchabletext', 100, reader)).some((r) => r.sourceId === f.id));
  });
  await test('two concurrent replacements serialize with no duplicate or partial chunks', async () => {
    const f = await fixture('concurrent canonical');
    equal(await Promise.all([index(f.id), index(f.id)]), [1, 1]); equal((await chunks(f.id)).length, 1);
  });
  await test('public Wiki and published Runbook are checked live, private/draft changes withdraw their chunks', async () => {
    const wiki = await prisma.wikiPage.create({ data: { title: 'Synthetic wiki', slug: crypto.randomUUID(), content: 'public knowledge', authorId: user.id, isPublished: true, visibility: 'PUBLIC' } });
    const rb = await prisma.runbook.create({ data: { title: 'Synthetic runbook', slug: crypto.randomUUID(), content: 'public instructions', authorId: user.id, isPublished: true } });
    equal(await service.indexSource('WIKI', wiki.id, '', undefined, { semantic: false }), 1); equal(await service.indexSource('RUNBOOK', rb.id, '', undefined, { semantic: false }), 1);
    ok((await sqlHits()).some((r) => r.sourceId === wiki.id)); ok((await sqlHits()).some((r) => r.sourceId === rb.id));
    await prisma.wikiPage.update({ where: { id: wiki.id }, data: { visibility: 'PRIVATE' } }); await prisma.runbook.update({ where: { id: rb.id }, data: { isPublished: false } });
    ok(!(await sqlHits()).some((r) => r.sourceId === wiki.id)); ok(!(await sqlHits()).some((r) => r.sourceId === rb.id));
    const candidates = await prisma.ragChunk.findMany({ where: { sourceId: { in: [wiki.id, rb.id] } } }); equal(await service.applyRbacFilter(candidates, reader), []);
  });
  await test('root CLI performs a real lexical rebuild without JWT, HTTP, cron, warmup or business output', async () => {
    await prisma.ragChunk.deleteMany(); await prisma.document.deleteMany(); await prisma.wikiPage.deleteMany(); await prisma.runbook.deleteMany();
    const f = await fixture('UNSAVED DRAFT MUST NOT BE INDEXED');
    const storage = path.join(runDir, 'cli-storage'); fs.mkdirSync(path.join(storage, 'cli'), { recursive: true });
    fs.writeFileSync(path.join(storage, 'cli/current.html'), '<html><head><title>PRIVATE TITLE</title></head><body>Synthetic canonical CLI version</body></html>');
    await prisma.documentVersion.update({ where: { id: f.version }, data: { fileUrl: '/storage/cli/current.html', fileType: 'text/html' } });
    const cli = path.join(source, 'apps/backend/scripts/reindex-lexical.cjs');
    const env = { ...process.env, NODE_PATH: '', DATABASE_URL: url.href, STORAGE_PATH: storage, REDIS_URL: process.env.INTEGRATION_REDIS_URL, RAG_SEMANTIC_ENABLED: 'true', RAG_REINDEX_SEMANTIC_ENABLED: 'true', OLLAMA_ENABLED: 'true', OLLAMA_WARMUP_ENABLED: 'true' };
    const execute = (mode) => require('node:child_process').spawnSync(process.execPath, [cli, mode], { env, encoding: 'utf8', timeout: 30_000, maxBuffer: 16_384 });
    const ready = execute('--check'); equal(ready.status, 0); const readiness = JSON.parse(ready.stdout); equal(readiness.status, 'ready'); equal(readiness.modelsEnabled, false);
    const Redis = localRequire('ioredis'); const redis = new Redis(process.env.INTEGRATION_REDIS_URL);
    try {
      await redis.set('omnitech:rag:reindex:v1', 'synthetic-other-owner', 'PX', 30_000);
      const busy = execute('--apply'); equal(busy.status, 1); equal(JSON.parse(busy.stdout).code, 'maintenance_failed');
      equal(await redis.get('omnitech:rag:reindex:v1'), 'synthetic-other-owner'); await redis.del('omnitech:rag:reindex:v1');
      const rebuilt = execute('--apply'); equal(rebuilt.status, 0); const result = JSON.parse(rebuilt.stdout); equal(result.status, 'complete'); equal(result.errorsCount, 0); equal(result.indexed.DOCUMENT, 1); equal(result.modelsEnabled, false);
      ok(!rebuilt.stdout.includes('Synthetic canonical')); ok(!rebuilt.stdout.includes('PRIVATE TITLE')); ok(!rebuilt.stdout.includes('UNSAVED DRAFT')); ok(!rebuilt.stdout.includes(f.id));
      const generated = await chunks(f.id); equal(generated[0].content, 'Synthetic canonical CLI version'); equal(generated[0].metadata.documentVersionId, f.version);
      equal(await redis.get('omnitech:rag:reindex:v1'), null);
    } finally { redis.disconnect(); }
  });
  report.status = 'passed'; report.totals = { scenarios: report.tests.length, checks }; report.finishedAt = new Date().toISOString(); save();
}
main().catch((error) => { report.status = 'failed'; report.error = String(error.stack || error).replaceAll(url.password, '[redacted]'); save(); process.exitCode = 1; }).finally(() => prisma.$disconnect());
