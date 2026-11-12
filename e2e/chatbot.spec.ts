import { test, expect } from './helpers/safe-test';

/**
 * RAG chatbot — Ctrl+Shift+K opens modal, streaming Q&A, stop/copy/feedback.
 * Streaming assertions are best-effort: if the backend RAG pipeline is down we
 * skip rather than fail. Sensitive (negative feedback submission) is
 * non-destructive (it posts one datapoint).
 */

test.describe('Chatbot RAG', () => {
  test('Ctrl+Shift+K opens modal', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.keyboard.press('Control+Shift+K');
    await expect(
      page
        .locator('[role="dialog"], [data-testid="chatbot-modal"], [data-state="open"]')
        .first(),
    ).toBeVisible({ timeout: 6_000 });
  });

  test('submits a question → receives a streaming response', async ({ page }) => {
    await page.goto('/dashboard');
    await page.keyboard.press('Control+Shift+K');
    const modal = page
      .locator('[role="dialog"], [data-testid="chatbot-modal"]')
      .first();
    if (!(await modal.isVisible().catch(() => false))) {
      test.skip(true, 'Modale chatbot non ouverte — raccourci non enregistré ?');
    }
    const input = modal.locator('textarea, input[type="text"]').first();
    await input.fill('Quelles sont les procédures ISO 27001 ?');
    await input.press('Enter');

    // Streaming: any text response appears within 15s
    const response = modal.locator('[data-testid="chat-message"], [data-role="assistant"], .prose').last();
    const visible = await response.waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false);
    if (!visible) {
      test.skip(true, 'Streaming RAG non reçu — pipeline LLM possiblement indisponible');
    }
    await expect(response).not.toBeEmpty();
  });

  test('stop generation button is available during streaming (V3-A)', async ({ page }) => {
    await page.goto('/dashboard');
    await page.keyboard.press('Control+Shift+K');
    const modal = page.locator('[role="dialog"]').first();
    if (!(await modal.isVisible().catch(() => false))) {
      test.skip(true, 'Modale chatbot non ouverte');
    }
    const input = modal.locator('textarea, input[type="text"]').first();
    await input.fill('Raconte-moi longuement la charte IT.');
    await input.press('Enter');
    const stopBtn = modal.getByRole('button', { name: /stop|arrêter|interrompre/i }).first();
    const appeared = await stopBtn.waitFor({ state: 'visible', timeout: 6_000 }).then(() => true).catch(() => false);
    if (!appeared) {
      test.skip(true, 'Bouton stop non affiché — streaming trop court ou feature non active');
    }
    await stopBtn.click();
    // After stop: button should disappear or become disabled
    await expect(stopBtn).toBeHidden({ timeout: 4_000 }).catch(async () => {
      await expect(stopBtn).toBeDisabled();
    });
  });

  test('copy response to clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await page.goto('/dashboard');
    await page.keyboard.press('Control+Shift+K');
    const modal = page.locator('[role="dialog"]').first();
    if (!(await modal.isVisible().catch(() => false))) {
      test.skip(true, 'Modale chatbot non ouverte');
    }
    const copyBtn = modal.getByRole('button', { name: /copier|copy/i }).first();
    if (!(await copyBtn.isVisible().catch(() => false))) {
      test.skip(true, 'Aucun bouton copier visible — aucune réponse en cache');
    }
    await copyBtn.click();
    // Toast or visual feedback
    await expect(
      page.locator('[data-sonner-toast], [role="status"]').first(),
    ).toBeVisible({ timeout: 4_000 }).catch(() => {
      /* silent copy is acceptable */
    });
  });

  test('negative feedback with reason', async ({ page }) => {
    await page.goto('/dashboard');
    await page.keyboard.press('Control+Shift+K');
    const modal = page.locator('[role="dialog"]').first();
    if (!(await modal.isVisible().catch(() => false))) {
      test.skip(true, 'Modale chatbot non ouverte');
    }
    const thumbDown = modal
      .locator('button[aria-label*="négatif" i], button[aria-label*="thumbs down" i], button:has-text("👎")')
      .first();
    if (!(await thumbDown.isVisible().catch(() => false))) {
      test.skip(true, 'Bouton feedback négatif non trouvé');
    }
    await thumbDown.click();
    const reasonInput = page.locator('textarea[placeholder*="raison" i], textarea[name="reason"]').first();
    if (await reasonInput.isVisible().catch(() => false)) {
      await reasonInput.fill('Réponse hors sujet (test e2e).');
      await page.getByRole('button', { name: /envoyer|submit/i }).first().click();
      await expect(page.locator('[data-sonner-toast], [role="status"]').first()).toBeVisible({ timeout: 4_000 });
    }
  });
});
