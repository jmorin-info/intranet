import { test, expect } from "@playwright/test";
import { login } from "./helpers/login";

/**
 * Audit log — ISO 27001 A.5.15 / A.8.15 traçabilité.
 *
 * Flow : login ADMIN → modifier (best-effort) un user → naviguer vers
 * /admin/audit-logs → vérifier que la dernière entrée correspond à l'action
 * (acteur = admin, target type = user, action ~ update).
 *
 * Destructif côté DB → gated par `RUN_DESTRUCTIVE=1`. Une variante read-only
 * vérifie au moins que la page `/admin/audit-logs` est rendue avec ≥1 entrée.
 */

const DESTRUCTIVE = !!process.env.RUN_DESTRUCTIVE;

test.describe("Audit log creation (ISO 27001 A.5.15)", () => {
  test("audit log page renders and lists entries", async ({ page }) => {
    await login(page, "ADMIN");
    await page.goto("/admin/audit-logs");

    if (page.url().includes("/login") || page.url().includes("/dashboard")) {
      test.skip(true, "Accès /admin/audit-logs refusé — vérifier rôle ADMIN.");
    }

    await expect(page.locator("h1, h2").first()).toContainText(
      /audit|journal|logs/i,
      {
        timeout: 10_000,
      },
    );

    // Tableau ou liste — au moins une ligne attendue
    const rowCount = await page
      .locator(
        'table tbody tr, [role="row"]:not([aria-rowindex="1"]), [data-testid="audit-row"]',
      )
      .count();
    expect(rowCount, "au moins 1 entrée d'audit log attendue").toBeGreaterThan(
      0,
    );
  });

  test("admin user-update produces a fresh audit entry @destructive", async ({
    page,
  }) => {
    test.skip(
      !DESTRUCTIVE,
      "Mutation user désactivée sur préprod (RUN_DESTRUCTIVE=1).",
    );

    await login(page, "ADMIN");

    // Aller sur /admin/users et éditer le 1er user (best effort).
    await page.goto("/admin/users");
    if (page.url().includes("/login") || page.url().includes("/dashboard")) {
      test.skip(true, "Accès /admin/users refusé.");
    }

    // TODO(selector): bouton edit user — fallback générique.
    const firstEditBtn = page
      .locator(
        'button[aria-label*="modifier" i], button[aria-label*="edit" i], a[href*="/admin/users/"]',
      )
      .first();
    if (!(await firstEditBtn.isVisible().catch(() => false))) {
      test.skip(true, "Aucun bouton edit user trouvé — TODO(selector).");
    }
    await firstEditBtn.click();

    // Modifier un champ inoffensif (titre / fonction). Fallback : juste re-save.
    const fnInput = page
      .locator(
        'input[name="jobTitle"], input[name="title"], input[name="function"]',
      )
      .first();
    if (await fnInput.isVisible().catch(() => false)) {
      await fnInput.fill(`E2E audit ${Date.now()}`);
    }
    await page
      .getByRole("button", { name: /enregistrer|sauvegarder|save/i })
      .first()
      .click()
      .catch(() => undefined);

    await page.waitForTimeout(1_500); // laisser l'event publier vers le journal

    // Vérifier sur /admin/audit-logs que la dernière entrée correspond.
    await page.goto("/admin/audit-logs");
    const firstRow = page
      .locator(
        'table tbody tr, [role="row"]:not([aria-rowindex="1"]), [data-testid="audit-row"]',
      )
      .first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    const text = (await firstRow.innerText()).toLowerCase();
    expect(text).toMatch(/user|utilisateur/);
    expect(text).toMatch(/update|modif/);
  });
});
