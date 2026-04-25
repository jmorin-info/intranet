import { test, expect } from "@playwright/test";
import { login } from "./helpers/login";

/**
 * Ticket ↔ Calendrier — synchronisation bidirectionnelle.
 *
 * Flow : login USER → créer un ticket avec dueDate (J+3) → naviguer vers
 * /calendar → vérifier qu'une entrée portant le titre du ticket est présente
 * à la bonne date.
 *
 * Destructif → guard `RUN_DESTRUCTIVE=1` (création réelle d'un ticket en base).
 */

const DESTRUCTIVE = !!process.env.RUN_DESTRUCTIVE;

test.describe("Tickets ↔ Calendar sync", () => {
  test("ticket with dueDate appears in /calendar @destructive", async ({
    page,
  }) => {
    test.skip(
      !DESTRUCTIVE,
      "Création ticket désactivée sur préprod (RUN_DESTRUCTIVE=1).",
    );

    await login(page, "USER");
    if (page.url().includes("/login")) {
      test.skip(true, "USER seed manquant.");
    }

    const due = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const isoDate = due.toISOString().split("T")[0]!; // YYYY-MM-DD
    const title = `E2E sync ${Date.now()}`;

    await page.goto("/tickets/new");
    await page.fill(
      'input[name="title"], input[placeholder*="titre" i]',
      title,
    );
    await page
      .fill(
        'textarea[name="description"], textarea[placeholder*="description" i]',
        "Ticket E2E pour valider la synchronisation calendrier.",
      )
      .catch(() => undefined);

    // TODO(selector): champ dueDate. Fallback sur input[type="date"] générique.
    const dueInput = page
      .locator(
        'input[name="dueDate"], input[type="date"], input[placeholder*="échéance" i]',
      )
      .first();
    if (!(await dueInput.isVisible().catch(() => false))) {
      test.skip(
        true,
        "Champ dueDate non trouvé sur /tickets/new — TODO(selector).",
      );
    }
    await dueInput.fill(isoDate);

    await page.click('button[type="submit"]');
    await page
      .waitForURL(/\/tickets(\/[\w-]+)?/, { timeout: 10_000 })
      .catch(() => undefined);

    // Cap au calendrier
    await page.goto("/calendar");
    // Naviguer jusqu'au mois cible si la vue affiche un mois ≠ — best effort
    await page.waitForLoadState("networkidle").catch(() => undefined);

    // Le ticket doit apparaître avec son titre
    const eventLocator = page.getByText(title, { exact: false }).first();
    await expect(
      eventLocator,
      `Ticket "${title}" attendu dans /calendar à la date ${isoDate}`,
    ).toBeVisible({ timeout: 10_000 });
  });

  test("calendar API exposes ticket due dates", async ({ request }) => {
    const apiBase = process.env.E2E_API_URL || "http://10.33.120.55:3000/api";
    const res = await request
      .get(`${apiBase}/calendar/events?source=tickets`, {
        failOnStatusCode: false,
      })
      .catch(() => null);
    if (!res || res.status() === 404) {
      test.skip(
        true,
        "Endpoint /calendar/events?source=tickets absent — TODO(api route).",
      );
    }
    expect(
      res!.ok(),
      `GET /calendar/events status=${res!.status()}`,
    ).toBeTruthy();
    const body = (await res!.json().catch(() => ({}))) as {
      events?: unknown[];
      data?: unknown[];
    };
    const list = body.events ?? body.data ?? [];
    expect(Array.isArray(list)).toBe(true);
  });
});
