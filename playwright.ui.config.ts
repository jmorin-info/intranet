import { defineConfig, devices } from '@playwright/test';
import { assertTestEnvironment } from './e2e/helpers/test-environment';

// Separate profile: no real login, no saved session, no database/backend server.
assertTestEnvironment();
const baseURL = 'http://127.0.0.1:17691';
export default defineConfig({
  testDir: './e2e/ui',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results/ui',
  reporter: [['list']],
  use: { baseURL, headless: true, serviceWorkers: 'block', storageState: { cookies: [], origins: [] },
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined },
    screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [{ name: 'ui-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'ui-mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }],
  webServer: [{ command: 'node e2e/ui/mock-api.mjs', url: 'http://127.0.0.1:17692/health', reuseExistingServer: false }, {
    command: 'corepack pnpm --filter @omnitech/frontend exec next dev -p 17691 -H 127.0.0.1',
    url: `${baseURL}/login`, timeout: 120_000, reuseExistingServer: false,
    env: { OMNITECH_UI_QA: '1', NEXT_PUBLIC_API_URL: `${baseURL}/api/v1`,
      NEXT_PUBLIC_WS_URL: baseURL, NEXT_PUBLIC_CDN_URL: '', NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SENTRY_DSN: '', SENTRY_DSN: '' },
  }],
});
