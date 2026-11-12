import { test, expect } from "./helpers/safe-test";

/**
 * CMS module — flows admin critiques + sanitization XSS.
 *
 * Couvre :
 *  1. Navigation : sidebar entry → liste pages
 *  2. Création d'une page brouillon
 *  3. Publication
 *  4. XSS : script injecté dans le contenu est strippé
 *  5. Création d'un bloc + suppression
 *
 * Cleanup : chaque test supprime ce qu'il a créé (soft delete).
 */

const SLUG_PREFIX = `e2e-cms-${Date.now()}`;
const BLOCK_PREFIX = `e2e.cms.${Date.now()}`;

test.describe("Admin — CMS module", () => {
  test("liste des pages CMS accessible depuis /admin/content/pages", async ({
    page,
  }) => {
    await page.goto("/admin/content/pages");
    await expect(page.locator("h1").first()).toContainText(
      /Pages éditoriales/i,
      { timeout: 8_000 },
    );
    // Bouton "Nouvelle page" présent
    await expect(
      page.getByRole("button", { name: /Nouvelle page/i }).first(),
    ).toBeVisible();
  });

  test("création et publication d'une page", async ({ page }) => {
    const slug = `${SLUG_PREFIX}-publish`;
    const title = `E2E Page ${SLUG_PREFIX}`;

    await page.goto("/admin/content/pages/new");
    await page.fill("input#title", title);
    await page.fill("input#slug", slug);

    // Le RichTextEditor est un contentEditable dynamique — on tape dedans.
    const editor = page.locator('[contenteditable="true"]').first();
    await editor.waitFor({ state: "visible", timeout: 8_000 });
    await editor.click();
    await page.keyboard.type("Contenu de test E2E créé automatiquement.");

    await page.getByRole("button", { name: /Enregistrer/i }).click();
    // Soit toast soit redirection vers /admin/content/pages/[id]
    await page.waitForURL(/\/admin\/content\/pages\/[a-f0-9-]{36}/, {
      timeout: 8_000,
    });

    // Publier
    await page.getByRole("button", { name: /^Publier$/i }).click();
    await expect(page.getByText(/Page publiée/i).first()).toBeVisible({
      timeout: 5_000,
    });

    // Badge passe en "Publié"
    await expect(page.locator("text=Publié").first()).toBeVisible({
      timeout: 4_000,
    });

    // Cleanup — supprimer
    await page
      .getByRole("button", { name: /Supprimer$/i })
      .first()
      .click();
    await page
      .getByRole("button", { name: /^Supprimer$/i })
      .last()
      .click();
    await page.waitForURL(/\/admin\/content\/pages($|\?)/, { timeout: 8_000 });
  });

  test("XSS : un <script> injecté dans le contenu est strip à la sauvegarde", async ({
    page,
  }) => {
    const slug = `${SLUG_PREFIX}-xss`;

    await page.goto("/admin/content/pages/new");
    await page.fill("input#title", "E2E XSS Sanitization");
    await page.fill("input#slug", slug);

    const editor = page.locator('[contenteditable="true"]').first();
    await editor.waitFor({ state: "visible" });
    await editor.click();
    // On injecte du HTML brut via pasteHTML : on bascule l'attribut contentEditable
    // et on évalue document.execCommand pour insérer raw HTML. Sinon Playwright
    // tapererait le texte littéral.
    await page.evaluate(() => {
      const sel = document.querySelector(
        '[contenteditable="true"]',
      ) as HTMLDivElement | null;
      if (!sel) return;
      sel.focus();
      sel.innerHTML =
        '<p>Texte légitime</p><script>window.__pwned=true;</script><p onclick="alert(1)">Click me</p>';
      sel.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await page.getByRole("button", { name: /Enregistrer/i }).click();
    await page.waitForURL(/\/admin\/content\/pages\/[a-f0-9-]{36}/, {
      timeout: 8_000,
    });

    // On revient sur l'édition : le contenu re-lu doit être sanitisé
    // (pas de <script>, pas de onclick=).
    await page.reload();
    const editorReloaded = page.locator('[contenteditable="true"]').first();
    await editorReloaded.waitFor({ state: "visible", timeout: 8_000 });
    const html = await editorReloaded.evaluate(
      (el) => (el as HTMLElement).innerHTML,
    );
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html.toLowerCase()).not.toContain("onclick=");
    expect(html).toContain("Texte légitime");

    // Cleanup
    await page
      .getByRole("button", { name: /Supprimer$/i })
      .first()
      .click();
    await page
      .getByRole("button", { name: /^Supprimer$/i })
      .last()
      .click();
    await page.waitForURL(/\/admin\/content\/pages($|\?)/, { timeout: 8_000 });
  });

  test("création et suppression d'un bloc CMS", async ({ page }) => {
    const key = `${BLOCK_PREFIX}.hero`;

    await page.goto("/admin/content/blocks");
    await expect(page.locator("h1").first()).toContainText(
      /Blocs réutilisables/i,
      { timeout: 6_000 },
    );

    await page.getByRole("button", { name: /Nouveau bloc/i }).click();
    await page.fill("input#block-key", key);
    await page.fill("textarea#block-body", "Body de test E2E");

    await page.getByRole("button", { name: /Créer$/i }).click();
    await page.waitForURL(/\/admin\/content\/blocks\/[a-f0-9-]{36}/, {
      timeout: 8_000,
    });

    // Cleanup
    await page.getByRole("button", { name: /Supprimer le bloc/i }).click();
    await page
      .getByRole("button", { name: /^Supprimer$/i })
      .last()
      .click();
    await page.waitForURL(/\/admin\/content\/blocks($|\?)/, { timeout: 8_000 });
  });
});

test.describe("CMS RBAC — un COLLABORATEUR ne peut pas accéder à /admin/content", () => {
  test.skip(
    !process.env.E2E_COLLAB_AUTH,
    "Storage state COLLABORATEUR non disponible — skipper",
  );

  test.use({ storageState: process.env.E2E_COLLAB_AUTH });

  test("redirect ou 403 sur /admin/content", async ({ page }) => {
    const response = await page.goto("/admin/content");
    // Soit la page client redirige vers /unauthorized ou /, soit on a un 403
    const status = response?.status() ?? 0;
    const finalUrl = page.url();
    if (status === 403) {
      expect(status).toBe(403);
    } else {
      expect(finalUrl).not.toMatch(/\/admin\/content/);
    }
  });
});
