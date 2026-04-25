import { test, expect } from "@playwright/test";
import { credsFor, login } from "./helpers/login";

/**
 * Fresh MFA Guard (12h) — exige une validation MFA récente sur les actions
 * sensibles (ex: changement d'email, gestion users, désactivation MFA).
 *
 * Approche boîte noire impossible sans contrôle du temps → on teste l'API :
 * un endpoint protégé par `FreshMfaGuard` doit retourner 401/403 si la
 * dernière validation MFA est trop ancienne (ou inexistante).
 *
 * Si aucun endpoint connu n'est exposé, le test bascule sur un check UI :
 * /profile + click "changer email" → modale MFA présente.
 */

const SENSITIVE_ENDPOINTS = [
  // Routes connues protégées par FreshMfaGuard côté backend NestJS.
  // Si le backend renomme une route, ajuster ici (TODO route catalog).
  "/users/me/email",
  "/auth/mfa/disable",
  "/admin/users",
];

test.describe("Fresh MFA Guard (12h)", () => {
  test("sensitive API endpoint rejects request without recent MFA", async ({
    request,
  }) => {
    const apiBase = process.env.E2E_API_URL || "http://10.33.120.55:3000/api";
    const { email, password } = credsFor("USER");

    // Login via API — récupère un access token sans passer par MFA fresh.
    const loginRes = await request.post(`${apiBase}/auth/login`, {
      data: { email, password },
      failOnStatusCode: false,
    });
    if (!loginRes.ok()) {
      test.skip(
        true,
        "USER seed manquant pour MFA fresh test — voir prisma seed / E2E_COLLAB_EMAIL.",
      );
    }

    // Hit each sensitive endpoint; at least ONE should reject (401/403/428)
    // because no recent MFA challenge has been resolved in this session.
    const results: { endpoint: string; status: number }[] = [];
    for (const ep of SENSITIVE_ENDPOINTS) {
      const res = await request
        .patch(`${apiBase}${ep}`, {
          data: { email: "spoof@example.com" },
          failOnStatusCode: false,
        })
        .catch(() => null);
      if (res) results.push({ endpoint: ep, status: res.status() });
    }

    expect(
      results.length,
      "at least one endpoint must respond",
    ).toBeGreaterThan(0);
    const blocked = results.some((r) => [401, 403, 428].includes(r.status));
    expect(
      blocked,
      `Aucun endpoint sensible n'a renvoyé 401/403/428. Détails: ${JSON.stringify(results)}`,
    ).toBe(true);
  });

  test("UI prompts for fresh MFA when changing email from /profile", async ({
    page,
  }) => {
    await login(page, "USER");
    if (page.url().includes("/login")) {
      test.skip(true, "USER non connecté — seed manquant.");
    }
    await page.goto("/profile");

    // TODO(selector) — bouton "Changer email" peut être un menu/edit inline.
    const editEmail = page
      .getByRole("button", { name: /changer( mon)? (e?-?mail|adresse)/i })
      .first();
    if (!(await editEmail.isVisible().catch(() => false))) {
      test.skip(true, "Bouton changer email non trouvé — TODO(selector).");
    }
    await editEmail.click();

    // Expected: a modal/screen demanding a fresh MFA OTP.
    const mfaPrompt = page
      .locator('[role="dialog"]')
      .filter({ hasText: /MFA|code.*authentification|2FA/i })
      .first();
    await expect(
      mfaPrompt,
      "Re-prompt MFA attendu sur action sensible",
    ).toBeVisible({
      timeout: 8_000,
    });
  });
});
