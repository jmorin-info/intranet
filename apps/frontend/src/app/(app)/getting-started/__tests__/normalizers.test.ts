import { describe, it, expect } from "vitest";

import {
  normalizeStep,
  normalizeShortcut,
  normalizeWelcomeMessage,
  FALLBACK_STEPS,
  FALLBACK_SHORTCUTS,
  FALLBACK_WELCOME_MESSAGE,
  ALLOWED_GRADIENTS,
} from "../_cms";

describe("onboarding.steps normalizer", () => {
  it("accepte une étape bien formée", () => {
    expect(normalizeStep(FALLBACK_STEPS[0])).toEqual(FALLBACK_STEPS[0]);
  });

  it("rejette un id hors de l'enum status", () => {
    const broken = { ...FALLBACK_STEPS[0], id: "unknown_step" };
    expect(normalizeStep(broken)).toBeNull();
  });

  it("rejette un iconKey inconnu", () => {
    const broken = { ...FALLBACK_STEPS[0], iconKey: "NotAnIcon" };
    expect(normalizeStep(broken)).toBeNull();
  });

  it("rejette un gradient hors whitelist (purge Tailwind)", () => {
    const broken = {
      ...FALLBACK_STEPS[0],
      gradient: "from-pink-500 to-blue-500",
    };
    expect(normalizeStep(broken)).toBeNull();
  });

  it.each([
    "title",
    "description",
    "href",
    "actionLabel",
    "gradient",
    "id",
    "iconKey",
  ])("rejette si %s manque", (field) => {
    const item: Record<string, unknown> = { ...FALLBACK_STEPS[0] };
    delete item[field];
    expect(normalizeStep(item)).toBeNull();
  });

  it("toutes les étapes fallback sont valides et utilisent un gradient whitelisté", () => {
    expect(FALLBACK_STEPS).toHaveLength(5);
    FALLBACK_STEPS.forEach((s) => {
      expect(normalizeStep(s)).toEqual(s);
      expect(ALLOWED_GRADIENTS[s.gradient]).toBe(true);
    });
  });
});

describe("onboarding.shortcuts normalizer", () => {
  it("accepte un raccourci bien formé", () => {
    expect(normalizeShortcut(FALLBACK_SHORTCUTS[0])).toEqual(
      FALLBACK_SHORTCUTS[0],
    );
  });

  it("rejette si keys ou label manque", () => {
    expect(normalizeShortcut({ keys: "⌘K" })).toBeNull();
    expect(normalizeShortcut({ label: "Recherche" })).toBeNull();
  });

  it("le fallback 5 raccourcis est entièrement valide", () => {
    expect(FALLBACK_SHORTCUTS).toHaveLength(5);
    FALLBACK_SHORTCUTS.forEach((s) => {
      expect(normalizeShortcut(s)).toEqual(s);
    });
  });
});

describe("onboarding.welcome_message normalizer", () => {
  it("accepte un message bien formé", () => {
    expect(normalizeWelcomeMessage(FALLBACK_WELCOME_MESSAGE)).toEqual(
      FALLBACK_WELCOME_MESSAGE,
    );
  });

  it("rejette si title ou body manque", () => {
    expect(normalizeWelcomeMessage({ title: "X" })).toBeNull();
    expect(normalizeWelcomeMessage({ body: "Y" })).toBeNull();
    expect(normalizeWelcomeMessage(null)).toBeNull();
    expect(normalizeWelcomeMessage("string")).toBeNull();
  });
});
