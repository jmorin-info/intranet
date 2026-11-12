import { assertTestEnvironment, testApiUrl, requireTestCredentials } from './test-environment';
import type { APIRequestContext, Page } from '@playwright/test';

/**
 * Auth helpers — programmatic login utilities.
 *
 * The UI login flow is slow (form + navigation + hydration). For specs that
 * only need a valid session as a prerequisite we call the backend login
 * endpoint directly, set the access token cookie, and reload the page. This
 * makes each spec ~2–5s faster.
 *
 * NOTE: the frontend reads JWT from the `access_token` HTTP-only cookie set
 * by `/api/auth/login`. We therefore perform the POST through the page's own
 * request context so the cookie is stored in the right jar.
 */

export const ADMIN_CREDS = {
  email: process.env.E2E_ADMIN_EMAIL || '',
  password: process.env.E2E_ADMIN_PASSWORD || '',
};

export const COLLAB_CREDS = {
  email: process.env.E2E_COLLAB_EMAIL || '',
  password: process.env.E2E_COLLAB_PASSWORD || '',
};

function apiBase(): string {
  assertTestEnvironment();
  return testApiUrl();
}

async function apiLogin(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<{ ok: boolean; status: number; body?: unknown }> {
  const res = await request.post(`${apiBase()}/auth/login`, {
    data: { email, password },
    failOnStatusCode: false,
  });
  const body = await res.json().catch(() => undefined);
  return { ok: res.ok(), status: res.status(), body };
}

/**
 * Log in as SUPER_ADMIN via the API and attach cookies/tokens to the page
 * context. Falls back to UI form login if the API call fails.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  return loginAs(page, requireTestCredentials('ADMIN'));
}

export async function loginAsCollaborateur(page: Page): Promise<void> {
  return loginAs(page, requireTestCredentials('COLLAB'));
}

async function loginAs(
  page: Page,
  creds: { email: string; password: string },
): Promise<void> {
  const { ok } = await apiLogin(page.request, creds.email, creds.password);
  if (ok) {
    // Cookie is stored in page.request context; reload so the SPA picks it up.
    await page.goto('/dashboard').catch(() => page.goto('/'));
    return;
  }
  // Fallback — UI login
  await page.goto('/login');
  await page.fill('input[type="email"]', creds.email);
  await page.fill('input[type="password"]', creds.password);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 15_000 }).catch(() => {
    /* MFA or similar — caller decides what to do */
  });
}

/**
 * Post-test cleanup hook. This is a best-effort no-op on the preprod DB — we
 * do NOT mutate real data. If a destructive spec needs a reset, implement it
 * behind `RUN_DESTRUCTIVE=1` in a dedicated helper.
 */
export async function resetTestUser(_id: string): Promise<void> {
  if (!process.env.RUN_DESTRUCTIVE) return;
  // Intentionally a stub on preprod — wire to a real reset endpoint in CI/dev.
}

/**
 * Perform a logout by clearing auth cookies and navigating to /login.
 */
export async function logout(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/login').catch(() => {
    /* ignore */
  });
}
