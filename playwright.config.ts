import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

/**
 * Playwright configuration — OMNITECH Intranet E2E suite
 *
 * Strategy
 * --------
 * - Base URL configurable via BASE_URL env (defaults to preprod 10.33.120.55:3001)
 * - Global setup performs a single SUPER_ADMIN login and persists the session to
 *   `e2e/.auth/admin.json` (storageState). All "authenticated" projects reuse it.
 * - Three browsers (chromium, firefox, webkit) share the authenticated state.
 * - An additional `unauthenticated` project skips storageState for public flows
 *   (welcome, login, forgot-password...).
 * - Destructive tests are tagged `@destructive` / `@slow` and skipped by default
 *   on the preprod DB (10.33.120.55) unless `RUN_DESTRUCTIVE=1` is set.
 *
 * Running
 * -------
 *   pnpm test:e2e                                  # all projects
 *   pnpm test:e2e -- --project=chromium            # single browser
 *   pnpm test:e2e -- --project=unauthenticated     # public flows only
 *   BASE_URL=http://localhost:3001 pnpm test:e2e   # override target
 */

const BASE_URL = process.env.BASE_URL || 'http://10.33.120.55:3001';
const IS_CI = !!process.env.CI;
const AUTH_FILE = path.join(__dirname, 'e2e/.auth/admin.json');

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/helpers/**', '**/.auth/**', '**/global-setup.ts'],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: IS_CI ? 1 : 0,
  fullyParallel: true,
  forbidOnly: IS_CI,
  reporter: [['html', { open: 'never' }], ['list']],

  globalSetup: require.resolve('./e2e/global-setup'),

  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], storageState: AUTH_FILE },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], storageState: AUTH_FILE },
    },
    {
      name: 'unauthenticated',
      testMatch: /(auth|portal|pwa)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] } },
    },
  ],
});
