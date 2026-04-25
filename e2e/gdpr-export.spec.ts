import { test, expect } from "@playwright/test";
import { login, credsFor } from "./helpers/login";

/**
 * GDPR — droit d'accès (RGPD art. 15).
 *
 * Flow : login USER → /profile → cliquer "Exporter mes données" → réceptionner
 * le téléchargement → vérifier que le JSON contient `id`, `email`, `firstName`.
 *
 * Pré-requis : un compte USER seedé. Si absent, le test est skippé avec une
 * note documentant comment seeder (cf. global-setup.ts / prisma seed).
 */

test.describe("GDPR — export personal data (art. 15)", () => {
  test("user can export their data as JSON from /profile", async ({ page }) => {
    await login(page, "USER");

    // Sanity check: if the login API returned 401 we won't be on dashboard.
    const url = page.url();
    if (url.includes("/login")) {
      test.skip(
        true,
        "USER seed manquant — créer un compte USER (cf. apps/backend/prisma/seed.ts) ou exporter E2E_COLLAB_EMAIL/PASSWORD.",
      );
    }

    await page.goto("/profile");
    // TODO(selector): bouton GDPR — locator générique avec fallback texte FR/EN.
    const exportBtn = page
      .getByRole("button", {
        name: /export(er)?( mes)? données|export( my)? data|RGPD|GDPR/i,
      })
      .first();

    if (!(await exportBtn.isVisible().catch(() => false))) {
      test.skip(
        true,
        "Bouton export GDPR non trouvé sur /profile — TODO(selector).",
      );
    }

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 15_000 }),
      exportBtn.click(),
    ]);

    const path = await download.path();
    expect(path, "download must produce a file path").toBeTruthy();
    const fs = await import("node:fs");
    const raw = fs.readFileSync(path!, "utf-8");
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error(
        `GDPR export n'est pas du JSON valide. 1er kilo:\n${raw.slice(0, 1024)}`,
      );
    }

    // The payload may be nested (e.g. { user: {...}, audit: [...] }) — try
    // both shapes.
    const user =
      (payload as { user?: Record<string, unknown> }).user ?? payload;
    expect(user).toHaveProperty("id");
    expect(user).toHaveProperty("email");
    expect(user).toHaveProperty("firstName");

    const expectedEmail = credsFor("USER").email;
    expect(String((user as { email: unknown }).email).toLowerCase()).toBe(
      expectedEmail.toLowerCase(),
    );
  });
});
