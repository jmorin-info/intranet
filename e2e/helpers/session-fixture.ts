import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import { ephemeralDatabaseUrl } from '../../scripts/e2e/ephemeral-database';
import { requireTestCredentials, testApiUrl } from './test-environment';
import { authenticateRequest, type TestRole } from './auth';

/** Age only a newly authenticated synthetic session, then let the real server
 * refresh and sign its JWT. No forged token or application guard override. */
export async function createStaleMfaSession(request: APIRequestContext, role: TestRole): Promise<void> {
  const url = ephemeralDatabaseUrl(); // Fails before login or database access.
  const email = requireTestCredentials(role).email;
  if (!/^[^@]+@(?:e2e\.local|example\.test)$/.test(email)) throw new Error('[e2e] Session aging requires a synthetic account.');
  const dbRequire = createRequire(path.resolve(__dirname, '../../packages/database/package.json'));
  const { PrismaClient } = dbRequire('@prisma/client') as typeof import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const marker = await prisma.appConfig.findUnique({ where: { key: 'e2e.fixture' } });
    if (marker?.value !== 'synthetic-only') throw new Error('[e2e] Disposable fixture marker missing.');
    await authenticateRequest(request, role);
    const cookie = (await request.storageState()).cookies.find((value) => value.name === 'refreshToken');
    if (!cookie) throw new Error('[e2e] Real login did not issue a refresh cookie.');
    const tokenHash = createHash('sha256').update(cookie.value).digest('hex');
    const session = await prisma.refreshToken.findFirst({ where: { tokenHash, user: { email }, revokedAt: null } });
    if (!session) throw new Error('[e2e] Newly issued synthetic session was not found.');
    await prisma.refreshToken.update({ where: { id: session.id }, data: { mfaValidatedAt: new Date(Date.now() - 13 * 60 * 60 * 1000) } });
    const response = await request.post(`${testApiUrl()}/auth/refresh`, { failOnStatusCode: false, maxRedirects: 0 });
    if (response.status() !== 200) throw new Error(`[e2e] Genuine stale-session refresh failed: ${response.status()}.`);
  } finally { await prisma.$disconnect(); }
}
