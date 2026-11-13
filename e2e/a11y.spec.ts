import { test, expect } from "./helpers/safe-test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Audit a11y automatisé — WCAG 2.1 niveau AA.
 *
 * Stratégie :
 *  - Pour chaque page critique (publique + 1 page authentifiée), on lance
 *    `axe-core` via `@axe-core/playwright`. Le test échoue si au moins une
 *    violation impact `critical` ou `serious` est détectée.
 *  - Les violations `moderate` / `minor` sont rapportées en console mais
 *    n'échouent PAS le test — elles sont à examiner manuellement.
 *  - Tags axe utilisés : wcag2a, wcag2aa, best-practice (sans `wcag2aaa`
 *    qui est trop strict pour un intranet métier).
 *
 * Lancement :
 *   pnpm test:e2e -- a11y.spec.ts
 *   pnpm test:e2e -- a11y.spec.ts --project=chromium  # plus rapide
 *
 * Si tu touches une page critique, vérifier que ce test reste vert avant
 * de merger. Bonne pratique : intégrer en CI (GitHub Actions).
 */

const PUBLIC_PAGES = [
  "/welcome",
  "/login",
  "/trust",
  "/legal",
  "/privacy-policy",
  "/cookies",
  "/dpa",
  "/kiosk",
];

// Une page authentifiée représentative — le storageState admin est chargé
// via le projet `chromium` (cf. playwright.config.ts).
const AUTHENTICATED_PAGES = ["/dashboard", "/admin/content/blocks"];

/**
 * Lance axe-core sur la page courante et n'expose que les violations
 * de sévérité haute. Les violations de niveau moderate/minor sont loguées
 * mais non bloquantes — elles méritent revue mais pas blocage CI.
 */
async function runAxe(page: import("@playwright/test").Page, path: string) {
  const authenticated = path.startsWith('/dashboard') || path.startsWith('/admin/');
  const profile = authenticated
    ? page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/auth/me') && response.status() === 200)
    : null;
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  if (profile) await profile;
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "best-practice"])
    // Désactiver les règles trop bruyantes pour un audit progressif :
    // - color-contrast : déjà couvert manuellement par le rapport UX (PR a11y)
    //   et axe peut être trop strict sur certains placeholders.
    // - region : nos pages mainstream ont déjà un <main>, mais certaines
    //   admin n'ont pas encore d'aria-region partout.
    .disableRules(["color-contrast", "region"])
    .analyze();

  const high = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
  const low = results.violations.filter(
    (v) => v.impact === "moderate" || v.impact === "minor",
  );

  if (low.length > 0) {
    console.log(
      `[a11y] ${path} — ${low.length} violation(s) moderate/minor (non bloquant) :`,
    );
    for (const v of low) {
      console.log(`  · [${v.impact}] ${v.id} : ${v.help}`);
    }
  }

  // Message d'erreur détaillé si violations bloquantes
  if (high.length > 0) {
    const summary = high
      .map(
        (v) =>
          `  · [${v.impact}] ${v.id} (${v.nodes.length} node${v.nodes.length > 1 ? "s" : ""}) : ${v.help}\n    → ${v.helpUrl}`,
      )
      .join("\n");
    throw new Error(
      `${high.length} violation(s) critical/serious détectée(s) sur ${path} :\n${summary}`,
    );
  }
}

test.describe("a11y — pages publiques (sans auth)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const path of PUBLIC_PAGES) {
    test(`${path} — pas de violation critical/serious`, async ({ page }) => {
      await runAxe(page, path);
    });
  }
});

test.describe("a11y — pages authentifiées", () => {
  // Utilise le storageState `admin.json` chargé par global-setup.

  for (const path of AUTHENTICATED_PAGES) {
    test(`${path} — pas de violation critical/serious`, async ({ page }) => {
      await runAxe(page, path);
    });
  }
});
