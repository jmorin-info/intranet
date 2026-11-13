'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const source = process.env.INTRANET_INTEGRATION_SOURCE;
const runDir = process.env.INTEGRATION_RUN_DIR;
assert.equal(Number(process.versions.node.split('.')[0]), 24, 'Qualify this release on Node24');
assert.equal(process.env.INTEGRATION_ALLOWED, 'throwaway-postgres-only');
const url = new URL(process.env.INTRANET_INTEGRATION_DATABASE_URL);
assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '5432');
assert.equal(url.username, 'session_it'); assert.match(url.pathname, /^\/session_it_[a-f0-9]+$/);
const localRequire = createRequire(path.join(source, 'apps/backend/package.json'));
const { PrismaClient } = localRequire('@prisma/client');
const { JwtService } = localRequire('@nestjs/jwt');
const dist = process.env.INTRANET_INTEGRATION_BACKEND_DIST;
const { AuthService } = require(path.join(dist, 'auth/auth.service.js'));
const { JwtStrategy } = require(path.join(dist, 'auth/strategies/jwt.strategy.js'));
const prisma = new PrismaClient({ datasources: { db: { url: url.href } } });
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = crypto.randomBytes(48).toString('hex');
process.env.JWT_REFRESH_SECRET = crypto.randomBytes(48).toString('hex');
const jwt = new JwtService({ secret: process.env.JWT_ACCESS_SECRET, signOptions: { expiresIn: '15m' } });
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const report = { status: 'running', tests: [], totals: { scenarios: 0, checks: 0 }, application: { source, authSha256: digest(fs.readFileSync(path.join(dist, 'auth/auth.service.js'))), tokenSha256: digest(fs.readFileSync(path.join(dist, 'auth/session-refresh-token.js'))), strategySha256: digest(fs.readFileSync(path.join(dist, 'auth/strategies/jwt.strategy.js'))) }, safety: { database: url.pathname.slice(1), host: url.hostname, port: 5432, noProductionData: true, applicationServerStarted: false, externalNotifications: false, projectSeedExecuted: false } };
let user;
const users = { findById: id => prisma.user.findUnique({ where: { id } }) };
const audit = { log: async () => undefined };
function service(db = prisma, issuer = jwt) { return new AuthService(db, issuer, users, {}, audit, {}); }
const auth = service();
const strategy = new JwtStrategy(prisma, { get: async () => null, set: async () => undefined });
function check(value, message) { report.totals.checks++; assert.ok(value, message); }
function eq(actual, expected, message) { report.totals.checks++; assert.deepStrictEqual(actual, expected, message); }
async function denied(operation) { let failure; try { await operation(); } catch (error) { failure = error; } check(failure, 'operation must fail'); eq(failure.getStatus(), 401, 'operation must return401'); }
function save() { fs.writeFileSync(path.join(runDir, 'results.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); }
async function test(name, fn) {
  await prisma.refreshToken.deleteMany({}); await prisma.appConfig.deleteMany({});
  const before = report.totals.checks, start = Date.now();
  try { await fn(); report.tests.push({ name, status: 'passed', checks: report.totals.checks - before, durationMs: Date.now() - start }); report.totals.scenarios++; save(); process.stdout.write('PASS ' + name + '\n'); }
  catch (error) { report.tests.push({ name, status: 'failed', error: String(error?.message || error).replaceAll(url.href, '[TEST_DB]').replaceAll(decodeURIComponent(url.password), '[TEST_DB_PASSWORD]') }); throw error; }
}
function session() { return auth.login(user, '127.0.0.1', 'isolated-test', true); }
function claims(result) { return jwt.verify(result.accessToken); }
function proxyDb(overrides) { return new Proxy(prisma, { get(target, key) { if (key in overrides) return overrides[key]; const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; } }); }
(async () => {
  report.databaseVersion = (await prisma.$queryRawUnsafe('SELECT version() AS version'))[0].version;
  user = await prisma.user.create({ data: { email: 'isolated-session@example.test', firstName: 'Session', lastName: 'Proof', role: 'COLLABORATEUR', passwordHash: 'NO_LOGIN_PASSWORD_IN_THIS_FIXTURE' } });
  await test('revoke-one-login-refresh-and-access-other-login-survives', async () => {
    const a = await session(), b = await session();
    eq((await strategy.validate(claims(a))).id, user.id);
    eq(await auth.logoutSession(a.refreshToken), true);
    await denied(() => auth.refreshTokens(a.refreshToken, '127.0.0.1', 'test'));
    await denied(() => strategy.validate(claims(a)));
    eq((await strategy.validate(claims(b))).sid, claims(b).sid);
    const refreshedB = await auth.refreshTokens(b.refreshToken, '127.0.0.1', 'test');
    eq(claims(refreshedB).sid, claims(b).sid);
    eq(await auth.logoutSession(a.refreshToken), true, 'already revoked proof is idempotent');
  });
  await test('one-time-rotation-and-old-proof-revocation-mfa-invariant', async () => {
    const initial = await session(), before = claims(initial);
    const mfa = new Date('2026-01-01T00:00:00Z');
    await prisma.refreshToken.update({ where: { id: before.sid }, data: { mfaValidatedAt: mfa } });
    const results = await Promise.allSettled([auth.refreshTokens(initial.refreshToken, '127.0.0.1', 'one'), auth.refreshTokens(initial.refreshToken, '127.0.0.1', 'two')]);
    eq(results.filter(r => r.status === 'fulfilled').length, 1);
    eq(results.find(r => r.status === 'rejected').reason.getStatus(), 401);
    const rotated = results.find(r => r.status === 'fulfilled').value;
    eq(claims(rotated).sid, before.sid);
    eq(claims(rotated).mfaValidatedAt, mfa.getTime());
    eq((await prisma.refreshToken.findUnique({ where: { id: before.sid } })).mfaValidatedAt.getTime(), mfa.getTime());
    eq(await auth.logoutSession(initial.refreshToken), true);
    await denied(() => auth.refreshTokens(rotated.refreshToken, '127.0.0.1', 'test'));
    await denied(() => strategy.validate(claims(rotated)));
  });
  await test('logout-before-refresh-cas-cannot-revive-session', async () => {
    const initial = await session(); let arrived, release;
    const reached = new Promise(resolve => { arrived = resolve; });
    const held = new Promise(resolve => { release = resolve; });
    const delegate = new Proxy(prisma.refreshToken, { get(target, key) { if (key !== 'findFirst') return target[key]; return async args => { const row = await target.findFirst(args); arrived(); await held; return row; }; } });
    const rotating = service(proxyDb({ refreshToken: delegate })).refreshTokens(initial.refreshToken, '127.0.0.1', 'test').then(value => ({ value }), error => ({ error }));
    await reached; eq(await auth.logoutSession(initial.refreshToken), true); release();
    eq((await rotating).error.getStatus(), 401);
    await denied(() => strategy.validate(claims(initial)));
  });
  await test('logout-blocked-by-inflight-refresh-commit-still-revokes-stable-sid', async () => {
    const initial = await session(); let arrived, release;
    const reached = new Promise(resolve => { arrived = resolve; }); const held = new Promise(resolve => { release = resolve; });
    const wrapped = proxyDb({ $transaction: fn => prisma.$transaction(async tx => { const value = await fn(tx); arrived(); await held; return value; }, { timeout: 10000 }) });
    const rotating = service(wrapped).refreshTokens(initial.refreshToken, '127.0.0.1', 'test');
    await reached;
    const loggingOut = auth.logoutSession(initial.refreshToken);
    let lockSeen = false;
    for (let n = 0; n < 100; n++) {
      const result = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%RefreshToken%'`);
      if (result[0].count > 0) { lockSeen = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    release();
    const rotated = await rotating; eq(await loggingOut, true); check(lockSeen, 'actual PostgreSQL row lock observed');
    await denied(() => auth.refreshTokens(rotated.refreshToken, '127.0.0.1', 'test'));
    await denied(() => strategy.validate(claims(rotated)));
  });
  await test('legacy-bridge-original-expiry-and-post-rotation-logout', async () => {
    const id = crypto.randomUUID(), token = crypto.randomUUID(), expiresAt = new Date(Date.now() + 60_000);
    await prisma.refreshToken.create({ data: { id, userId: user.id, tokenHash: digest(token), expiresAt, userAgent: 'old-cookie' } });
    const rotated = await auth.refreshTokens(token, '127.0.0.1', 'test');
    const bridge = JSON.parse((await prisma.appConfig.findUnique({ where: { key: `auth.legacy-refresh.${digest(token)}` } })).value);
    eq(bridge, { sessionId: id, userId: user.id, expiresAt: expiresAt.getTime() });
    eq(claims(rotated).sid, id);
    eq(await auth.logoutSession(token), true);
    await denied(() => auth.refreshTokens(rotated.refreshToken, '127.0.0.1', 'test'));
  });
  await test('legacy-bridge-and-token-cas-roll-back-together', async () => {
    const id = crypto.randomUUID(), token = crypto.randomUUID(), hash = digest(token);
    await prisma.refreshToken.create({ data: { id, userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now() + 60_000), userAgent: 'old-cookie' } });
    const failing = proxyDb({ $transaction: fn => prisma.$transaction(tx => fn(new Proxy(tx, { get(target, key) { if (key !== 'appConfig') return target[key]; return { upsert: async () => { throw new Error('injected bridge failure'); } }; } }))) });
    let failed; try { await service(failing).refreshTokens(token, '127.0.0.1', 'test'); } catch (error) { failed = error; }
    eq(failed?.message, 'injected bridge failure');
    eq((await prisma.refreshToken.findUnique({ where: { id } })).tokenHash, hash, 'SQL update must roll back');
    eq(await prisma.appConfig.count(), 0);
    const successful = await auth.refreshTokens(token, '127.0.0.1', 'test'); eq(claims(successful).sid, id);
  });
  await test('expired-access-can-only-revoke-its-own-sid', async () => {
    const expiredIssuer = service(prisma, new JwtService({ secret: process.env.JWT_ACCESS_SECRET, signOptions: { expiresIn: -1 } }));
    const issued = await expiredIssuer.login(user, '127.0.0.1', 'expired-issuer');
    const other = await session();
    eq(await auth.logoutSession(undefined, issued.accessToken), true);
    await denied(() => auth.refreshTokens(issued.refreshToken, '127.0.0.1', 'test'));
    eq((await strategy.validate(claims(other))).sid, claims(other).sid);
    eq(await auth.logoutSession(undefined, 'invalid-token'), false);
  });
  report.status = 'passed'; save(); process.stdout.write(JSON.stringify({ status: report.status, totals: report.totals }) + '\n');
})().catch(error => { report.status = 'failed'; save(); process.stderr.write(String(error.message).replaceAll(url.href, '[TEST_DB]').replaceAll(decodeURIComponent(url.password), '[TEST_DB_PASSWORD]') + '\n'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
