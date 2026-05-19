import { describe, it, expect } from "vitest";

import { normalizeStirlingShortcut, FALLBACK_STIRLING_TOOLS } from "../_cms";

describe("tools.pdf.shortcuts normalizer", () => {
  it("accepte un raccourci bien formé", () => {
    const item = FALLBACK_STIRLING_TOOLS[0];
    expect(normalizeStirlingShortcut(item)).toEqual(item);
  });

  it("rejette une iconKey hors registry", () => {
    expect(
      normalizeStirlingShortcut({
        label: "X",
        path: "/x",
        iconKey: "Unknown",
      }),
    ).toBeNull();
  });

  it("rejette un path sans slash initial (Stirling impose un chemin absolu)", () => {
    expect(
      normalizeStirlingShortcut({
        label: "X",
        path: "merge-pdfs",
        iconKey: "Merge",
      }),
    ).toBeNull();
  });

  it("rejette les champs manquants", () => {
    expect(normalizeStirlingShortcut({ label: "X", path: "/x" })).toBeNull();
    expect(normalizeStirlingShortcut(null)).toBeNull();
  });

  it("les 6 fallback sont valides", () => {
    expect(FALLBACK_STIRLING_TOOLS).toHaveLength(6);
    FALLBACK_STIRLING_TOOLS.forEach((s) => {
      expect(normalizeStirlingShortcut(s)).toEqual(s);
      expect(s.path.startsWith("/")).toBe(true);
    });
  });
});
