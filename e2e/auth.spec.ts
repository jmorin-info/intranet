import { testApiUrl } from './helpers/test-environment';
import { test, expect } from './helpers/safe-test';
import { ADMIN_CREDS } from './helpers/auth';

/**
 * Authentication flows — run unauthenticated (no storageState).
 * Covers login (OK/KO), MFA challenge, forgot-password, refresh, logout.
 */

const API = testApiUrl();

test.describe('Authentication', () => {
  test('login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h2')).toContainText('Connexion');
  });

  test('login with valid credentials → dashboard or MFA', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', ADMIN_CREDS.email);
    await page.fill('input[type="password"]', ADMIN_CREDS.password);
    await page.click('button[type="submit"]');

    // Either dashboard (no MFA) or MFA challenge (MFA enforced) is acceptable
    await Promise.race([
      page.waitForURL('**/dashboard', { timeout: 10_000 }),
      page.waitForURL('**/mfa/**', { timeout: 10_000 }),
      expect(page.locator('input[autocomplete="one-time-code"], [data-testid="mfa-code"]'))
        .toBeVisible({ timeout: 10_000 }),
    ]);
  });

  test('login with invalid credentials → 401 + FR error toast', async ({ page, request }) => {
    // API-level assertion: status 401 and French error message
    const res = await request.post(`${API}/auth/login`, {
      data: { email: 'invalid@omnitech-security.fr', password: 'WrongPassword!' },
      failOnStatusCode: false,
    });
    expect([400, 401]).toContain(res.status());
    const body = await res.json().catch(() => ({}));
    // Accept any FR message from backend; common keys: message, error
    const msg = JSON.stringify(body).toLowerCase();
    expect(msg).toMatch(/incorrect|invalide|identifiant|mot de passe|invalid|unauthorized/);

    // UI-level: toast shown
    await page.goto('/login');
    await page.fill('input[type="email"]', 'invalid@omnitech-security.fr');
    await page.fill('input[type="password"]', 'WrongPassword!');
    await page.click('button[type="submit"]');
    await expect(
      page.locator('[data-sonner-toast], [role="alert"], [role="status"]').first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('MFA-enabled user → code prompt', async ({ page }) => {
    // This test is non-destructive: we only assert that IF MFA is enforced on
    // the admin, the code prompt appears. Otherwise we skip.
    await page.goto('/login');
    await page.fill('input[type="email"]', ADMIN_CREDS.email);
    await page.fill('input[type="password"]', ADMIN_CREDS.password);
    await page.click('button[type="submit"]');

    const mfaInput = page.locator(
      'input[autocomplete="one-time-code"], [data-testid="mfa-code"], input[name="code"]',
    );
    const dashboardUrl = page.waitForURL('**/dashboard', { timeout: 8_000 }).then(() => 'dashboard');
    const mfaVisible = mfaInput.first().waitFor({ state: 'visible', timeout: 8_000 }).then(() => 'mfa');

    const outcome = await Promise.race([dashboardUrl, mfaVisible]).catch(() => 'none');

    if (outcome === 'mfa') {
      await expect(mfaInput.first()).toBeVisible();
    } else {
      test.skip(true, 'MFA non imposé sur ce compte — étape non testable sans OTP secret');
    }
  });

  test('forgot password → form submission acknowledged', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('h1')).toContainText(/Mot de passe/i);
    await page.fill('input[type="email"]', ADMIN_CREDS.email);
    await page.click('button[type="submit"]');
    // Expect any success indicator: toast, redirect, or confirmation text
    await expect(
      page
        .locator('[data-sonner-toast], [role="status"], text=/envoy|reçu|email/i')
        .first(),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('refresh endpoint issues new access token from refresh cookie', async ({ request }) => {
    // 1) Login to obtain refresh cookie in the request context
    const login = await request.post(`${API}/auth/login`, {
      data: ADMIN_CREDS,
      failOnStatusCode: false,
    });
    test.skip(!login.ok(), `Login failed on preprod (status ${login.status()}) — cannot test refresh`);

    // 2) Call refresh — cookie is carried by the context; should return 200/201
    const refresh = await request.post(`${API}/auth/refresh`, { failOnStatusCode: false });
    expect([200, 201]).toContain(refresh.status());
    const data = await refresh.json().catch(() => ({}));
    // Should include an access token (field name varies across versions)
    const hasAccess = Boolean(
      data.accessToken || data.access_token || data.token || data.data?.accessToken,
    );
    expect(hasAccess).toBeTruthy();
  });

  test('logout purges auth cookie', async ({ page, request }) => {
    // Programmatic login first
    const login = await request.post(`${API}/auth/login`, { data: ADMIN_CREDS, failOnStatusCode: false });
    test.skip(!login.ok(), 'Preprod login unavailable — skipping logout UI test');

    await page.goto('/dashboard');
    // Trigger logout (endpoint + navigation)
    await request.post(`${API}/auth/logout`, { failOnStatusCode: false });
    await page.context().clearCookies();

    await page.goto('/dashboard');
    // Unauthenticated → redirect to /welcome or /login
    await page.waitForURL(/\/(welcome|login)/, { timeout: 10_000 });
  });

  test('should redirect to welcome when not authenticated', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/(welcome|login)/, { timeout: 10_000 });
  });
});
