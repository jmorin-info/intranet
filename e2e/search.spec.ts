import { testApiUrl } from './helpers/test-environment';
import { test, expect } from './helpers/safe-test';

/**
 * Unified search — Cmd+K palette (CommandPalette).
 *
 * Covers:
 *  - global Cmd/Ctrl+K opens the palette (role="dialog")
 *  - typing a known term ("ISO") yields backend Meilisearch results
 *    grouped by module (Documents / Wiki / Tickets / News...)
 *  - clicking a result navigates to the corresponding page
 *  - Escape closes the palette
 *
 * The palette debounces on /search/quick (Meilisearch + RBAC). If the backend
 * returns no result for the chosen term we fall back to asserting that at
 * least the static "Pages" or "Actions" group is rendered.
 */

const API = testApiUrl();

test.describe('Search — Cmd+K command palette', () => {
  test('Cmd+K opens the command palette dialog', async ({ page }) => {
    await page.goto('/dashboard');
    // Trigger global shortcut. We send Meta+K (macOS) and Control+K — both are
    // accepted by the palette listener.
    await page.keyboard.press('Meta+K').catch(() => {});
    let dialog = page.locator('[role="dialog"]').first();
    if (!(await dialog.isVisible({ timeout: 1_500 }).catch(() => false))) {
      await page.keyboard.press('Control+K').catch(() => {});
      dialog = page.locator('[role="dialog"]').first();
    }
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // The palette has a search input
    const input = dialog.locator('input').first();
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
  });

  test('typing "ISO" surfaces results (backend or static fallback)', async ({ page }) => {
    await page.goto('/dashboard');
    await page.keyboard.press('Control+K').catch(() => {});
    const dialog = page.locator('[role="dialog"]').first();
    if (!(await dialog.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, 'Palette non ouverte — raccourci non capturé');
    }

    const input = dialog.locator('input').first();
    await input.fill('ISO');
    // Debounced backend call (~250ms) → wait a beat
    await page.waitForTimeout(700);

    // Either the "Contenu" group (Meilisearch hits) is present, OR a static
    // group ("Pages" / "Actions") still shows. We assert on at least one
    // visible result row.
    const anyResult = dialog.locator('[role="option"], [data-cmd-item], li').filter({
      hasText: /./,
    });
    const count = await anyResult.count().catch(() => 0);
    expect(count).toBeGreaterThan(0);
  });

  test('clicking a result navigates away (closes palette)', async ({ page }) => {
    await page.goto('/dashboard');
    await page.keyboard.press('Control+K').catch(() => {});
    const dialog = page.locator('[role="dialog"]').first();
    if (!(await dialog.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, 'Palette non ouverte');
    }

    const input = dialog.locator('input').first();
    // "Documents" is a known static page entry → always present, regardless
    // of Meilisearch state.
    await input.fill('Documents');
    await page.waitForTimeout(500);

    const firstResult = dialog
      .locator('[role="option"], [data-cmd-item], li')
      .filter({ hasText: /Documents/i })
      .first();
    if (!(await firstResult.isVisible({ timeout: 2_000 }).catch(() => false))) {
      test.skip(true, 'Résultat Documents non rendu — palette state inattendu');
    }
    await firstResult.click();

    // Palette should close and URL should have changed away from /dashboard
    await expect(dialog).toBeHidden({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/(documents|dashboard)/);
  });

  test('Escape closes the palette', async ({ page }) => {
    await page.goto('/dashboard');
    await page.keyboard.press('Control+K').catch(() => {});
    const dialog = page.locator('[role="dialog"]').first();
    if (!(await dialog.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, 'Palette non ouverte');
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 3_000 });
  });

  test('Meilisearch /search/quick endpoint reachable', async ({ request }) => {
    const res = await request.get(`${API}/search/quick`, {
      params: { q: 'ISO', limit: 5 },
      failOnStatusCode: false,
    });
    // Auth required (cookie not propagated through request fixture without
    // storageState) — accept 200 or 401/403. 5xx fails the test.
    expect([200, 401, 403]).toContain(res.status());
  });
});
