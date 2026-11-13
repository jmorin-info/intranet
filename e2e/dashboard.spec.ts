import { test, expect } from './helpers/safe-test';

/**
 * Dashboard — relies on global-setup storageState (SUPER_ADMIN authenticated).
 */

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    const me = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/auth/me') && response.status() === 200);
    await page.goto('/dashboard');
    await me;
    await expect(page.getByRole('heading', { level: 1, name: /Compte/ })).toBeVisible();
  });

  test('displays greeting header', async ({ page }) => {
    await expect(page.locator('h1').first()).toContainText(/Bonjour|Bon après-midi|Bonsoir/i);
  });

  test('displays key stat widgets', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Politique ISO de test E2E/ }).first()).toBeVisible();
  });

  test('visible dashboard navigation to /documents', async ({ page }) => {
    await page.locator('a[href="/documents"]:visible').first().click();
    await page.waitForURL('**/documents');
    await expect(page).toHaveURL(/documents/);
  });

  test('visible navigation to /notifications', async ({ page }) => {
    await page.locator('a[href="/notifications"]:visible').first().click();
    await page.waitForURL('**/notifications');
    await expect(page).toHaveURL(/notifications/);
  });
});
