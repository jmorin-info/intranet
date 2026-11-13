import { test, expect } from '../helpers/safe-test';
import { UserRole, NotificationType } from '@omnitech/shared';

const user = { id: 'qa-user', email: 'ui-qa@example.test', firstName: 'Compte', lastName: 'de test', role: 'ADMIN',
  locale: 'fr', onboardingCompletedAt: '2026-01-01T00:00:00Z', welcomeChecklistDismissedAt: '2026-01-01T00:00:00Z', noaEnabled: false };
const notification = (id: string, extra = {}) => ({ id, type: 'MENTION', title: `Notification ${id}`, body: 'Données synthétiques locales',
  isRead: false, createdAt: new Date().toISOString(), ...extra });

test.beforeEach(async ({ context, page }) => {
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const endpoint = url.pathname.replace(/^\/api(?:\/v1)?/, '');
    if (endpoint === '/auth/me') return route.fulfill({ json: user });
    if (endpoint === '/health') return route.fulfill({ json: { status: 'ok' } });
    if (endpoint === '/config/public/feature-flags') return route.fulfill({ json: { 'feature.humor.noa': false } });
    if (endpoint === '/spaces/my-modules') return route.fulfill({ json: { modules: ['dashboard', 'documents', 'tickets', 'notifications', 'profile', 'signatures', 'calendar', 'admin'] } });
    if (endpoint === '/chartes/status') return route.fulfill({ json: { allSigned: true } });
    if (endpoint === '/maintenance/status') return route.fulfill({ json: { maintenance: false } });
    if (endpoint === '/notifications') {
      const nextPage = url.searchParams.get('page') === '2';
      return route.fulfill({ json: { data: nextPage ? [notification('ticket', { type: 'TICKET_CREATED', resourceType: 'Ticket', resourceId: 'qa-ticket' })]
        : [notification('campagne', { type: 'SIGNATURE_REQUEST', resourceType: 'SIGNATURE_CAMPAIGN', resourceId: 'qa-campaign' }),
          notification('actualite', { type: 'NEWS_POSTED', resourceType: 'NewsPost', resourceId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })],
        meta: { page: nextPage ? 2 : 1, total: 40, totalPages: 2 } } });
    }
    if (endpoint === '/notifications/unread-count') return route.fulfill({ json: { count: 63 } });
    if (endpoint.startsWith('/feature-flags')) return route.fulfill({ json: [] });
    if (request.method() !== 'GET') return route.fulfill({ status: 405, json: { message: 'Écriture non prévue par la fixture locale.' } });
    return route.fulfill({ json: [] });
  });
  await context.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.fallback() : route.abort('blockedbyclient'));
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'fr');
    localStorage.setItem('darkMode', 'false');
    localStorage.setItem('onboarding_completed', 'true');
  });
});

test('partial inbox keeps the global badge and valid signature navigation on mobile', async ({ page }) => {
  await page.goto('/notifications');
  await expect(page.getByText('63 notifications non lues', { exact: true })).toBeVisible();
  const signatureLink = page.getByRole('link', { name: 'Voir mes signatures', exact: true });
  await expect(signatureLink).toHaveAttribute('href', '/signatures');
  await expect(page.getByRole('link', { name: 'Voir les actualités', exact: true })).toHaveAttribute('href', '/news');
  expect(await signatureLink.evaluate((element) => element.closest('button') === null)).toBe(true);
  await expect(page.getByRole('tab', { name: 'Filtrer par Accusés de réception', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `test-results/ui/notifications-${test.info().project.name}.png`, fullPage: !test.info().project.name.includes('mobile') });
  if (test.info().project.name.includes('mobile')) {
    const row = page.getByRole('button', { name: 'Non lu: Notification campagne', exact: true });
    await row.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await expect(row).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: 'test-results/ui/notifications-row-mobile.png' });
  }
});

test('pagination remains available when the active filter has no loaded match', async ({ page }) => {
  await page.goto('/notifications');
  await expect(page.getByText('63 notifications non lues', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Filtrer par Tickets', exact: true }).click();
  await expect(page.getByText('Les filtres s’appliquent aux notifications chargées.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Charger plus', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Non lu: Notification ticket', exact: true })).toBeVisible();
  await expect(page.getByText('63 notifications non lues', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Charger plus', exact: true })).toHaveCount(0);
});

test('a failed or invalid inbox exposes a retry, without a reassuring empty state', async ({ page }) => {
  let invalid = true;
  await page.route('**/api/**/notifications?*', (route) => invalid
    ? route.fulfill({ json: { data: null } })
    : route.fallback());
  await page.goto('/notifications');
  await expect(page.getByRole('alert').filter({ hasText: 'Impossible de charger les notifications.' })).toBeVisible();
  await expect(page.getByText('Tout est calme ici', { exact: true })).toHaveCount(0);
  invalid = false;
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Non lu: Notification campagne', exact: true })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Impossible de charger les notifications.' })).toHaveCount(0);
});

test('a failed mark-all leaves unread status intact and explains the failure', async ({ page }) => {
  await page.route('**/notifications/read-all', (route) => route.fulfill({ status: 503, json: { message: 'Échec simulé' } }));
  await page.goto('/notifications');
  await expect(page.getByText('63 notifications non lues', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Tout marquer comme lu', exact: true }).click();
  await expect(page.getByText('Les notifications n’ont pas pu être marquées comme lues.', { exact: true })).toBeVisible();
  await expect(page.getByText('63 notifications non lues', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Non lu: Notification campagne', exact: true })).toBeVisible();
});

test('broadcast role values match the API enum and the selected target is submitted', async ({ page }) => {
  let submitted: Record<string, unknown> | undefined;
  await page.route('**/notifications/broadcast', async (route) => {
    submitted = route.request().postDataJSON();
    return route.fulfill({ json: { sent: 1, total: 1 } });
  });
  await page.goto('/notifications');
  await page.getByRole('button', { name: 'Envoyer une notification', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const types = await dialog.locator('#broadcast-type option').evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
  expect(types.every((value) => Object.values(NotificationType).includes(value as NotificationType))).toBe(true);
  await dialog.locator('#broadcast-recipients').selectOption('role');
  const roles = dialog.locator('#broadcast-role');
  expect(await roles.locator('option').evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value).filter(Boolean)))
    .toEqual(Object.values(UserRole));
  await dialog.getByLabel('Titre *', { exact: true }).fill('Avis local de test');
  await roles.selectOption('REVIEWER');
  await dialog.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(submitted).toMatchObject({ targetRole: 'REVIEWER', title: 'Avis local de test' });
});

for (const smartMode of [false, true]) {
  test(`a slow obsolete ${smartMode ? 'smart' : 'standard'} search is cancelled and cannot replace newer results`, async ({ page }) => {
    let slowStarted = false;
    let slowFinished = false;
    let cancelled = false;
    let releaseSlow!: () => void;
    const held = new Promise<void>((resolve) => { releaseSlow = resolve; });
    const endpoint = smartMode ? '/ai/search' : '/search/unified';
    page.on('requestfailed', (request) => {
      const url = new URL(request.url());
      if (url.pathname.endsWith(endpoint) && url.searchParams.get('q') === 'ancienne') cancelled = true;
    });
    await page.route(`**${endpoint}?*`, async (route) => {
      const query = new URL(route.request().url()).searchParams.get('q');
      if (query === 'ancienne') { slowStarted = true; await held; }
      const hit = { id: `qa-${query}`, title: `Résultat ${query}`, type: 'document', confidence: 90 };
      const json = smartMode
        ? { documents: [hit], wiki: [], tickets: [], news: [], runbooks: [], veille: [], kb: [], suggestions: [] }
        : { query, hits: [hit], byIndex: { documents: { hits: [hit], total: 1 } }, facetDistribution: {}, total: 1,
          page: 1, limit: 20, processingTimeMs: 1, tookMs: 1 };
      try { await route.fulfill({ json }); } finally { if (query === 'ancienne') slowFinished = true; }
    });
    try {
      await page.goto('/search');
      if (smartMode) await page.getByRole('button', { name: 'Activer la recherche intelligente', exact: true }).click();
      const search = page.getByRole('searchbox', { name: 'Rechercher dans tout l’intranet', exact: true });
      await search.fill('ancienne');
      await expect.poll(() => slowStarted).toBe(true);
      await search.fill('actuelle');
      await expect(page.getByRole('link').filter({ hasText: 'Résultat actuelle' })).toBeVisible();
      await expect.poll(() => cancelled).toBe(true);
      releaseSlow();
      await expect.poll(() => slowFinished).toBe(true);
      await expect(page.getByRole('link').filter({ hasText: 'Résultat actuelle' })).toBeVisible();
      await expect(page.getByRole('link').filter({ hasText: 'Résultat ancienne' })).toHaveCount(0);
      await expect(page.getByText('Erreur réseau — vérifiez votre connexion internet.', { exact: true })).toHaveCount(0);
    } finally { releaseSlow(); }
  });
}

for (const result of [
  { sent: 0, total: 2, message: 'Aucune notification n’a pu être envoyée. Votre saisie est conservée.', keepOpen: true },
  { sent: 0, total: 0, message: 'Aucun utilisateur ne correspond aux destinataires choisis.', keepOpen: true },
  { sent: 1, total: 2, message: 'Diffusion partielle : 1 utilisateur(s) traité(s) sur 2.', keepOpen: false },
]) {
  test(`broadcast reports ${result.sent}/${result.total} honestly and preserves unsent input`, async ({ page }) => {
    await page.route('**/notifications/broadcast', (route) => route.fulfill({ json: { sent: result.sent, total: result.total } }));
    await page.goto('/notifications');
    await page.getByRole('button', { name: 'Envoyer une notification', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Titre *', { exact: true }).fill('Message de test conservé');
    await dialog.getByRole('button', { name: 'Envoyer', exact: true }).click();
    await expect(page.getByText(result.message, { exact: true })).toBeVisible();
    if (result.keepOpen) {
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel('Titre *', { exact: true })).toHaveValue('Message de test conservé');
    } else {
      await expect(dialog).toBeHidden();
    }
    await expect(page.getByText('Notification envoyée avec succès', { exact: true })).toHaveCount(0);
  });
}
