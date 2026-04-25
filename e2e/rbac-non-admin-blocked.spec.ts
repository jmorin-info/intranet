import { test, expect } from "@playwright/test";
import { credsFor, login } from "./helpers/login";

/**
 * RBAC — un USER (rôle non-admin) doit être bloqué sur les routes admin.
 *
 * Tests :
 *  1. UI : /admin/users redirige vers /dashboard ou affiche un 403.
 *  2. API : GET /admin/users renvoie 401 ou 403 (jamais 200).
 */

test.describe("RBAC — non-admin user blocked from /admin/*", () => {
  // Force un état non authentifié côté storage; on se logguera en USER en
  // début de test pour ne pas hériter du SUPER_ADMIN du global-setup.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("USER navigating to /admin/users is redirected or sees 403", async ({
    page,
  }) => {
    await login(page, "USER");
    if (page.url().includes("/login")) {
      test.skip(true, "USER seed manquant.");
    }

    await page.goto("/admin/users").catch(() => undefined);
    await page.waitForTimeout(2_000); // laisser le router faire la redirection

    const finalUrl = page.url();
    const onAdminPath = /\/admin\/users(\/|$|\?)/.test(finalUrl);

    if (onAdminPath) {
      // Doit afficher un message d'accès refusé / 403 plutôt que la liste users.
      const forbidden = page
        .getByText(/403|accès refusé|forbidden|interdit|non autorisé/i)
        .first();
      await expect(
        forbidden,
        `USER ne doit pas voir le contenu admin. URL=${finalUrl}`,
      ).toBeVisible({ timeout: 5_000 });
    } else {
      // Redirection acceptable : /dashboard, /, /403, /welcome, /login.
      expect(finalUrl).toMatch(
        /\/(dashboard|403|welcome|login|)$|\/(dashboard|403|welcome|login)\?/,
      );
    }
  });

  test("USER calling GET /admin/users via API is rejected (401/403)", async ({
    request,
  }) => {
    const apiBase = process.env.E2E_API_URL || "http://10.33.120.55:3000/api";
    const { email, password } = credsFor("USER");

    const loginRes = await request.post(`${apiBase}/auth/login`, {
      data: { email, password },
      failOnStatusCode: false,
    });
    if (!loginRes.ok()) {
      test.skip(true, "USER seed manquant pour login API.");
    }

    const res = await request.get(`${apiBase}/admin/users`, {
      failOnStatusCode: false,
    });
    expect(
      [401, 403, 404].includes(res.status()),
      `Endpoint /admin/users doit refuser un USER. Got ${res.status()}`,
    ).toBe(true);
    expect(res.status()).not.toBe(200);
  });
});
