import { test, expect } from '@playwright/test';

test.describe('Tickets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'jmorin@omnitech-security.fr');
    await page.fill('input[type="password"]', 'Admin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
  });

  test('should list tickets', async ({ page }) => {
    await page.goto('/tickets');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('should toggle kanban view', async ({ page }) => {
    await page.goto('/tickets');
    await page.click('text=Kanban');
    await expect(page.locator('text=Ouvert')).toBeVisible();
    await expect(page.locator('text=En cours')).toBeVisible();
    await expect(page.locator('text=Résolu')).toBeVisible();
  });
});
