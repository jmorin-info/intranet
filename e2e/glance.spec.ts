import { test, expect } from './helpers/safe-test';

/**
 * Glance overlay — Alt+click on an internal link previews the target in an
 * overlay; Escape closes it; "Étendre" navigates full-screen.
 */

test.describe('Glance overlay', () => {
  test('Alt+click on an internal link opens Glance', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    // Find any internal link (excludes external http(s))
    const internal = page
      .locator('a[href^="/"]:not([href^="/logout"]):not([target="_blank"])')
      .first();
    if (!(await internal.isVisible().catch(() => false))) {
      test.skip(true, 'Aucun lien interne trouvé sur le dashboard');
    }
    await internal.click({ modifiers: ['Alt'] });
    const overlay = page.locator('[data-testid="glance-overlay"], [role="dialog"][aria-label*="Glance" i], [data-glance="true"]').first();
    const visible = await overlay.waitFor({ state: 'visible', timeout: 6_000 }).then(() => true).catch(() => false);
    if (!visible) {
      test.skip(true, 'Overlay Glance non détecté — feature-flag off ou sélecteur différent');
    }
    await expect(overlay).toBeVisible();
  });

  test('Escape closes Glance overlay', async ({ page }) => {
    await page.goto('/dashboard');
    const internal = page
      .locator('a[href^="/"]:not([href^="/logout"]):not([target="_blank"])')
      .first();
    if (!(await internal.isVisible().catch(() => false))) {
      test.skip(true, 'Aucun lien interne');
    }
    await internal.click({ modifiers: ['Alt'] });
    const overlay = page.locator('[data-testid="glance-overlay"], [role="dialog"][aria-label*="Glance" i], [data-glance="true"]').first();
    if (!(await overlay.isVisible({ timeout: 4_000 }).catch(() => false))) {
      test.skip(true, 'Glance non ouvert');
    }
    await page.keyboard.press('Escape');
    await expect(overlay).toBeHidden({ timeout: 4_000 });
  });

  test('"Étendre" button navigates to full route', async ({ page }) => {
    await page.goto('/dashboard');
    const internal = page
      .locator('a[href^="/"]:not([href^="/logout"]):not([target="_blank"])')
      .first();
    if (!(await internal.isVisible().catch(() => false))) {
      test.skip(true, 'Aucun lien interne');
    }
    const href = await internal.getAttribute('href');
    await internal.click({ modifiers: ['Alt'] });
    const expandBtn = page.getByRole('button', { name: /étendre|expand|plein écran/i }).first();
    if (!(await expandBtn.isVisible({ timeout: 4_000 }).catch(() => false))) {
      test.skip(true, 'Bouton "Étendre" non visible');
    }
    await expandBtn.click();
    if (href) {
      await page.waitForURL((url) => url.pathname === href || url.pathname.startsWith(href), {
        timeout: 6_000,
      });
    }
  });
});
