import { test, expect, type Page } from './helpers/safe-test';

async function openPreview(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1, name: /Compte/ })).toBeVisible();
  const link = page.locator('a[href="/documents"]:visible').first();
  await expect(link).toBeVisible();
  await link.click({ modifiers: ['Alt'] });
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Étendre en page courante', exact: true }) });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('Glance — preview of a real internal page', () => {
  test('Alt+click opens the accessible preview without leaving the dashboard', async ({ page }) => {
    const dialog = await openPreview(page);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(dialog.locator('iframe[title="Aperçu Glance"]')).toHaveAttribute('src', '/documents');
  });
  test('Escape closes the preview', async ({ page }) => {
    const dialog = await openPreview(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
  test('expanding the preview opens its actual target page', async ({ page }) => {
    const dialog = await openPreview(page);
    await dialog.getByRole('button', { name: 'Étendre en page courante', exact: true }).click();
    await expect(page).toHaveURL(/\/documents$/);
    await expect(dialog).toBeHidden();
  });
});
