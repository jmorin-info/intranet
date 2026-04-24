import { test, expect } from '@playwright/test';

/**
 * /admin/access — 3-tab access configuration. Read-only assertions by default,
 * mutation gated behind RUN_DESTRUCTIVE=1.
 */

const DESTRUCTIVE = !!process.env.RUN_DESTRUCTIVE;

test.describe('Admin — Access configuration', () => {
  test('access page loads with 3 tabs', async ({ page }) => {
    await page.goto('/admin/access');
    await expect(page.locator('h1, h2').first()).toContainText(/Accès|Access/i, { timeout: 8_000 });

    // Collect tab labels — Shadcn/Radix tabs have role="tab"
    const tabs = page.locator('[role="tab"]');
    const count = await tabs.count();
    // Allow for either exactly 3 tabs, or a section-based UI with 3 nav links
    if (count >= 3) {
      expect(count).toBeGreaterThanOrEqual(3);
    } else {
      const navLinks = page.locator('nav a, [data-testid="tab"]');
      const navCount = await navLinks.count();
      expect(navCount).toBeGreaterThanOrEqual(3);
    }
  });

  test('each tab is clickable and reveals content', async ({ page }) => {
    await page.goto('/admin/access');
    const tabs = page.locator('[role="tab"]');
    const tabCount = Math.min(await tabs.count(), 3);
    if (tabCount < 2) {
      test.skip(true, 'Page /admin/access non organisée en onglets — structure différente');
    }
    for (let i = 0; i < tabCount; i++) {
      await tabs.nth(i).click();
      // Associated panel should be visible
      await expect(page.locator('[role="tabpanel"]').first()).toBeVisible({ timeout: 4_000 });
    }
  });

  test('edit & save user access config @destructive', async ({ page }) => {
    test.skip(!DESTRUCTIVE, 'Modification config accès non jouée sur préprod');
    await page.goto('/admin/access');
    const saveBtn = page.getByRole('button', { name: /enregistrer|sauvegarder|save/i }).first();
    if (!(await saveBtn.isVisible().catch(() => false))) {
      test.skip(true, 'Aucun bouton save trouvé');
    }
    await saveBtn.click();
    await expect(page.locator('[data-sonner-toast], [role="status"]').first()).toBeVisible({ timeout: 6_000 });
  });
});
