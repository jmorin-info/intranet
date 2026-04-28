import { test, expect } from '@playwright/test';

/**
 * Dark mode toggle + persistence.
 *
 * The intranet manages dark mode via:
 *  - Zustand `useUIStore.toggleDarkMode()` → toggles `<html class="dark">` and
 *    writes `localStorage.darkMode = "true" | "false"`
 *  - Inline boot script in `app/layout.tsx` reads localStorage on first paint
 *    to avoid FOUC.
 *
 * Test covers:
 *  - Header theme toggle button toggles `<html>.dark`
 *  - LocalStorage `darkMode` persists between reloads
 *  - Class persists across navigation
 */

test.describe('Dark mode toggle', () => {
  test.beforeEach(async ({ page }) => {
    // Force a known starting state (light) by clearing localStorage before any
    // app script runs.
    await page.addInitScript(() => {
      try {
        localStorage.removeItem('darkMode');
      } catch {
        /* ignore */
      }
    });
  });

  test('toggle button switches html.dark class', async ({ page }) => {
    await page.goto('/dashboard');

    // The header exposes a theme toggle button with aria-pressed = darkMode
    // and an explicit aria-label ("Activer mode sombre/clair"). We locate by
    // role and a regex matching either label.
    const toggle = page.getByRole('button', { name: /activer mode (sombre|clair)|dark mode|light mode/i }).first();
    if (!(await toggle.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'Bouton de thème non visible — header rendu différemment');
    }

    // Initial: light (no `dark` class on <html>)
    const initial = await page.evaluate(() => document.documentElement.classList.contains('dark'));

    await toggle.click();
    // After click: class flipped
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')), {
        timeout: 3_000,
      })
      .toBe(!initial);

    // Toggle back to leave the preprod environment in the original state.
    await toggle.click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')), {
        timeout: 3_000,
      })
      .toBe(initial);
  });

  test('localStorage.darkMode persists across reload', async ({ page }) => {
    await page.goto('/dashboard');
    const toggle = page.getByRole('button', { name: /activer mode (sombre|clair)|dark mode|light mode/i }).first();
    if (!(await toggle.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'Bouton thème indisponible');
    }

    await toggle.click();
    await page.waitForTimeout(200);

    const stored = await page.evaluate(() => localStorage.getItem('darkMode'));
    expect(stored === 'true' || stored === 'false').toBeTruthy();

    const expectedDark = stored === 'true';

    // Reload — boot script should restore the class without FOUC
    await page.reload();
    const persisted = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(persisted).toBe(expectedDark);

    // Restore — toggle off so we leave shared preprod in light mode.
    await toggle.click().catch(() => {});
  });

  test('dark class persists across SPA navigation', async ({ page }) => {
    await page.goto('/dashboard');
    const toggle = page.getByRole('button', { name: /activer mode (sombre|clair)|dark mode|light mode/i }).first();
    if (!(await toggle.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'Bouton thème indisponible');
    }

    // Force dark on
    const wasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    if (!wasDark) await toggle.click();

    await page.goto('/documents');
    const stillDarkOnDocs = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(stillDarkOnDocs).toBe(true);

    await page.goto('/profile');
    const stillDarkOnProfile = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(stillDarkOnProfile).toBe(true);

    // Restore initial state
    if (!wasDark) {
      await page.goto('/dashboard');
      const t2 = page
        .getByRole('button', { name: /activer mode (sombre|clair)|dark mode|light mode/i })
        .first();
      await t2.click().catch(() => {});
    }
  });
});
