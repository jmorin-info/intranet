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
    await expect(globalBtn).toBeVisible({ timeout: 8_000 });
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
    await expect(anyToggle).toBeVisible();
  });

  test('search filter shrinks the user list', async ({ page }) => {
    await page.goto('/admin/webdav');
    const searchInput = page.getByPlaceholder('Rechercher par email, prénom, nom…', { exact: true });
    await expect(searchInput).toBeVisible();
    const filtered = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname.endsWith('/admin/webdav/users') && url.searchParams.get('search') === 'zzz-no-such-user-xyz';
    });
    await searchInput.fill('zzz-no-such-user-xyz');
    expect((await filtered).status()).toBe(200);
    await expect(page.getByText('Aucun utilisateur correspondant.', { exact: true })).toBeVisible();
    await expect(page.locator('button[aria-label*="WebDAV pour"]')).toHaveCount(0);
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

  test('the real API returns WebDAV settings and synthetic users to the administrator', async ({ request }) => {
    const stats = await request.get(`${API}/admin/webdav/stats`, { failOnStatusCode: false });
    expect(stats.status()).toBe(200);
    expect(typeof (await stats.json()).featureEnabled).toBe('boolean');

    const users = await request.get(`${API}/admin/webdav/users`, { failOnStatusCode: false });
    expect(users.status()).toBe(200);
    expect((await users.json()).items.map((user: { email: string }) => user.email)).toEqual(expect.arrayContaining([
      process.env.E2E_ADMIN_EMAIL, process.env.E2E_COLLAB_EMAIL, process.env.E2E_SUPER_ADMIN_EMAIL,
    ]));
  });
});
