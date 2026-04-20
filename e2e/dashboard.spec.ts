import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', 'jmorin@omnitech-security.fr');
    await page.fill('input[type="password"]', 'Admin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
  });

  test('should display dashboard with greeting', async ({ page }) => {
    await expect(page.locator('h1')).toContainText(/Bonjour|Bon après-midi|Bonsoir/);
  });

  test('should display stat cards', async ({ page }) => {
    await expect(page.locator('text=Documents')).toBeVisible();
  });

  test('should have working sidebar navigation', async ({ page }) => {
    await page.click('a[href="/documents"]');
    await page.waitForURL('**/documents');
    await expect(page).toHaveURL(/documents/);
  });

  test('should show notifications page', async ({ page }) => {
    await page.click('a[href="/notifications"]');
    await page.waitForURL('**/notifications');
    await expect(page).toHaveURL(/notifications/);
  });
});
