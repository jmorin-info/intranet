import { chromium, type FullConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { assertTestEnvironment, assertTestUrl, requireTestCredentials, testBaseUrl } from './helpers/test-environment';

/** Fresh test sessions only: no production target or stored administrator session. */
export default async function globalSetup(config: FullConfig) {
  assertTestEnvironment();
  const baseURL = assertTestUrl(config.projects[0]?.use?.baseURL || testBaseUrl(), 'baseURL');
  const authDir = path.join(__dirname, '.auth');
  const authFile = path.join(authDir, 'admin.json');
  fs.mkdirSync(authDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(authFile, JSON.stringify({ cookies: [], origins: [] }), { mode: 0o600 });
  fs.chmodSync(authFile, 0o600);
  if (process.env.E2E_SKIP_LOGIN === '1') return;
  const { email, password } = requireTestCredentials();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL });
    await context.route('**/*', (route) => {
      try { assertTestUrl(route.request().url(), 'requête de connexion'); }
      catch { return route.abort('blockedbyclient'); }
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto('/login', { timeout: 15_000 });
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    // A partial MFA login is not a valid authenticated fixture.
    await page.waitForURL('**/dashboard', { timeout: 15_000 });
    await context.storageState({ path: authFile });
    fs.chmodSync(authFile, 0o600);
  } finally { await browser.close(); }
}
