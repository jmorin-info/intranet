import { chromium, type FullConfig } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Global setup — performs one SUPER_ADMIN login and saves the browser storage
 * state (cookies + localStorage) to `e2e/.auth/admin.json`. All "authenticated"
 * projects reuse this file via `use.storageState`, avoiding the cost and
 * flakiness of logging in on every spec.
 *
 * If login fails (network, backend down, creds wrong) we write an EMPTY
 * storage state so the unauthenticated project can still run and
 * authenticated specs will fail fast with a clear error rather than a cryptic
 * "File not found: admin.json".
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL =
    (config.projects[0]?.use?.baseURL as string | undefined) ||
    process.env.BASE_URL ||
    'http://10.33.120.55:3001';

  const email = process.env.E2E_ADMIN_EMAIL || 'jmorin@omnitech-security.fr';
  const password = process.env.E2E_ADMIN_PASSWORD || 'Admin123!';

  const authDir = path.join(__dirname, '.auth');
  const authFile = path.join(authDir, 'admin.json');
  fs.mkdirSync(authDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  try {
    await page.goto('/login', { timeout: 15_000 });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    // Wait for either dashboard (success) or MFA challenge (also valid — user
    // is partially authenticated); fallback: just wait a moment.
    await Promise.race([
      page.waitForURL('**/dashboard', { timeout: 15_000 }),
      page.waitForURL('**/mfa/**', { timeout: 15_000 }),
    ]).catch(() => {
      /* allow fallback */
    });
    await context.storageState({ path: authFile });
    // eslint-disable-next-line no-console
    console.log(`[e2e] storageState written to ${authFile}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      '[e2e] global-setup login failed — writing empty storageState. Authenticated specs will fail.',
      (err as Error).message,
    );
    fs.writeFileSync(authFile, JSON.stringify({ cookies: [], origins: [] }));
  } finally {
    await browser.close();
  }
}
