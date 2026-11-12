import { test as base, expect } from '@playwright/test';
import { assertTestEnvironment, assertTestUrl } from './test-environment';

/** Also protect against an already compiled front end pointing to production. */
export const test = base.extend<{ productionRequestGuard: void }>({
  productionRequestGuard: [async ({ context }, use) => {
    assertTestEnvironment();
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
