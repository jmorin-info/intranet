'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

const source = process.env.INTRANET_INTEGRATION_SOURCE;
const runDir = process.env.INTEGRATION_RUN_DIR;
assert.ok(process.env.INTRANET_INTEGRATION_DATABASE_URL, 'An explicit dedicated integration URL is required; DATABASE_URL is never inherited');
const url = new URL(process.env.INTRANET_INTEGRATION_DATABASE_URL);
assert.equal(url.protocol, 'postgresql:');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, process.env.INTEGRATION_PG_PORT);
assert.equal(decodeURIComponent(url.username), 'approval_it');
assert.match(url.pathname, /^\/approval_it_[a-z0-9]+$/);
assert.ok(source && runDir && process.env.INTEGRATION_ALLOWED === 'throwaway-postgres-only');
const localRequire = createRequire(path.join(source, 'apps/backend/package.json'));
const { PrismaClient } = localRequire('@prisma/client');
const backendDist = process.env.INTRANET_INTEGRATION_BACKEND_DIST || path.join(source, 'apps/backend/dist');
const enginePath = path.join(backendDist, 'approval-workflows/workflow-engine.service.js');
const runtimePath = path.join(backendDist, 'approval-workflows/workflow-runtime.service.js');
const { WorkflowEngineService } = require(enginePath);
const { WorkflowRuntimeService } = require(runtimePath);
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
const runtime = new WorkflowRuntimeService(prisma, new WorkflowEngineService(prisma));
const runTag = path.basename(runDir).replace(/[^a-z0-9]/gi, '').toLowerCase();
const users = {};
let checkCount = 0;
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), status: 'running', tests: [],
  application: { source, runtimeSha256: hash(runtimePath), engineSha256: hash(enginePath), transactionSha256: hash(path.join(backendDist, 'approval-workflows/workflow-transaction.js')), schemaSha256: hash(path.join(source, 'packages/database/prisma/schema.prisma')) },
  safety: { database: decodeURIComponent(url.pathname.slice(1)), host: url.hostname, port: url.port,
    noProductionData: true, applicationServerStarted: false, externalNotifications: false, projectSeedExecuted: false } };

function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function equal(actual, expected, message) { checkCount++; assert.deepStrictEqual(actual, expected, message); }
function ok(value, message) { checkCount++; assert.ok(value, message); }
function sanitize(error) {
  return String(error?.stack || error).split(process.env.INTRANET_INTEGRATION_DATABASE_URL).join('[TEST_DATABASE_URL]').split(decodeURIComponent(url.password)).join('[TEST_PASSWORD]');
}
function saveReport() {
  report.checks = checkCount;
  const filename = path.join(runDir, 'results.json');
  const fd = fs.openSync(filename, 'w', 0o600);
  fs.writeFileSync(fd, JSON.stringify(report, null, 2) + '\n'); fs.fsyncSync(fd); fs.closeSync(fd);
}
async function test(name, operation) {
  if (process.env.INTEGRATION_ONLY && !new RegExp(process.env.INTEGRATION_ONLY, 'i').test(name)) return;
  const before = checkCount, started = Date.now();
  try {
    const evidence = await operation();
    report.tests.push({ name, status: 'passed', checks: checkCount - before, durationMs: Date.now() - started, evidence });
    process.stdout.write(`PASS ${name}\n`);
    saveReport();
  } catch (error) {
    report.tests.push({ name, status: 'failed', checks: checkCount - before, durationMs: Date.now() - started, error: sanitize(error) });
    throw error;
  }
}
async function throwsStatus(operation, status) {
  let error;
  try { await operation(); } catch (caught) { error = caught; }
  ok(error, 'operation must reject');
  equal(error.getStatus?.(), status, 'HTTP domain error status');
}
function fulfilled(results) { return results.filter(result => result.status === 'fulfilled'); }
function rejected(results) { return results.filter(result => result.status === 'rejected'); }
function statusOf(error) { if (typeof error?.getStatus === 'function') return error.getStatus(); throw new Error(`Unexpected rejection: ${sanitize(error)}`); }
async function events(instanceId, action) { return prisma.approvalAuditLog.count({ where: { approvalInstanceId: instanceId, ...(action ? { action } : {}) } }); }
async function notices(documentId, type) { return prisma.notification.count({ where: { resourceType: 'Document', resourceId: documentId, ...(type ? { type } : {}) } }); }
async function read(instanceId) { return prisma.approvalInstance.findUniqueOrThrow({ where: { id: instanceId }, include: { stepResults: true } }); }
async function fixture(name, options = {}) {
  const doc = await prisma.document.create({ data: { title: `Intégration ${name}`, reference: `IT_${runTag}_${crypto.randomUUID()}`, category: 'POLICY', classification: 'INTERNE', scanStatus: 'CLEAN', status: options.status || 'DRAFT', ownerId: users.owner.id } });
  const version = await prisma.documentVersion.create({ data: { documentId: doc.id, versionNumber: '1.0', fileUrl: '/integration/not-a-real-file.txt', fileType: 'text/plain', fileSizeBytes: 0, checksum: crypto.createHash('sha256').update('integration-only').digest('hex'), uploadedById: users.owner.id } });
  await prisma.document.update({ where: { id: doc.id }, data: { currentVersionId: version.id } });
  const steps = [{ name: 'Avis métier', mode: options.parallel ? 'PARALLEL_ALL' : 'SINGLE', approverRole: 'REVIEWER', slaHours: 24, minApprovers: 1 }];
  if (options.twoStages) steps.push({ name: 'Validation finale', mode: 'SINGLE', approverUserId: users.admin.id, slaHours: 24, minApprovers: 1 });
  const workflow = await prisma.approvalWorkflow.create({ data: { name: `IT ${runTag} ${name}`, createdById: users.admin.id, isActive: true, steps: { create: steps.map((step, index) => ({ ...step, order: index + 1 })) } }, include: { steps: { orderBy: { order: 'asc' } } } });
  const instance = options.noStart ? null : await runtime.start(workflow.id, doc.id, version.id, users.owner.id);
  return { doc, version, workflow, instance, first: instance?.stepResults.find(row => row.stepId === workflow.steps[0].id) };
}

async function main() {
  await prisma.$connect();
  const [identity] = await prisma.$queryRaw`SELECT current_database() AS database, current_user AS username, host(inet_server_addr()) AS address, inet_server_port() AS port, version() AS version`;
  equal(identity.database, decodeURIComponent(url.pathname.slice(1)), 'only the disposable database may be used');
  equal(identity.username, 'approval_it', 'only the disposable database account may be used');
  equal(identity.address, '127.0.0.1', 'the database server must be the private loopback endpoint');
  equal(identity.port, Number(process.env.INTEGRATION_PG_PORT), 'the actual server port must match');
  report.postgresql = identity.version;
  for (const [name, role] of [['owner', 'COLLABORATEUR'], ['reviewer', 'REVIEWER'], ['second', 'REVIEWER'], ['admin', 'ADMIN']]) {
    users[name] = await prisma.user.create({ data: { email: `${runTag}-${name}@integration.invalid`, passwordHash: 'INTEGRATION_ONLY_NO_LOGIN', firstName: 'Test', lastName: name, role, isActive: true } });
  }

  await test('concurrent different actors: exactly one single-step decision wins (5 trials)', async () => {
    const trials = [];
    for (let index = 0; index < 5; index++) {
      const f = await fixture(`different-actors-${index}`);
      const results = await Promise.allSettled([runtime.decide(f.first.id, users.reviewer.id, 'APPROVED', 'Conforme A'), runtime.decide(f.first.id, users.second.id, 'APPROVED', 'Conforme B')]);
      equal(fulfilled(results).length, 1); equal(rejected(results).length, 1); equal(statusOf(rejected(results)[0].reason), 409);
      equal((await read(f.instance.id)).status, 'APPROVED');
      equal(await events(f.instance.id, 'APPROVAL_STEP_APPROVED'), 1); equal(await events(f.instance.id, 'APPROVAL_APPROVED'), 1);
      trials.push({ fulfilled: 1, conflicted: 1, decisionAudits: 1, completionAudits: 1 });
    }
    return trials;
  });

  await test('concurrent repeated submission by the same actor is idempotent (5 trials)', async () => {
    for (let index = 0; index < 5; index++) {
      const f = await fixture(`double-click-${index}`, { twoStages: true });
      const results = await Promise.allSettled([runtime.decide(f.first.id, users.reviewer.id, 'APPROVED', 'Premier envoi'), runtime.decide(f.first.id, users.reviewer.id, 'APPROVED', 'Premier envoi')]);
      equal(fulfilled(results).length, 2); equal(rejected(results).length, 0);
      equal((await read(f.instance.id)).currentStepOrder, 2); equal(await events(f.instance.id, 'APPROVAL_STEP_APPROVED'), 1);
      equal(await events(f.instance.id, 'APPROVAL_STEP_ACTIVATED'), 2); equal(await notices(f.doc.id), 3, 'initial two reviewers and next one admin, once');
    }
    return { trials: 5, successfulRequests: 10, decisionAudits: 5, duplicatedNextStageNotifications: 0 };
  });

  await test('parallel unanimous decisions advance once without a lost vote (5 trials)', async () => {
    for (let index = 0; index < 5; index++) {
      const f = await fixture(`parallel-${index}`, { parallel: true, twoStages: true });
      const a = f.instance.stepResults.find(row => row.stepId === f.workflow.steps[0].id && row.assignedToId === users.reviewer.id);
      const b = f.instance.stepResults.find(row => row.stepId === f.workflow.steps[0].id && row.assignedToId === users.second.id);
      const results = await Promise.allSettled([runtime.decide(a.id, users.reviewer.id, 'APPROVED'), runtime.decide(b.id, users.second.id, 'APPROVED')]);
      equal(fulfilled(results).length, 2); equal(rejected(results).length, 0);
      const state = await read(f.instance.id); equal(state.currentStepOrder, 2); equal(state.stepResults.filter(row => row.decision === 'APPROVED').length, 2);
      equal(await events(f.instance.id, 'APPROVAL_STEP_APPROVED'), 2); equal(await events(f.instance.id, 'APPROVAL_STEP_ACTIVATED'), 2); equal(await notices(f.doc.id), 3);
    }
    return { trials: 5, successfulVotes: 10, transitions: 5, lostVotes: 0, duplicateNotifications: 0 };
  });

  await test('concurrent starts create one pending instance and one durable start audit', async () => {
    const f = await fixture('double-start', { noStart: true });
    const results = await Promise.allSettled([runtime.start(f.workflow.id, f.doc.id, f.version.id, users.owner.id), runtime.start(f.workflow.id, f.doc.id, f.version.id, users.owner.id)]);
    equal(fulfilled(results).length, 1); equal(rejected(results).length, 1); equal(statusOf(rejected(results)[0].reason), 409);
    equal(await prisma.approvalInstance.count({ where: { documentId: f.doc.id, status: 'PENDING' } }), 1);
    equal(await notices(f.doc.id), 2);
    const id = fulfilled(results)[0].value.id; equal(await events(id, 'APPROVAL_STARTED'), 1);
    return { instances: 1, startAudits: 1, initialNotifications: 2 };
  });

  await test('rejection returns for correction and repeated rejection does not duplicate owner notification', async () => {
    const f = await fixture('rejection', { status: 'IN_REVIEW', twoStages: true });
    const request = await prisma.validationRequest.create({ data: { documentId: f.doc.id, documentVersionId: f.version.id, requestedById: users.owner.id, currentStep: 'REVIEW', status: 'PENDING', steps: { create: { stepType: 'REVIEW', assignedToId: users.reviewer.id } } } });
    await runtime.decide(f.first.id, users.reviewer.id, 'REJECTED', 'Préciser le périmètre des contrôles.');
    await runtime.decide(f.first.id, users.reviewer.id, 'REJECTED', 'Le double envoi ne remplace pas le motif.');
    const state = await read(f.instance.id);
    equal(state.status, 'REJECTED'); equal(state.stepResults.filter(row => row.decision === 'PENDING').length, 0);
    equal(state.stepResults.find(row => row.id === f.first.id).comment, 'Préciser le périmètre des contrôles.');
    equal((await prisma.document.findUniqueOrThrow({ where: { id: f.doc.id } })).status, 'DRAFT');
    equal((await prisma.validationRequest.findUniqueOrThrow({ where: { id: request.id } })).status, 'REJECTED');
    equal(await events(f.instance.id, 'APPROVAL_STEP_REJECTED'), 1); equal(await events(f.instance.id, 'APPROVAL_REJECTED'), 1); equal(await notices(f.doc.id, 'DOC_REJECTED'), 1);
    return { status: state.status, qualityRequest: 'REJECTED', pendingVotes: 0, ownerRejectionNotifications: 1 };
  });

  await test('concurrent cancellation is idempotent with one cancellation audit', async () => {
    const f = await fixture('cancellation', { twoStages: true });
    const results = await Promise.allSettled([runtime.cancel(f.instance.id, users.admin.id), runtime.cancel(f.instance.id, users.admin.id)]);
    equal(fulfilled(results).length, 2); equal(rejected(results).length, 0);
    const state = await read(f.instance.id); equal(state.status, 'CANCELLED'); ok(state.stepResults.every(row => row.decision === 'SKIPPED'));
    equal(await events(f.instance.id, 'APPROVAL_CANCELLED'), 1);
    await throwsStatus(() => runtime.decide(f.first.id, users.reviewer.id, 'APPROVED'), 409);
    return { cancellationAudits: 1, pendingVotes: 0 };
  });

  await test('approval versus cancellation has a single terminal winner (5 trials)', async () => {
    const winners = [];
    for (let index = 0; index < 5; index++) {
      const f = await fixture(`cancel-race-${index}`);
      const results = await Promise.allSettled([runtime.decide(f.first.id, users.reviewer.id, 'APPROVED'), runtime.cancel(f.instance.id, users.admin.id)]);
      equal(fulfilled(results).length, 1); equal(rejected(results).length, 1); equal(statusOf(rejected(results)[0].reason), 409);
      const state = await read(f.instance.id); ok(['APPROVED', 'CANCELLED'].includes(state.status));
      equal((await events(f.instance.id, 'APPROVAL_APPROVED')) + (await events(f.instance.id, 'APPROVAL_CANCELLED')), 1);
      equal(state.stepResults.filter(row => row.decision === 'PENDING').length, 0); winners.push(state.status);
    }
    return { trials: 5, winners, terminalAuditsPerTrial: 1 };
  });

  await test('concurrent daily reminders commit one marker and one notification per recipient (5 trials)', async () => {
    for (let index = 0; index < 5; index++) {
      const f = await fixture(`reminder-${index}`, { twoStages: true });
      const before = await notices(f.doc.id);
      const today = new Date('2026-11-12T22:30:00Z'); // 23:30 Paris
      const results = await Promise.all([runtime.remind(f.instance.id, users.owner.id, false, today), runtime.remind(f.instance.id, users.admin.id, false, today)]);
      equal(results.reduce((sum, result) => sum + result.sent, 0), 2); equal(results.filter(result => result.alreadySent).length, 1);
      equal(await events(f.instance.id, 'APPROVAL_REMINDER_SENT'), 1); equal((await notices(f.doc.id)) - before, 2);
      const nextDay = new Date('2026-11-12T23:30:00Z'); // 00:30 Paris, only one hour later
      equal((await runtime.remind(f.instance.id, users.owner.id, false, nextDay)).sent, 2);
      equal((await runtime.remind(f.instance.id, users.owner.id, false, nextDay)).alreadySent, true);
      equal(await events(f.instance.id, 'APPROVAL_REMINDER_SENT'), 2); equal((await notices(f.doc.id)) - before, 4);
    }
    return { trials: 5, concurrentSameDayCalls: 10, sameDayMarkers: 5, recipientsPerReminder: 2, parisMidnightBoundaryValidated: true };
  });

  await test('permissions and future-stage guards reject before any write', async () => {
    const f = await fixture('permissions', { twoStages: true });
    const before = await events(f.instance.id), notificationCount = await notices(f.doc.id);
    await throwsStatus(() => runtime.decide(f.first.id, users.owner.id, 'APPROVED'), 403);
    await throwsStatus(() => runtime.decide(f.first.id, users.admin.id, 'APPROVED'), 403);
    const future = f.instance.stepResults.find(row => row.stepId === f.workflow.steps[1].id);
    await throwsStatus(() => runtime.decide(future.id, users.admin.id, 'APPROVED'), 409);
    equal(await events(f.instance.id), before); equal(await notices(f.doc.id), notificationCount);
    return { deniedRequests: 3, addedAudits: 0, addedNotifications: 0 };
  });

  await test('legacy pending circuits on published, archived or obsolete documents are inert', async () => {
    for (const status of ['APPROVED', 'ARCHIVED', 'OBSOLETE']) {
      const f = await fixture(`terminal-${status}`);
      await prisma.document.update({ where: { id: f.doc.id }, data: { status } });
      const before = await notices(f.doc.id), auditCount = await events(f.instance.id);
      ok(!(await runtime.pending(users.reviewer.id)).some(row => row.instanceId === f.instance.id));
      await throwsStatus(() => runtime.decide(f.first.id, users.reviewer.id, 'APPROVED'), 409);
      await throwsStatus(() => runtime.remind(f.instance.id, users.owner.id), 409);
      equal(await notices(f.doc.id), before); equal(await events(f.instance.id), auditCount);
    }
    return { documentStates: 3, deniedMutations: 6, addedNotifications: 0 };
  });

  assert.ok(report.tests.length > 0, 'The case filter selected no scenario');
  report.status = 'passed'; report.finishedAt = new Date().toISOString();
  report.totals = { scenarios: report.tests.length, checks: checkCount, successfulScenarios: report.tests.filter(test => test.status === 'passed').length,
    syntheticUsers: await prisma.user.count(), syntheticDocuments: await prisma.document.count(), auditRows: await prisma.approvalAuditLog.count(), internalNotificationRows: await prisma.notification.count() };
  saveReport();
  process.stdout.write(`PASS ${report.totals.scenarios} scenarios, ${checkCount} assertions; no external notification transport started\n`);
}
main().catch(error => { report.status = 'failed'; report.finishedAt = new Date().toISOString(); report.error = sanitize(error); saveReport(); process.stderr.write('Integration failed; see private results.json\n'); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
