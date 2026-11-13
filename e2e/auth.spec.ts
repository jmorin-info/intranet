import { testApiUrl } from './helpers/test-environment';
import { test, expect } from './helpers/safe-test';
import { ADMIN_CREDS, authenticateRequest, assertAuthenticated } from './helpers/auth';
import { testMfaCode, waitForTotpWindow } from './helpers/totp';
import { waitForLoginSlot } from './helpers/login-budget';

const API = testApiUrl();
const loginResponse = (page: import('@playwright/test').Page) => page.waitForResponse((response) =>
  new URL(response.url()).pathname.endsWith('/auth/login') && response.request().method() === 'POST');

async function passwordStep(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(ADMIN_CREDS.email);
  await page.locator('input[type="password"]').fill(ADMIN_CREDS.password);
  await waitForLoginSlot();
  const response = loginResponse(page);
  await page.locator('button[type="submit"]').click();
  return response;
}

test.describe('Authentication with a real MFA-enabled fixture', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ timeout: 150_000 });

  test('login page renders an accessible credential form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 2, name: 'Connexion', exact: true })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('password and valid OTP reach the authenticated dashboard', async ({ page }) => {
    const challenge = await passwordStep(page);
    expect(challenge.status()).toBe(200);
    expect((await challenge.json()).mfaRequired).toBe(true);
    const input = page.getByPlaceholder('000000', { exact: true });
    await expect(input).toBeVisible();
    await waitForLoginSlot();
    await waitForTotpWindow();
    const code = testMfaCode('ADMIN');
    expect(code, 'The fixture must supply its explicit synthetic TOTP secret.').toMatch(/^\d{6}$/);
    await input.fill(code!);
    const completed = loginResponse(page);
    await input.press('Enter');
    expect((await completed).status()).toBe(200);
    await page.waitForURL('**/dashboard');
    await assertAuthenticated(page.request, 'ADMIN');
    await expect(page.getByRole('heading', { level: 1, name: /Compte/ })).toBeVisible();
  });

  test('incorrect credentials return 401 and display a visible error', async ({ page, request }) => {
    const invalid = { email: 'unknown@example.test', password: 'Wrong' + 'Password1!' };
    await waitForLoginSlot();
    const response = await request.post(`${API}/auth/login`, { data: invalid, failOnStatusCode: false, maxRedirects: 0 });
    expect(response.status()).toBe(401);
    expect((await response.json()).message).toMatch(/incorrect|invalide/i);
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(invalid.email);
    await page.locator('input[type="password"]').fill(invalid.password);
    await waitForLoginSlot();
    const rejected = loginResponse(page);
    await page.locator('button[type="submit"]').click();
    expect((await rejected).status()).toBe(401);
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /incorrect|erreur|invalide/i }).first()).toBeVisible();
    expect((await page.request.get(`${API}/auth/me`, { failOnStatusCode: false })).status()).toBe(401);
  });

  test('a password-only MFA challenge does not create an authenticated session', async ({ page }) => {
    const response = await passwordStep(page);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.mfaRequired).toBe(true);
    expect(body.accessToken).toBeUndefined();
    await expect(page.getByPlaceholder('000000', { exact: true })).toBeVisible();
    expect((await page.request.get(`${API}/auth/me`, { failOnStatusCode: false })).status()).toBe(401);
  });

  test('forgot-password acknowledges a fictitious account without an SMTP integration', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.locator('input[type="email"]').fill(ADMIN_CREDS.email);
    const response = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/auth/forgot-password') && r.request().method() === 'POST');
    await page.locator('button[type="submit"]').click();
    expect((await response).status()).toBe(200);
    await expect(page.getByText(/envoy|reçu|vérifi|boîte|email/i).first()).toBeVisible();
  });

  test('refresh rotates a real cookie session and preserves the verified identity', async ({ request }) => {
    await authenticateRequest(request, 'ADMIN');
    const initial = (await request.storageState()).cookies;
    const before = initial.find((cookie) => cookie.name === 'accessToken');
    const beforeRefresh = initial.find((cookie) => cookie.name === 'refreshToken');
    expect(before?.httpOnly).toBe(true);
    expect(beforeRefresh?.httpOnly).toBe(true);
    const response = await request.post(`${API}/auth/refresh`, { failOnStatusCode: false, maxRedirects: 0 });
    expect(response.status()).toBe(200);
    const rotated = (await request.storageState()).cookies;
    const after = rotated.find((cookie) => cookie.name === 'accessToken');
    expect(after?.httpOnly).toBe(true);
    expect(rotated.find((cookie) => cookie.name === 'refreshToken')?.value).not.toBe(beforeRefresh?.value);
    await assertAuthenticated(request, 'ADMIN');
  });

  test('logout clears cookies, revokes the real refresh session and makes the browser anonymous', async ({ page, playwright }) => {
    await authenticateRequest(page.request, 'ADMIN');
    const refresh = (await page.context().cookies()).find((cookie) => cookie.name === 'refreshToken');
    expect(refresh?.httpOnly).toBe(true);
    await page.goto('/dashboard');
    const response = await page.request.post(`${API}/auth/logout`, { failOnStatusCode: false, maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect((await page.context().cookies()).some((cookie) => cookie.name === 'accessToken' || cookie.name === 'refreshToken')).toBe(false);
    expect((await page.request.get(`${API}/auth/me`, { failOnStatusCode: false })).status()).toBe(401);
    const replay = await playwright.request.newContext({ extraHTTPHeaders: { Cookie: `refreshToken=${refresh!.value}` } });
    try {
      expect((await replay.post(`${API}/auth/refresh`, { failOnStatusCode: false, maxRedirects: 0 })).status()).toBe(401);
    } finally { await replay.dispose(); }
    await page.goto('/dashboard');
    await page.waitForURL(/\/(welcome|login)(?:\?|$)/);
  });

  test('an anonymous visit cannot open the dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL(/\/(welcome|login)(?:\?|$)/);
  });

  test('the compatibility logout revokes a real refresh cookie scoped to the former path without an access cookie', async ({ request, playwright }) => {
    await authenticateRequest(request, 'ADMIN');
    const refresh = (await request.storageState()).cookies.find((cookie) => cookie.name === 'refreshToken');
    expect(refresh?.httpOnly).toBe(true);
    const legacy = await playwright.request.newContext({ storageState: {
      cookies: [{ ...refresh!, path: new URL(`${API}/auth/refresh`).pathname }], origins: [],
    } });
    try {
      const response = await legacy.post(`${API}/auth/refresh/logout`, { failOnStatusCode: false, maxRedirects: 0 });
      expect(response.status()).toBe(200);
      expect((await legacy.storageState()).cookies.some((cookie) => cookie.name === 'refreshToken')).toBe(false);
    } finally { await legacy.dispose(); }
    const replay = await playwright.request.newContext({ extraHTTPHeaders: { Cookie: `refreshToken=${refresh!.value}` } });
    try {
      expect((await replay.post(`${API}/auth/refresh`, { failOnStatusCode: false, maxRedirects: 0 })).status()).toBe(401);
    } finally { await replay.dispose(); }
  });
});
