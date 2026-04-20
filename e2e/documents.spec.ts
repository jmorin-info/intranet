import { test, expect } from '@playwright/test';

test.describe('Documents', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'jmorin@omnitech-security.fr');
    await page.fill('input[type="password"]', 'Admin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
  });

  test('should list documents', async ({ page }) => {
    await page.goto('/documents');
    await expect(page.locator('h1')).toContainText('Documents');
    // Should have document count
    await expect(page.locator('text=/\\d+ documents?/')).toBeVisible({ timeout: 5000 });
  });

  test('should show document categories filter', async ({ page }) => {
    await page.goto('/documents');
    await expect(page.locator('text=Tous')).toBeVisible();
  });

  test('should navigate to new document form', async ({ page }) => {
    await page.goto('/documents/new');
    await expect(page.locator('h1')).toContainText(/Nouveau document|New document/);
  });
});
