import { test as base, expect } from '@playwright/test';
import { assertTestEnvironment, assertTestUrl, testBaseUrl } from './test-environment';

/** Also protect against an already compiled front end pointing to production. */
export const test = base.extend<{ productionRequestGuard: void }>({
  productionRequestGuard: [async ({ context }, use) => {
    assertTestEnvironment();
    // Deterministic display preferences; authentication remains server-issued.
    await context.addCookies([{ name: 'NEXT_LOCALE', value: 'fr', url: testBaseUrl(), sameSite: 'Lax' }]);
    await context.addInitScript(() => {
      localStorage.setItem('locale', 'fr');
      // Display preferences for an experienced user, unrelated to authentication
      // or server onboarding completion. The welcome tour has separate coverage.
      localStorage.setItem('onboarding_completed', 'true');
      localStorage.setItem('tips_first_login_done', 'true');
      localStorage.setItem('tips_last_shown', String(Date.now()));
    });
    const blocked: string[] = [];
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (!/^https?:/.test(url)) return route.continue();
      try { assertTestUrl(url, 'requête navigateur'); }
      catch { blocked.push(new URL(url).hostname); return route.abort('blockedbyclient'); }
      return route.continue();
    });
    await use();
    expect(blocked, 'Le navigateur ne doit contacter aucune origine de production. Vérifiez le build et les NEXT_PUBLIC_* de test.').toEqual([]);
  }, { auto: true }],
});
export { expect };
export type { Page, APIRequestContext, BrowserContext, Locator, Route } from '@playwright/test';
