import { describe, it, expect } from "vitest";

import {
  normalizeCertification,
  FALLBACK_CERTIFICATIONS,
} from "../trust-certifications";
import { normalizeHero, FALLBACK_HERO } from "../trust-hero";
import { normalizeContact, FALLBACK_CONTACTS } from "../trust-contact";

describe("normalizeCertification", () => {
  it("accepte un item bien formé", () => {
    const item = {
      title: "ISO 27001:2022",
      subtitle: "SMSI certifié",
      description: "93 contrôles.",
      status: "conforme",
      lastAuditLabel: "Q1 2026",
    };
    expect(normalizeCertification(item)).toEqual(item);
  });

  it("rejette un statut inconnu (évite STATUS_META[undefined])", () => {
    const item = {
      title: "X",
      subtitle: "Y",
      description: "Z",
      status: "approved", // pas dans l'enum
      lastAuditLabel: "—",
    };
    expect(normalizeCertification(item)).toBeNull();
  });

  it.each(["title", "subtitle", "description", "lastAuditLabel"])(
    "rejette si %s manque",
    (field) => {
      const item: Record<string, unknown> = {
        title: "X",
        subtitle: "Y",
        description: "Z",
        status: "conforme",
        lastAuditLabel: "—",
      };
      delete item[field];
      expect(normalizeCertification(item)).toBeNull();
    },
  );

  it("rejette les valeurs non-string (number, null, undefined)", () => {
    expect(
      normalizeCertification({
        title: 42,
        subtitle: "Y",
        description: "Z",
        status: "conforme",
        lastAuditLabel: "—",
      }),
    ).toBeNull();
    expect(normalizeCertification(null)).toBeNull();
    expect(normalizeCertification(undefined)).toBeNull();
    expect(normalizeCertification("string")).toBeNull();
  });

  it("le fallback hardcodé contient 5 entrées toutes valides", () => {
    expect(FALLBACK_CERTIFICATIONS).toHaveLength(5);
    FALLBACK_CERTIFICATIONS.forEach((cert) => {
      expect(normalizeCertification(cert)).toEqual(cert);
    });
  });
});

describe("normalizeHero", () => {
  it("accepte un hero complet", () => {
    expect(normalizeHero(FALLBACK_HERO)).toEqual(FALLBACK_HERO);
  });

  it("rejette si un CTA est mal formé", () => {
    const broken = {
      ...FALLBACK_HERO,
      primaryCta: { label: "X" }, // pas de href
    };
    expect(normalizeHero(broken)).toBeNull();
  });

  it("rejette si une string principale manque", () => {
    const broken = { ...FALLBACK_HERO, subtitle: undefined };
    expect(normalizeHero(broken)).toBeNull();
  });

  it("rejette null/undefined/primitives", () => {
    expect(normalizeHero(null)).toBeNull();
    expect(normalizeHero(42)).toBeNull();
    expect(normalizeHero("string")).toBeNull();
  });
});

describe("normalizeContact", () => {
  it("accepte un contact bien formé", () => {
    const item = FALLBACK_CONTACTS[0];
    expect(normalizeContact(item)).toEqual(item);
  });

  it("rejette les iconKey inconnus (Mail/UserCog seulement)", () => {
    const item = {
      iconKey: "Phone",
      accent: "orange",
      label: "X",
      email: "a@b.fr",
    };
    expect(normalizeContact(item)).toBeNull();
  });

  it("rejette les accents inconnus (orange/blue seulement)", () => {
    const item = {
      iconKey: "Mail",
      accent: "magenta",
      label: "X",
      email: "a@b.fr",
    };
    expect(normalizeContact(item)).toBeNull();
  });

  it("le fallback contient 2 entrées valides", () => {
    expect(FALLBACK_CONTACTS).toHaveLength(2);
    FALLBACK_CONTACTS.forEach((c) => {
      expect(normalizeContact(c)).toEqual(c);
    });
  });
});
