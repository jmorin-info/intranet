import { describe, it, expect } from "vitest";

import {
  normalizeCard as normalizeSecurityCard,
  FALLBACK_CARDS as FALLBACK_SECURITY_CARDS,
} from "../security/_cms";
import {
  normalizeCard as normalizeWorkCard,
  FALLBACK_CARDS as FALLBACK_WORK_CARDS,
} from "../work/_cms";

describe("hub.security.cards normalizer", () => {
  it("accepte un item bien formé", () => {
    const item = FALLBACK_SECURITY_CARDS[0];
    expect(normalizeSecurityCard(item)).toEqual(item);
  });

  it("rejette un iconKey inconnu", () => {
    expect(
      normalizeSecurityCard({
        title: "X",
        description: "Y",
        href: "/x",
        iconKey: "NotARealIcon",
      }),
    ).toBeNull();
  });

  it("rejette les champs manquants", () => {
    expect(
      normalizeSecurityCard({
        title: "X",
        description: "Y",
        href: "/x",
        // iconKey manquant
      }),
    ).toBeNull();
  });

  it("ignore les badgeKey inconnues sans bloquer l'item", () => {
    const card = {
      title: "X",
      description: "Y",
      href: "/x",
      iconKey: "Star",
      badgeKey: "nonexistent_counter",
    };
    const result = normalizeSecurityCard(card);
    expect(result).not.toBeNull();
    expect(result?.badgeKey).toBeUndefined();
  });

  it("le fallback 7 cartes est entièrement valide", () => {
    expect(FALLBACK_SECURITY_CARDS).toHaveLength(7);
    FALLBACK_SECURITY_CARDS.forEach((c) => {
      expect(normalizeSecurityCard(c)).toEqual(c);
    });
  });
});

describe("hub.work.cards normalizer", () => {
  it("accepte un item bien formé", () => {
    const item = FALLBACK_WORK_CARDS[0];
    expect(normalizeWorkCard(item)).toEqual(item);
  });

  it("rejette les valeurs primitives / null", () => {
    expect(normalizeWorkCard(null)).toBeNull();
    expect(normalizeWorkCard("string")).toBeNull();
    expect(normalizeWorkCard(42)).toBeNull();
  });

  it("le fallback 8 cartes est entièrement valide", () => {
    expect(FALLBACK_WORK_CARDS).toHaveLength(8);
    FALLBACK_WORK_CARDS.forEach((c) => {
      expect(normalizeWorkCard(c)).toEqual(c);
    });
  });
});
