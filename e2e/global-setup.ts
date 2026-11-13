import { chromium, type FullConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { assertTestEnvironment, assertTestUrl, testBaseUrl } from './helpers/test-environment';
import { authenticateRequest, authDirectory, roleStateFile, saveRoleState, type TestRole } from './helpers/auth';

/** Fresh cookie sessions from the real backend, with real MFA verification. */
export default async function globalSetup(config: FullConfig) {
  assertTestEnvironment();
  const baseURL = assertTestUrl(config.projects[0]?.use?.baseURL || testBaseUrl(), 'baseURL');
  fs.mkdirSync(authDirectory, { recursive: true, mode: 0o700 });
  fs.chmodSync(authDirectory, 0o700);
  for (const file of ['admin.json', ...(['ADMIN', 'COLLAB', 'SUPER_ADMIN'] as const).map((role) => path.basename(roleStateFile(role)))]) {
    fs.writeFileSync(path.join(authDirectory, file), JSON.stringify({ cookies: [], origins: [] }), { mode: 0o600 });
    fs.chmodSync(path.join(authDirectory, file), 0o600);
  }
  if (process.env.E2E_SKIP_LOGIN === '1') return;
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
  try {
    const roles: TestRole[] = ['ADMIN'];
    if (process.env.E2E_COLLAB_EMAIL) roles.push('COLLAB');
    if (process.env.E2E_SUPER_ADMIN_EMAIL) roles.push('SUPER_ADMIN');
    for (const role of roles) {
      const context = await browser.newContext({ baseURL });
      try {
        await authenticateRequest(context.request, role);
        await saveRoleState(context, role);
      } finally { await context.close(); }
    }
    const defaultRole = roles.includes('SUPER_ADMIN') ? 'SUPER_ADMIN' : 'ADMIN';
    fs.copyFileSync(roleStateFile(defaultRole), path.join(authDirectory, 'admin.json'));
    fs.chmodSync(path.join(authDirectory, 'admin.json'), 0o600);
  } finally { await browser.close(); }
}
