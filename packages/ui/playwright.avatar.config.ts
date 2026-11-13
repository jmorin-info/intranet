import { defineConfig, devices } from "@playwright/test";

// Isolated component fixture: no app server, API, stored login or production URL.
export default defineConfig({
  testDir: "./tests",
  testMatch: "avatar.browser.spec.ts",
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  outputDir: "../../test-results/avatar",
  use: {
    ...devices["Desktop Chrome"],
    headless: true,
    storageState: { cookies: [], origins: [] },
    serviceWorkers: "block",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },
});
