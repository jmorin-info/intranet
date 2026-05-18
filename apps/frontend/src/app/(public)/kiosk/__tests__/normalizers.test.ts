import { describe, it, expect } from "vitest";

import { normalizeKioskLabels, FALLBACK_KIOSK_LABELS } from "../_cms";

describe("kiosk.labels normalizer", () => {
  it("accepte une structure complète", () => {
    expect(normalizeKioskLabels(FALLBACK_KIOSK_LABELS)).toEqual(
      FALLBACK_KIOSK_LABELS,
    );
  });

  it("rejette si un écran manque", () => {
    const { news, ...rest } = FALLBACK_KIOSK_LABELS;
    void news;
    expect(normalizeKioskLabels(rest)).toBeNull();
  });

  it("rejette si un titre d'écran n'est pas une string", () => {
    const broken = {
      ...FALLBACK_KIOSK_LABELS,
      news: { title: 42, empty: "x" },
    };
    expect(normalizeKioskLabels(broken)).toBeNull();
  });

  it("rejette null/undefined/primitives", () => {
    expect(normalizeKioskLabels(null)).toBeNull();
    expect(normalizeKioskLabels("string")).toBeNull();
    expect(normalizeKioskLabels(42)).toBeNull();
  });

  it("rejette si footer n'est pas une string", () => {
    const broken = { ...FALLBACK_KIOSK_LABELS, footer: 123 };
    expect(normalizeKioskLabels(broken)).toBeNull();
  });
});
