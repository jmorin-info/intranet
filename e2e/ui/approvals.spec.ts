import { test, expect } from '../helpers/safe-test';
import type { PendingApproval } from '../../apps/frontend/src/lib/approvals';

const user = { id: 'qa-user', email: 'ui-qa@example.test', firstName: 'Compte', lastName: 'de test', role: 'ADMIN',
  locale: 'fr', onboardingCompletedAt: '2026-01-01T00:00:00Z', welcomeChecklistDismissedAt: '2026-01-01T00:00:00Z', noaEnabled: false };
function approval(id: string, title: string, dueAt: string | null): PendingApproval {
  return { id, decision: 'PENDING', dueAt, step: { id: `step-${id}`, order: 1, name: 'Contrôle de version' },
    instance: { id: `instance-${id}`, documentId: `document-${id}`, status: 'PENDING', currentStepOrder: 1, startedById: user.id,
      workflow: { id: 'qa-workflow', name: 'Circuit de démonstration QA' },
      document: { id: `document-${id}`, title, reference: `QA-${id}` } } };
}

test.beforeEach(async ({ context, page }) => {
  // All API traffic is fulfilled locally. Unknown writes fail visibly.
  await context.route('**/api/**', async (route) => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname.replace(/^\/api(?:\/v1)?/, '');
    if (endpoint === '/auth/me') return route.fulfill({ json: user });
    if (endpoint === '/health') return route.fulfill({ json: { status: 'ok' } });
    if (endpoint === '/config/public/feature-flags') return route.fulfill({ json: { 'feature.humor.noa': false } });
    if (endpoint === '/spaces/my-modules') return route.fulfill({ json: { modules: ['dashboard', 'documents', 'tickets', 'notifications', 'profile', 'signatures', 'calendar', 'admin'] } });
    if (endpoint === '/approval-workflows/pending/me') return route.fulfill({ json: [
      approval('late', 'Procédure de test en retard', new Date(Date.now() - 3_600_000).toISOString()),
      approval('soon', 'Politique qualité de test', new Date(Date.now() + 3_600_000).toISOString()),
      approval('open', 'Guide de test sans échéance', null),
    ] });
    if (endpoint === '/chartes/status') return route.fulfill({ json: { allSigned: true } });
    if (endpoint === '/maintenance/status') return route.fulfill({ json: { maintenance: false } });
    if (endpoint === '/notifications') return route.fulfill({ json: { data: [], meta: { total: 0 } } });
    if (endpoint === '/notifications/unread-count') return route.fulfill({ json: { count: 0 } });
    if (endpoint.startsWith('/feature-flags')) return route.fulfill({ json: [] });
    if (request.method() !== 'GET') return route.fulfill({ status: 405, json: { message: 'Écriture non prévue par la fixture locale.' } });
    return route.fulfill({ json: [] });
  });
  // Avoid all real third-party calls, including socket/weather/telemetry.
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' ? route.fallback() : route.abort('blockedbyclient');
  });
  await page.addInitScript(() => {
    localStorage.setItem('locale', 'fr');
    localStorage.setItem('darkMode', 'false');
    localStorage.setItem('onboarding_completed', 'true');
  });
});

test('approval filters, accessible search and mobile layout', async ({ page }) => {
  await page.goto('/approvals');
  await expect(page.getByRole('heading', { name: 'Mes approbations', exact: true })).toBeVisible();
  await expect(page.getByText('3 demandes affichées sur 3 à traiter')).toBeVisible();
  await expect(page.getByText('Erreur réseau — vérifiez votre connexion internet.')).toHaveCount(0);
  const skipLinkBounds = await page.getByRole('link', { name: 'Aller à la navigation', exact: true }).evaluate((element) => element.getBoundingClientRect().bottom);
  expect(skipLinkBounds, 'Les liens d’évitement restent hors écran tant qu’ils n’ont pas le focus.').toBeLessThanOrEqual(1);
  // Capture before focusing a search field: full-page mobile screenshots can
  // displace fixed elements while Chromium changes its visual viewport.
  await page.screenshot({ path: `test-results/ui/approvals-${test.info().project.name}.png`, fullPage: !test.info().project.name.includes('mobile') });
  await page.getByLabel('Échéance', { exact: true }).selectOption('overdue');
  await expect(page.getByRole('heading', { name: 'Procédure de test en retard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Politique qualité de test' })).toHaveCount(0);
  await page.getByLabel('Échéance', { exact: true }).selectOption('all');
  await page.getByRole('searchbox', { name: 'Rechercher une demande' }).fill('qualite');
  await expect(page.getByText('1 demande affichée sur 3 à traiter')).toBeVisible();
  await page.getByRole('button', { name: 'Effacer la recherche' }).click();
  await expect(page.getByText('3 demandes affichées sur 3 à traiter')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow, 'La page ne doit pas déborder horizontalement sur mobile.').toBe(false);
});

test('rejection requires a reason; a stale decision reloads the inbox', async ({ page }) => {
  await page.route('**/approval-workflows/steps/*/decide', (route) => route.fulfill({ status: 409,
    json: { message: 'Cette étape a déjà été traitée.' } }));
  await page.goto('/approvals');
  await page.getByRole('button', { name: 'Refuser', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  const reason = dialog.getByLabel('Motif du refus (obligatoire)');
  await expect(reason).toHaveAttribute('required');
  await reason.fill('La version est à corriger avant validation.');
  await dialog.getByRole('button', { name: 'Confirmer le refus' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/déjà été traitée|mise à jour/).first()).toBeVisible();
});
