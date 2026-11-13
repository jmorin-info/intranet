import { test, expect } from './helpers/safe-test';

test.describe('Focus keyboard gestures coexist with Glance and editing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { level: 1, name: /Compte/ })).toBeVisible();
    // Focus is loaded dynamically. Exercise its real header control before
    // sending keyboard input, rather than racing the component's listeners.
    await page.getByRole('button', { name: 'Activer le mode focus (concentration)', exact: true }).click();
    await expect(page.locator('[data-focus-ui]')).toContainText('Focus page');
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveClass(/focus-mode-active/);
  });

  test('holding Alt leaves the page accessible; releasing Alt alone toggles focus', async ({ page }) => {
    await page.keyboard.down('Alt');
    await expect(page.locator('body')).not.toHaveClass(/focus-mode-active/);
    await page.keyboard.up('Alt');
    await expect(page.locator('body')).toHaveClass(/focus-mode-active/);
    await page.keyboard.press('Alt');
    await expect(page.locator('body')).not.toHaveClass(/focus-mode-active/);
  });

  test('Alt shortcuts and the Ctrl+AltRight gesture used by AltGr do not toggle focus', async ({ page }) => {
    await page.keyboard.down('Alt');
    await page.keyboard.press('z');
    await page.keyboard.up('Alt');
    await expect(page.locator('body')).not.toHaveClass(/focus-mode-active/);
    await page.keyboard.down('Control');
    await page.keyboard.press('AltRight');
    await page.keyboard.up('Control');
    await expect(page.locator('body')).not.toHaveClass(/focus-mode-active/);
    await page.keyboard.down('Alt');
    await page.keyboard.press('Shift');
    await page.keyboard.up('Alt');
    await expect(page.locator('body')).not.toHaveClass(/focus-mode-active/);
  });

  test('input, rich text and textarea editing keep Alt available', async ({ page }) => {
    await page.goto('/admin/content/pages/new');
    const title = page.locator('input#title');
    await expect(title).toBeVisible();
    await title.focus();
    await page.keyboard.press('Alt');
    await expect(page.locator('body')).not.toHaveClass(/focus-mode-active/);
    const editor = page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeVisible();
    await editor.focus();
    await page.keyboard.press('Alt');
    await expect(page.locator('body')).not.toHaveClass(/focus-mode-active/);
    await page.goto('/admin/content/blocks');
    await page.getByRole('button', { name: 'Nouveau bloc', exact: true }).first().click();
    await page.locator('textarea#block-body').focus();
    await page.keyboard.press('Alt');
    await expect(page.locator('body')).not.toHaveClass(/focus-mode-active/);
  });

  test('a window blur cancels a pending Alt gesture', async ({ page }) => {
    await page.keyboard.down('Alt');
    // Simulate the browser losing OS focus while a modifier is held.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.keyboard.up('Alt');
    await expect(page.locator('body')).not.toHaveClass(/focus-mode-active/);
  });

  test('Escape cancels a pending Alt gesture and exits active focus', async ({ page }) => {
    await page.keyboard.down('Alt');
    await page.keyboard.press('Escape');
    await page.keyboard.up('Alt');
    await expect(page.locator('body')).not.toHaveClass(/focus-mode-active/);
    await page.keyboard.press('Alt');
    await expect(page.locator('body')).toHaveClass(/focus-mode-active/);
    await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveClass(/focus-mode-active/);
  });

  test('Alt+click focuses an actual element and renders its content', async ({ page }) => {
    await page.getByRole('heading', { level: 1, name: /Compte/ }).click({ modifiers: ['Alt'] });
    await expect(page.locator('[data-focus-ui]')).toContainText('Focus élément');
    await expect(page.locator('[data-focus-content]')).not.toBeEmpty();
    await expect(page.locator('[data-focus-content]').getByRole('heading', { level: 1, name: /Compte/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-focus-content]')).toHaveCount(0);
  });
});
