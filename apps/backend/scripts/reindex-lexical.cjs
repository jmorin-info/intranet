#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

function validateConfig({ args, env, uid, nodeVersion }) {
  if (args.length !== 1 || !['--check', '--apply'].includes(args[0])) throw new Error('usage');
  if (uid !== 0) throw new Error('os_root_required');
  const [major, minor, patch] = nodeVersion.split('.').map(Number);
  if (major !== 24 || minor < 22 || (minor === 22 && patch < 3)) throw new Error('qualified_node24_required');
  if (env.RAG_MAINTENANCE_MODE === 'true') throw new Error('maintenance_mode_active');
  let database;
  try { database = new URL(env.DATABASE_URL); } catch { throw new Error('database_configuration_required'); }
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname) || !database.username || database.pathname.length < 2) throw new Error('local_database_required');
  if (!env.STORAGE_PATH || !path.isAbsolute(env.STORAGE_PATH)) throw new Error('absolute_storage_path_required');
  // A missing directory must not silently create an empty replacement storage.
  const storage = fs.realpathSync(env.STORAGE_PATH);
  if (!fs.statSync(storage).isDirectory()) throw new Error('storage_directory_required');
  database.searchParams.set('connection_limit', '2');
  database.searchParams.set('connect_timeout', '5');
  database.searchParams.set('pool_timeout', '5');
  return { mode: args[0].slice(2), storage, database };
}

async function run() {
  let prisma, service;
  const controller = new AbortController();
  let interrupted;
  const stop = (name) => { interrupted = name; controller.abort(new Error('operator_cancelled')); };
  const interrupt = () => stop('SIGINT'); const terminate = () => stop('SIGTERM');
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
  const started = Date.now();
  try {
    const config = validateConfig({ args: process.argv.slice(2), env: process.env, uid: process.getuid?.(), nodeVersion: process.versions.node });
    // This process cannot activate a model, cron or warmup, even with a production env file.
    for (const variable of ['RAG_SEMANTIC_ENABLED', 'RAG_REINDEX_SEMANTIC_ENABLED', 'RAG_REINDEX_ENABLED', 'OLLAMA_ENABLED', 'OLLAMA_WARMUP_ENABLED', 'RAG_QUERY_EXPANSION_ENABLED', 'RAG_RERANKER_ENABLED', 'RAG_SEMANTIC_CHUNKING_ENABLED']) process.env[variable] = 'false';
    process.env.STORAGE_PATH = config.storage;
    global.fetch = async () => { throw new Error('http_disabled_in_lexical_maintenance'); };
    const backend = path.resolve(__dirname, '..');
    const localRequire = createRequire(path.join(backend, 'package.json'));
    localRequire('@nestjs/common').Logger.overrideLogger(false);
    const load = (file) => require(path.join(backend, 'dist', file));
    const contract = load('rag/rag.service.js');
    if (contract.RAG_INDEX_CONTRACT_VERSION !== 1) throw new Error('qualified_rag_build_required');
    const { assertBackgroundCapacity, availableMemoryBytes, throwIfAborted } = load('rag/reindex-safety.js');
    assertBackgroundCapacity(false); throwIfAborted(controller.signal);
    const { PrismaClient } = localRequire('@prisma/client');
    prisma = new PrismaClient({ datasources: { db: { url: config.database.href } }, log: [] });
    await prisma.$connect();
    const [identity] = await prisma.$queryRaw`SELECT current_database() AS database, host(inet_server_addr()) AS address, inet_server_port() AS port`;
    if (identity.database !== decodeURIComponent(config.database.pathname.slice(1)) || !['127.0.0.1', '::1'].includes(identity.address) || identity.port !== Number(config.database.port || 5432)) throw new Error('database_identity_mismatch');
    throwIfAborted(controller.signal);
    if (config.mode === 'check') {
      const release = await load('rag/reindex-lease.js').acquireReindexLease(1000);
      try {
        const eligibleDocuments = await prisma.document.count({ where: { deletedAt: null, scanStatus: 'CLEAN', currentVersionId: { not: null } } });
        throwIfAborted(controller.signal);
        process.stdout.write(JSON.stringify({ status: 'ready', mode: 'lexical', eligibleDocuments, availableMiB: Math.floor(availableMemoryBytes() / 1024 / 1024), modelsEnabled: false }) + '\n');
      } finally { await release(); }
      return;
    }
    // Explicit dependency graph only: no AppModule, Nest bootstrap, schedule, cache or warmup.
    const storage = new (load('storage/storage.service.js').StorageService)();
    const extractor = new (load('rag/text-extractor.service.js').TextExtractorService)(storage);
    const embedding = new (load('rag/embedding/embedding.service.js').EmbeddingService)();
    const llm = new (load('rag/llm/llm.service.js').LlmService)();
    const hybrid = new (load('rag/embedding/hybrid-search.service.js').HybridSearchService)(prisma, embedding);
    const reranker = new (load('rag/embedding/reranker.service.js').RerankerService)();
    const expansion = new (load('rag/embedding/query-expansion.service.js').QueryExpansionService)(llm);
    const chunker = new (load('rag/ingestion/semantic-chunker.service.js').SemanticChunkerService)();
    service = new contract.RagService(prisma, extractor, embedding, llm, hybrid, reranker, expansion, chunker);
    const result = await service.reindexAll({ signal: controller.signal, semantic: false });
    process.stdout.write(JSON.stringify({ status: result.errors.length ? 'partial' : 'complete', mode: 'lexical', indexed: result.indexed, errorsCount: result.errors.length, errorsMayBeTruncated: result.errors.length === 100, durationMs: Date.now() - started, modelsEnabled: false }) + '\n');
    if (result.errors.length) process.exitCode = 2;
  } catch (error) {
    // Do not emit exception messages, document IDs, filenames, URLs, SQL or configuration values.
    const safeCodes = ['usage', 'os_root_required', 'qualified_node24_required', 'maintenance_mode_active', 'database_configuration_required', 'local_database_required', 'absolute_storage_path_required', 'storage_directory_required', 'database_identity_mismatch', 'qualified_rag_build_required'];
    const code = interrupted ? 'cancelled' : safeCodes.includes(error?.message) ? error.message : 'maintenance_failed';
    process.stdout.write(JSON.stringify({ status: 'stopped', mode: 'lexical', code, durationMs: Date.now() - started, modelsEnabled: false }) + '\n');
    process.exitCode = interrupted === 'SIGINT' ? 130 : interrupted ? 143 : 1;
  } finally {
    service?.onModuleDestroy();
    await prisma?.$disconnect();
    process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', terminate);
  }
}
if (require.main === module) void run();
module.exports = { validateConfig };
