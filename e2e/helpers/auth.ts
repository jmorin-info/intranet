import fs from 'node:fs';
import path from 'node:path';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { assertTestEnvironment, testApiUrl, requireTestCredentials } from './test-environment';
import { testMfaCode, waitForTotpWindow } from './totp';
import { waitForLoginSlot } from './login-budget';

export type TestRole = 'ADMIN' | 'COLLAB' | 'SUPER_ADMIN';
const expectedRoles = { ADMIN: 'ADMIN', COLLAB: 'COLLABORATEUR', SUPER_ADMIN: 'SUPER_ADMIN' } as const;
const filenames = { ADMIN: 'administrator.json', COLLAB: 'collaborator.json', SUPER_ADMIN: 'super-admin.json' } as const;
export const authDirectory = path.resolve(__dirname, '../.auth');
export function roleStateFile(role: TestRole): string { return path.join(authDirectory, filenames[role]); }

export function credentialsFor(role: TestRole) {
  return { ...requireTestCredentials(role), mfaCode: testMfaCode(role) };
}

// Getters generate a current OTP for API specs that pass this object directly.
export const ADMIN_CREDS = {
  get email() { return process.env.E2E_ADMIN_EMAIL || ''; },
  get password() { return process.env.E2E_ADMIN_PASSWORD || ''; },
  get mfaCode() { return testMfaCode('ADMIN'); },
};
export const COLLAB_CREDS = {
  get email() { return process.env.E2E_COLLAB_EMAIL || ''; },
  get password() { return process.env.E2E_COLLAB_PASSWORD || ''; },
  get mfaCode() { return testMfaCode('COLLAB'); },
};

export async function assertAuthenticated(request: APIRequestContext, role: TestRole): Promise<void> {
  const response = await request.get(`${testApiUrl()}/auth/me`, { failOnStatusCode: false, maxRedirects: 0 });
  if (!response.ok()) throw new Error(`[e2e] /auth/me failed for ${role}: ${response.status()}.`);
  const user = await response.json();
  if (user?.email !== requireTestCredentials(role).email || user?.role !== expectedRoles[role] || user?.mfaEnabled !== true) {
    throw new Error(`[e2e] Authenticated identity, role or MFA state differs from the ${role} fixture.`);
  }
}

/** Real password + OTP login. Never accepts an MFA challenge as a session. */
export async function authenticateRequest(request: APIRequestContext, role: TestRole): Promise<void> {
  assertTestEnvironment();
  for (let attempt = 0; attempt < 3; attempt++) {
    await waitForLoginSlot();
    await waitForTotpWindow();
    const response = await request.post(`${testApiUrl()}/auth/login`, {
      data: credentialsFor(role), failOnStatusCode: false, maxRedirects: 0,
    });
    if (response.status() === 429 && attempt < 2) {
      // Respect the real guard; do not raise its limit or fabricate proxy IPs.
      const seconds = Number(response.headers()['retry-after'] || '60');
      await new Promise((resolve) => setTimeout(resolve, Math.min(65, Math.max(1, seconds)) * 1000));
      continue;
    }
    if (!response.ok()) throw new Error(`[e2e] Login failed for ${role}: ${response.status()}.`);
    const body = await response.json();
    if (body?.mfaRequired || body?.mfaSetupRequired || !body?.user) {
      throw new Error(`[e2e] ${role} login is incomplete. Seed MFA and provide its explicit synthetic TOTP secret.`);
    }
    await assertAuthenticated(request, role);
    return;
  }
  throw new Error(`[e2e] Login rate limit did not clear for ${role}.`);
}

export async function saveRoleState(context: BrowserContext, role: TestRole): Promise<void> {
  fs.mkdirSync(authDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(authDirectory, 0o700);
  await context.storageState({ path: roleStateFile(role) });
  fs.chmodSync(roleStateFile(role), 0o600);
}

export async function loginAsRole(page: Page, role: TestRole): Promise<void> {
  assertTestEnvironment();
  const file = roleStateFile(role);
  let restored = false;
  if (fs.existsSync(file)) {
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(state.cookies) && state.cookies.length) {
      await page.context().clearCookies();
      await page.context().addCookies(state.cookies);
      try { await assertAuthenticated(page.request, role); restored = true; } catch { /* Fresh real login below. */ }
    }
  }
  if (!restored) {
    await authenticateRequest(page.request, role);
    await saveRoleState(page.context(), role);
  }
  await page.goto('/dashboard');
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

export const loginAsAdmin = (page: Page) => loginAsRole(page, 'ADMIN');
export const loginAsCollaborateur = (page: Page) => loginAsRole(page, 'COLLAB');

export async function logout(page: Page): Promise<void> {
  const response = await page.request.post(`${testApiUrl()}/auth/logout`, { failOnStatusCode: false, maxRedirects: 0 });
  if (!response.ok()) throw new Error(`[e2e] Logout failed: ${response.status()}.`);
  await page.context().clearCookies();
  await page.goto('/login');
}

export async function resetTestUser(_id: string): Promise<void> {
  // Test data lives in a disposable database. There is no production reset API.
}
