import { test, expect } from './helpers/safe-test';
import { login } from './helpers/login';
import { assertAuthenticated } from './helpers/auth';

const routes = [
  { path: '/admin/users', heading: /utilisateurs/i, api: '/users' },
  { path: '/admin/content/pages', heading: /Pages éditoriales/i, api: '/admin/content/pages' },
  { path: '/admin/content/blocks', heading: /Blocs réutilisables/i, api: '/admin/content/blocks' },
];

test.describe('Administration UI permissions match the real API roles', () => {
  test.describe.configure({ timeout: 150_000 });
  for (const route of routes) {
    test(`ADMIN can load ${route.path} and its real data`, async ({ page }) => {
      await login(page, 'ADMIN');
      await assertAuthenticated(page.request, 'ADMIN');
      const response = page.waitForResponse((value) => new URL(value.url()).pathname === `/api/v1${route.api}` && value.request().method() === 'GET');
      await page.goto(route.path);
      await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible();
      expect((await response).status()).toBe(200);
      await expect(page.getByRole('heading', { name: 'Accès restreint', exact: true })).toHaveCount(0);
    });
  }
  for (const path of [...routes.map((route) => route.path), '/admin/content/pages/new', '/admin/content/pages/00000000-0000-4000-8000-000000000000', '/admin/content/blocks/00000000-0000-4000-8000-000000000000']) {
    test(`COLLAB sees restricted access on ${path} without mounting admin data hooks`, async ({ page }) => {
      await login(page, 'USER');
      await assertAuthenticated(page.request, 'COLLAB');
      const calls: string[] = [];
      page.on('request', (request) => {
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/api/v1/users' || pathname.startsWith('/api/v1/admin/content/')) calls.push(pathname);
      });
      await page.goto(path);
      await expect(page.getByRole('heading', { name: 'Accès restreint', exact: true })).toBeVisible();
      expect(calls, 'Restricted page content must not mount its admin API hooks.').toEqual([]);
    });
  }
});
