import { testApiUrl } from './helpers/test-environment';
import { test, expect } from './helpers/safe-test';

// The page entries are deterministic; the separate API check does not claim
// that this disposable recipe populated Meilisearch content indexes.
test.describe('Search — command palette with real authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: /Compte/ })).toBeVisible();
    await page.keyboard.press('Control+K');
    await expect(page.getByRole('dialog', { name: 'Command palette', exact: true })).toBeVisible();
  });

  test('Ctrl+K opens and focuses the command palette', async ({ page }) => {
    await expect(page.getByRole('textbox', { name: 'Champ de recherche de la command palette', exact: true })).toBeFocused();
  });

  test('filtering the known page entries finds Documents', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Command palette', exact: true });
    await dialog.getByRole('textbox').fill('Documents');
    await expect(dialog.locator('button[data-cmd-idx]').filter({ hasText: /^Documents/ }).first()).toBeVisible();
  });

  test('selecting Documents navigates to that page and closes the palette', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Command palette', exact: true });
    await dialog.getByRole('textbox').fill('Documents');
    await dialog.locator('button[data-cmd-idx]').filter({ hasText: /^Documents/ }).first().click();
    await expect(page).toHaveURL(/\/documents$/);
    await expect(dialog).toBeHidden();
  });

  test('Escape closes the palette', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: 'Command palette', exact: true });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('the actual quick-search API responds to the authenticated role', async ({ request }) => {
    const response = await request.get(`${testApiUrl()}/search/quick`, { params: { q: 'ISO', limit: 5 }, failOnStatusCode: false });
    expect(response.status()).toBe(200);
  });
});
