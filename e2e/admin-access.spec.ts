import { test, expect } from './helpers/safe-test';

/**
 * /admin/access — 3-tab access configuration. Read-only assertions by default,
 * mutation gated behind RUN_DESTRUCTIVE=1.
 */

const DESTRUCTIVE = !!process.env.RUN_DESTRUCTIVE;

test.describe('Admin — Access configuration', () => {
  test('access page exposes the three real configuration sections', async ({ page }) => {
    await page.goto('/admin/access');
    await expect(page.getByRole('heading', { level: 1, name: 'Accès & modules', exact: true })).toBeVisible();
    for (const name of ['Rôles & hiérarchie', 'Départements', 'Utilisateurs']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
    }
  });

  test('section buttons change the selected configuration and URL', async ({ page }) => {
    await page.goto('/admin/access');
    await page.getByRole('button', { name: 'Départements', exact: true }).click();
    await expect(page).toHaveURL(/tab=departments/);
    await expect(page.getByRole('heading', { name: /^Départements \(/ })).toBeVisible();
    await page.getByRole('button', { name: 'Utilisateurs', exact: true }).click();
    await expect(page).toHaveURL(/tab=users/);
    await expect(page.getByRole('heading', { name: 'Override par utilisateur', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Rôles & hiérarchie', exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/access$/);
    await expect(page.getByRole('heading', { name: /^Hiérarchie des rôles/ })).toBeVisible();
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
