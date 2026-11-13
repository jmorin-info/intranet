import { testApiUrl } from './helpers/test-environment';
import { test, expect } from './helpers/safe-test';
import { login } from './helpers/login';
import { authenticateRequest, assertAuthenticated } from './helpers/auth';

test.describe('RBAC — a verified collaborator cannot administer users', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.describe.configure({ timeout: 150_000 });

  test('the users administration page shows restricted access to an authenticated collaborator', async ({ page }) => {
    await login(page, 'USER');
    await assertAuthenticated(page.request, 'COLLAB');
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Accès restreint', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Nouvel utilisateur|Ajouter un utilisateur/i })).toHaveCount(0);
    await assertAuthenticated(page.request, 'COLLAB');
  });

  test('the real users API returns 403 to an authenticated collaborator', async ({ request }) => {
    await authenticateRequest(request, 'COLLAB');
    await assertAuthenticated(request, 'COLLAB');
    // /users exists and requires ADMIN. A 404 or anonymous 401 proves no RBAC.
    const response = await request.get(`${testApiUrl()}/users`, { failOnStatusCode: false });
    expect(response.status()).toBe(403);
  });
});
