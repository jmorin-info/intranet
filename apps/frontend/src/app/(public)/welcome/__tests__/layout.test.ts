import { describe, it, expect } from "vitest";

import { normalizeWelcomeLayout, DEFAULT_LAYOUT } from "../_layout";

describe("welcome.layout normalizer", () => {
  it("retourne DEFAULT_LAYOUT si null/undefined/primitive", () => {
    expect(normalizeWelcomeLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(normalizeWelcomeLayout(undefined)).toEqual(DEFAULT_LAYOUT);
    expect(normalizeWelcomeLayout("string")).toEqual(DEFAULT_LAYOUT);
    expect(normalizeWelcomeLayout(42)).toEqual(DEFAULT_LAYOUT);
  });

  it("retourne DEFAULT_LAYOUT si les 2 listes sont vides", () => {
    expect(
      normalizeWelcomeLayout({ topSections: [], bottomSections: [] }),
    ).toEqual(DEFAULT_LAYOUT);
  });

  it("accepte un layout custom valide", () => {
    const result = normalizeWelcomeLayout({
      topSections: ["banner", "media"],
      bottomSections: ["testimonials"],
    });
    expect(result.topSections).toEqual(["banner", "media"]);
    expect(result.bottomSections).toEqual(["testimonials"]);
  });

  it("filtre les sections inconnues", () => {
    const result = normalizeWelcomeLayout({
      topSections: ["banner", "evil-script", "hero"],
      bottomSections: ["testimonials"],
    });
    expect(result.topSections).toEqual(["banner"]);
  });

  it("filtre les doublons (chaque section ne s'affiche qu'une fois)", () => {
    const result = normalizeWelcomeLayout({
      topSections: ["banner", "banner", "media"],
      bottomSections: ["testimonials", "testimonials"],
    });
    expect(result.topSections).toEqual(["banner", "media"]);
    expect(result.bottomSections).toEqual(["testimonials"]);
  });

  it("accepte un layout où top est vide mais bottom est rempli", () => {
    const result = normalizeWelcomeLayout({
      topSections: [],
      bottomSections: ["banner", "media", "testimonials"],
    });
    expect(result.topSections).toEqual([]);
    expect(result.bottomSections).toEqual(["banner", "media", "testimonials"]);
  });

  it("ignore les éléments non-string dans les arrays", () => {
    const result = normalizeWelcomeLayout({
      topSections: ["banner", 42, null, { evil: true }],
      bottomSections: ["media"],
    });
    expect(result.topSections).toEqual(["banner"]);
  });
});
