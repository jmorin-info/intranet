import { testApiUrl } from './helpers/test-environment';
import { test, expect } from './helpers/safe-test';

/**
 * E2E Tests — Public Portal & Route Health
 *
 * Validates: public page rendering, API responses, route availability.
 * No authentication required for these tests.
 */

test.describe('Public Portal (/welcome)', () => {
  test('portal loads without authentication', async ({ page }) => {
    await page.goto('/welcome');
    await expect(page).toHaveTitle(/OMNITECH/);
  });

  test('hero section renders with CTA', async ({ page }) => {
    await page.goto('/welcome');
    await expect(page.locator('text=OMNITECH Security')).toBeVisible();
    // CTA button should exist (login or dashboard)
    await expect(page.locator('a[href="/login"], a[href="/dashboard"]').first()).toBeVisible();
  });

  test('documents section renders', async ({ page }) => {
    await page.goto('/welcome');
    const section = page.locator('#documents-publics');
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();
    // Should show "Centre de ressources publiques" title
    await expect(section.locator('h2')).toContainText('ressources');
  });

  test('actualités section renders', async ({ page }) => {
    await page.goto('/welcome');
    const section = page.locator('#actualites');
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();
  });

  test('navigation anchors work', async ({ page }) => {
    await page.goto('/welcome');
    // Click "Documents" nav link (anchor)
    await page.click('a[href="#documents-publics"]');
    // Section should be visible
    await expect(page.locator('#documents-publics')).toBeInViewport();
  });

  test('footer links are valid', async ({ page }) => {
    await page.goto('/welcome');
    // Check footer has login link
    const loginLink = page.locator('footer a[href="/login"], a[href="/login"]').last();
    await expect(loginLink).toBeVisible();
  });
});

test.describe('Public API Endpoints', () => {
  const API = testApiUrl();

  test('GET /public/info returns platform stats', async ({ request }) => {
    const res = await request.get(`${API}/public/info`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.appName).toBeTruthy();
    expect(data.stats).toHaveProperty('documents');
    expect(data.stats).toHaveProperty('news');
    expect(data.stats).toHaveProperty('collaborators');
  });

  test('GET /public/documents returns approved public docs', async ({ request }) => {
    const res = await request.get(`${API}/public/documents?limit=10`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('data');
    expect(data).toHaveProperty('meta');
    expect(data.meta).toHaveProperty('total');
    // Each doc should have required fields
    if (data.data.length > 0) {
      const doc = data.data[0];
      expect(doc).toHaveProperty('id');
      expect(doc).toHaveProperty('title');
      expect(doc).toHaveProperty('reference');
    }
  });

  test('GET /public/news returns published articles', async ({ request }) => {
    const res = await request.get(`${API}/public/news?limit=10`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('data');
    expect(data).toHaveProperty('meta');
    if (data.data.length > 0) {
      const article = data.data[0];
      expect(article).toHaveProperty('id');
      expect(article).toHaveProperty('title');
      expect(article).toHaveProperty('slug');
    }
  });

  test('GET /public/veille returns cybersecurity alerts', async ({ request }) => {
    const res = await request.get(`${API}/public/veille?limit=5`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('data');
    if (data.data.length > 0) {
      expect(data.data[0]).toHaveProperty('title');
      expect(data.data[0]).toHaveProperty('severity');
    }
  });

  test('authenticated endpoint rejects without token', async ({ request }) => {
    const res = await request.get(`${API}/users`);
    expect(res.status()).toBe(401);
  });

  test('health endpoint returns system status', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.status()).toBe(200);
  });
});

test.describe('Route Health Check (ALL critical routes)', () => {
  const routes = [
    '/welcome', '/login', '/logout', '/forgot-password', '/reset-password',
    '/dashboard', '/documents', '/tickets', '/news', '/veille',
    '/incidents', '/wiki', '/admin', '/profile', '/search',
    '/alerts', '/quiz', '/procedures', '/files', '/chartes',
    '/en-construction',
  ];

  for (const route of routes) {
    test(`${route} returns HTTP 200`, async ({ request }) => {
      const res = await request.get(route);
      expect(res.status()).toBe(200);
    });
  }
});
