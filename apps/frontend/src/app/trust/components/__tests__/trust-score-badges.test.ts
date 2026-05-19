import { describe, it, expect } from "vitest";

import { normalizeBadge, FALLBACK_BADGES } from "../trust-score";

describe("trust.score.badges normalizer", () => {
  it("accepte un badge bien formé", () => {
    const item = FALLBACK_BADGES[0];
    expect(normalizeBadge(item)).toEqual(item);
  });

  it("rejette un status hors enum", () => {
    expect(
      normalizeBadge({
        key: "x",
        label: "Y",
        caption: "Z",
        status: "MAYBE",
      }),
    ).toBeNull();
  });

  it("accepte les 3 statuts valides", () => {
    for (const status of ["OK", "PARTIAL", "UNKNOWN"] as const) {
      const item = {
        key: "test",
        label: "Test",
        caption: "Cap",
        status,
      };
      expect(normalizeBadge(item)).toEqual(item);
    }
  });

  it("rejette les champs manquants", () => {
    expect(
      normalizeBadge({ label: "Y", caption: "Z", status: "OK" }),
    ).toBeNull();
    expect(normalizeBadge({ key: "x", caption: "Z", status: "OK" })).toBeNull();
    expect(normalizeBadge(null)).toBeNull();
  });

  it("les 4 badges fallback sont valides", () => {
    expect(FALLBACK_BADGES).toHaveLength(4);
    FALLBACK_BADGES.forEach((b) => {
      expect(normalizeBadge(b)).toEqual(b);
    });
  });
});
