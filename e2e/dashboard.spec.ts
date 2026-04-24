import { test, expect } from '@playwright/test';

/**
 * Dashboard — relies on global-setup storageState (SUPER_ADMIN authenticated).
 */

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
  });

  test('displays greeting header', async ({ page }) => {
    await expect(page.locator('h1').first()).toContainText(/Bonjour|Bon après-midi|Bonsoir/i);
  });

  test('displays key stat widgets', async ({ page }) => {
    await expect(page.locator('text=Documents').first()).toBeVisible();
  });

  test('sidebar navigation to /documents', async ({ page }) => {
    await page.click('a[href="/documents"]');
    await page.waitForURL('**/documents');
    await expect(page).toHaveURL(/documents/);
  });

  test('sidebar navigation to /notifications', async ({ page }) => {
    await page.click('a[href="/notifications"]');
    await page.waitForURL('**/notifications');
    await expect(page).toHaveURL(/notifications/);
  });
});
