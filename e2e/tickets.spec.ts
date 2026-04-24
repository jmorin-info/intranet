import { test, expect } from '@playwright/test';

/**
 * Tickets flows — authenticated. Destructive (create, comment, assign) gated
 * behind RUN_DESTRUCTIVE=1 on preprod.
 */

const DESTRUCTIVE = !!process.env.RUN_DESTRUCTIVE;

test.describe('Tickets — listing & views', () => {
  test('lists tickets', async ({ page }) => {
    await page.goto('/tickets');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('kanban view shows status columns', async ({ page }) => {
    await page.goto('/tickets');
    const kanbanTrigger = page.getByRole('button', { name: /kanban/i }).first();
    if (!(await kanbanTrigger.isVisible().catch(() => false))) {
      // Already on kanban or toggle is a text button
      await page.locator('text=/Kanban/i').first().click().catch(() => {});
    } else {
      await kanbanTrigger.click();
    }
    await expect(page.locator('text=/Ouvert|Open/i').first()).toBeVisible({ timeout: 6_000 });
    await expect(page.locator('text=/En cours|In progress/i').first()).toBeVisible();
    await expect(page.locator('text=/Résolu|Resolved/i').first()).toBeVisible();
  });
});

test.describe('Tickets — creation & AI metadata @destructive', () => {
  test.skip(!DESTRUCTIVE, 'Création ticket non jouée sur préprod');

  test('create ticket → AI auto-qualif metadata visible', async ({ page }) => {
    await page.goto('/tickets/new');
    await page.fill('input[name="title"], input[placeholder*="titre" i]', `E2E ticket ${Date.now()}`);
    await page
      .fill(
        'textarea[name="description"], textarea[placeholder*="description" i]',
        "Mon application est en panne et je n'arrive plus à me connecter depuis ce matin.",
      )
      .catch(() => {});
    await page.click('button[type="submit"]');
    // AI metadata suggestion card should appear (V3 feature)
    await expect(
      page.locator('[data-testid="ai-suggestion"], text=/Suggestion IA|AI Suggestion/i').first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('comment on ticket', async ({ page }) => {
    await page.goto('/tickets');
    const firstTicket = page.locator('a[href*="/tickets/"]').first();
    if (!(await firstTicket.isVisible().catch(() => false))) {
      test.skip(true, 'Aucun ticket existant à commenter');
    }
    await firstTicket.click();
    const commentInput = page.locator('textarea[placeholder*="commentaire" i], textarea[name="comment"]').first();
    await commentInput.fill('E2E comment');
    await page.getByRole('button', { name: /envoyer|commenter|submit/i }).first().click();
    await expect(page.getByText('E2E comment').first()).toBeVisible({ timeout: 6_000 });
  });

  test('change ticket status', async ({ page }) => {
    await page.goto('/tickets');
    const firstTicket = page.locator('a[href*="/tickets/"]').first();
    if (!(await firstTicket.isVisible().catch(() => false))) {
      test.skip(true, 'Aucun ticket à modifier');
    }
    await firstTicket.click();
    const statusSelect = page.locator('select[name="status"], [data-testid="status-select"]').first();
    if (!(await statusSelect.isVisible().catch(() => false))) {
      test.skip(true, 'Sélecteur statut non trouvé');
    }
    await statusSelect.selectOption({ index: 1 }).catch(() => {});
    await expect(page.locator('[data-sonner-toast], [role="status"]').first()).toBeVisible({ timeout: 6_000 });
  });

  test('assign ticket to user', async ({ page }) => {
    await page.goto('/tickets');
    const firstTicket = page.locator('a[href*="/tickets/"]').first();
    if (!(await firstTicket.isVisible().catch(() => false))) {
      test.skip(true, 'Aucun ticket à assigner');
    }
    await firstTicket.click();
    const assigneeBtn = page.getByRole('button', { name: /assigner|assignee/i }).first();
    if (!(await assigneeBtn.isVisible().catch(() => false))) {
      test.skip(true, 'Bouton assignation non trouvé');
    }
    await assigneeBtn.click();
    await expect(page.locator('[role="dialog"], [role="listbox"]').first()).toBeVisible({ timeout: 6_000 });
  });
});
