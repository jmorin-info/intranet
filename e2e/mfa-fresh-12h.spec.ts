import { testApiUrl } from './helpers/test-environment';
import { test, expect } from './helpers/safe-test';
import { createStaleMfaSession } from './helpers/session-fixture';
import { testMfaCode, waitForTotpWindow } from './helpers/totp';

const API = testApiUrl();
test.describe('Fresh MFA guard (12 hours), genuine server sessions', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ timeout: 150_000 });

  test('an aged session is rejected with the MFA-specific code, then OTP restores access', async ({ request }) => {
    await createStaleMfaSession(request, 'COLLAB');
    const blocked = await request.get(`${API}/incidents`, { failOnStatusCode: false });
    expect(blocked.status()).toBe(403);
    expect((await blocked.json()).code).toBe('MFA_REVALIDATION_REQUIRED');
    await waitForTotpWindow();
    const revalidated = await request.post(`${API}/mfa/revalidate`, { data: { code: testMfaCode('COLLAB') }, failOnStatusCode: false });
    expect(revalidated.status()).toBe(201);
    expect((await request.get(`${API}/incidents`, { failOnStatusCode: false })).status()).toBe(200);
  });

  test('the browser asks for a new OTP and returns to the original incidents page', async ({ page }) => {
    await createStaleMfaSession(page.request, 'COLLAB');
    await page.goto('/incidents');
    await expect(page).toHaveURL(/\/mfa\/revalidate\?/);
    expect(new URL(page.url()).searchParams.get('next')).toBe('/incidents');
    const input = page.getByPlaceholder('000000', { exact: true });
    await expect(input).toBeVisible();
    await waitForTotpWindow();
    const response = page.waitForResponse((value) => new URL(value.url()).pathname.endsWith('/mfa/revalidate') && value.request().method() === 'POST');
    await input.fill(testMfaCode('COLLAB')!);
    expect((await response).status()).toBe(201);
    await page.waitForURL('**/incidents');
    expect((await page.request.get(`${API}/incidents`, { failOnStatusCode: false })).status()).toBe(200);
  });
});
