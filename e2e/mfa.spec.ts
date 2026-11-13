import { testApiUrl } from './helpers/test-environment';
import { test, expect } from './helpers/safe-test';
import { testMfaCode, waitForTotpWindow } from './helpers/totp';

const API = testApiUrl();
test.describe('Real MFA state and validation', () => {
  test('the enrolled account sees its active MFA status', async ({ page }) => {
    const response = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/mfa/status') && r.status() === 200);
    await page.goto('/mfa');
    expect((await (await response).json()).mfaEnabled).toBe(true);
    await expect(page.getByText('Activé', { exact: true })).toBeVisible();
  });
  test('a well-formed incorrect OTP is rejected by the actual verifier', async ({ request }) => {
    await waitForTotpWindow();
    const current = testMfaCode(process.env.E2E_SUPER_ADMIN_EMAIL ? 'SUPER_ADMIN' : 'ADMIN');
    expect(current).toMatch(/^\d{6}$/);
    const invalid = ((Number(current) + 1) % 1_000_000).toString().padStart(6, '0');
    const response = await request.post(`${API}/mfa/activate`, { data: { code: invalid }, failOnStatusCode: false });
    expect(response.status()).toBe(400);
    expect((await response.json()).message).toMatch(/invalide/i);
  });
  test('self-service disable rejects missing reauthentication', async ({ request }) => {
    const response = await request.post(`${API}/mfa/disable/me`, { data: { password: '' }, failOnStatusCode: false });
    expect(response.status()).toBe(400);
    expect((await request.get(`${API}/mfa/status`)).status()).toBe(200);
    expect((await (await request.get(`${API}/mfa/status`)).json()).mfaEnabled).toBe(true);
  });
  test('the authenticated status endpoint confirms MFA is enabled', async ({ request }) => {
    const response = await request.get(`${API}/mfa/status`, { failOnStatusCode: false });
    expect(response.status()).toBe(200);
    expect((await response.json()).mfaEnabled).toBe(true);
  });
});
