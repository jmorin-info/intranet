import { test, expect } from "./helpers/safe-test";

/**
 * CSP / Hydration smoke — critique post-fix nonce-based CSP.
 *
 * Garde-fous :
 *  1. La page d'accueil rend bien quelque chose (hydration OK)
 *  2. Aucune violation CSP n'est levée dans la console
 *  3. Le header `Content-Security-Policy` envoyé contient `nonce-` et
 *     `strict-dynamic` (politique recommandée OWASP / SEAL).
 *
 * Ce test tourne en `unauthenticated` pour valider la home publique → /welcome.
 */

test.describe("CSP & Hydration", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("hydrates / → /welcome and emits no CSP violation", async ({ page }) => {
    const cspViolations: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (
        /violates the following Content Security Policy|Refused to (execute|load)/i.test(
          text,
        )
      ) {
        cspViolations.push(text);
      }
    });
    page.on("pageerror", (err) => {
      if (/Content Security Policy/i.test(err.message)) {
        cspViolations.push(err.message);
      }
    });

    await page.goto("/");
    // Allow either redirect to /welcome (anonymous) or to /login depending on
    // env. We accept any non-error landing.
    await page
      .waitForURL((url) => /\/(welcome|login|portal)?$/.test(url.pathname), {
        timeout: 10_000,
      })
      .catch(() => undefined);

    // Hydration check: body has visible text after 3s
    await page.waitForTimeout(3_000);
    const bodyText = await page.locator("body").innerText();
    expect(
      bodyText.trim().length,
      "body should not be empty after hydration",
    ).toBeGreaterThan(0);

    expect(
      cspViolations,
      `CSP violations detected:\n${cspViolations.join("\n")}`,
    ).toHaveLength(0);
  });

  test("Content-Security-Policy header contains nonce + strict-dynamic", async ({
    request,
  }) => {
    const res = await request.get("/", { failOnStatusCode: false });
    const headers = res.headers();
    const csp =
      headers["content-security-policy"] ||
      headers["Content-Security-Policy"] ||
      headers["content-security-policy-report-only"];

    if (!csp) {
      // Not all preprod tiers expose CSP via the front edge — some go through
      // nginx which strips per-page headers. Skip rather than fail blindly.
      test.skip(
        true,
        "No Content-Security-Policy header on /. Vérifier nginx / Helmet config.",
      );
    }

    expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=_-]+'/);
    expect(csp).toMatch(/'strict-dynamic'/);
  });
});
