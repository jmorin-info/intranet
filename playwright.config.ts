import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://10.33.120.55:3001',
    headless: true,
    screenshot: 'only-on-failure',
  },
});
