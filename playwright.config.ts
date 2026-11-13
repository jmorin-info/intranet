import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { assertTestEnvironment, testBaseUrl } from './e2e/helpers/test-environment';

/**
 * Real E2E suite for an isolated local/preproduction instance.
 * Production hosts are rejected, including public URLs in ignored .env files.
 * A fresh dedicated test account is required unless E2E_SKIP_LOGIN=1.
 * See e2e/README.md. Visual mock QA uses playwright.ui.config.ts instead.
 */
assertTestEnvironment();
const BASE_URL = testBaseUrl();
const IS_CI = !!process.env.CI;
const AUTH_FILE = path.join(__dirname, 'e2e/.auth/admin.json');

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/helpers/**', '**/.auth/**', '**/global-setup.ts', '**/ui/**'],
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: IS_CI ? 1 : 0,
  fullyParallel: false,
  workers: 1,
  forbidOnly: IS_CI,
  reporter: [['html', { open: 'never' }], ['list']],

  globalSetup: require.resolve('./e2e/global-setup'),

  use: {
    baseURL: BASE_URL,
    headless: true,
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE,
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined } },
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
      use: { ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] },
        launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined } },
    },
  ],
});
