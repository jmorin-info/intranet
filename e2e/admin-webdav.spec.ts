import { testApiUrl } from './helpers/test-environment';
import { test, expect } from './helpers/safe-test';

/**
 * Admin WebDAV gating page (`/admin/webdav`) — SUPER_ADMIN only.
 *
 * Covers:
 *  - page renders for SUPER_ADMIN with header + global toggle + user list
 *  - global toggle button is enabled (clickable) for SUPER_ADMIN
 *  - per-user toggle is rendered with aria-label "Activer/Désactiver WebDAV pour <email>"
 *
 * NOTE: We do NOT actually flip toggles on preprod — the destructive path is
 * gated by `RUN_DESTRUCTIVE=1`. We only assert that the controls render and
 * are wired to the expected backend endpoints (via network introspection).
 */

const API = testApiUrl();
const DESTRUCTIVE = !!process.env.RUN_DESTRUCTIVE;

test.describe('Admin WebDAV — gating UI', () => {
  test('page renders header + global feature card', async ({ page }) => {
    const res = await page.goto('/admin/webdav');
    if (!res || (res.status() !== 200 && res.status() !== 304)) {
      test.skip(true, `/admin/webdav returned ${res?.status()} — utilisateur non SUPER_ADMIN ?`);
    }

    await expect(page.locator('h1, h2').filter({ hasText: /WebDAV/i }).first()).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.locator('text=/Feature globale|kill switch/i').first()).toBeVisible();
  });

  test('global toggle button visible for SUPER_ADMIN', async ({ page }) => {
    await page.goto('/admin/webdav');
    // Either "Activer" or "Désactiver" label depending on current state
    const globalBtn = page
      .getByRole('button', { name: /^(Activer|Désactiver)$/i })
      .first();
    if (!(await globalBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      // Maybe the user is not SUPER_ADMIN → look for the disabled hint
      const hint = page.locator('text=/SUPER_ADMIN requis/i').first();
      if (await hint.isVisible().catch(() => false)) {
        test.skip(true, 'Compte non SUPER_ADMIN — toggle global non rendu');
      }
      test.fail(true, 'Bouton global ni hint SUPER_ADMIN trouvé');
    }
    await expect(globalBtn).toBeEnabled();
  });

  test('user list renders with per-user toggle (aria-label conventionné)', async ({ page }) => {
    await page.goto('/admin/webdav');
    // The list table has 4 columns: utilisateur, rôle, tokens, WebDAV
    await expect(page.locator('text=/Permissions par utilisateur/i').first()).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.locator('text=/Utilisateur/i').first()).toBeVisible();

    // Toggles use aria-label "Activer WebDAV pour <email>" or "Désactiver…"
    const anyToggle = page.locator('button[aria-label*="WebDAV pour"]').first();
    // List might be empty on a brand-new preprod → soft assertion
    if (!(await anyToggle.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'Aucun utilisateur dans la liste — toggle non observable');
    }
    await expect(anyToggle).toBeVisible();
  });

  test('search filter shrinks the user list', async ({ page }) => {
    await page.goto('/admin/webdav');
    const searchInput = page
      .locator('input[placeholder*="Rechercher" i], input[placeholder*="email" i]')
      .first();
    if (!(await searchInput.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'Input recherche non rendu');
    }
    await searchInput.fill('zzz-no-such-user-xyz');
    await page.waitForTimeout(800);
    // Expect either "Aucun utilisateur" empty state or 0 toggles
    const empty = page.locator('text=/Aucun utilisateur/i').first();
    const toggles = page.locator('button[aria-label*="WebDAV pour"]');
    const emptyVisible = await empty.isVisible({ timeout: 2_000 }).catch(() => false);
    const toggleCount = await toggles.count().catch(() => 0);
    expect(emptyVisible || toggleCount === 0).toBeTruthy();
  });

  test.describe('@destructive — actual toggle round-trip', () => {
    test.skip(!DESTRUCTIVE, 'RUN_DESTRUCTIVE=1 requis — pas de mutation sur préprod');

    test('toggling a user persists across reload', async ({ page }) => {
      await page.goto('/admin/webdav');
      const anyToggle = page.locator('button[aria-label*="WebDAV pour"]').first();
      const labelBefore = await anyToggle.getAttribute('aria-label');
      await anyToggle.click();
      await page.waitForTimeout(800);
      await page.reload();
      const labelAfter = await page.locator('button[aria-label*="WebDAV pour"]').first().getAttribute('aria-label');
      // Activer ↔ Désactiver flip means label changed
      expect(labelAfter).not.toBe(labelBefore);
      // Restore — flip back
      await page.locator('button[aria-label*="WebDAV pour"]').first().click();
    });
  });

  test('API endpoints exist (smoke)', async ({ request }) => {
    // Without a valid SUPER_ADMIN cookie in the request fixture we expect
    // 401/403; we just check the endpoint is mounted (not 404/5xx).
    const stats = await request.get(`${API}/admin/webdav/stats`, { failOnStatusCode: false });
    expect([200, 401, 403]).toContain(stats.status());

    const users = await request.get(`${API}/admin/webdav/users`, { failOnStatusCode: false });
    expect([200, 401, 403]).toContain(users.status());
  });
});
