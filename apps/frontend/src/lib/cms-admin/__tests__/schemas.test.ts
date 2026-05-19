import { describe, it, expect } from "vitest";

import { resolveSchema, listKnownSchemaKeys, SCHEMAS } from "../schemas";

describe("CMS schema registry", () => {
  it("resolveSchema retourne null pour une clé inconnue", () => {
    expect(resolveSchema("nope.unknown")).toBeNull();
    expect(resolveSchema("")).toBeNull();
  });

  it("resolveSchema retourne le schéma pour les 20 clés connues", () => {
    const expected = [
      "welcome.hero.title",
      "welcome.hero.subtitle",
      "welcome.hero.cta",
      "welcome.steps",
      "welcome.services",
      "welcome.faq",
      "trust.hero",
      "trust.commitments",
      "trust.certifications",
      "trust.contact",
      "trust.score.badges",
      "dashboard.daily_tips",
      "hub.security.cards",
      "hub.work.cards",
      "onboarding.steps",
      "onboarding.shortcuts",
      "onboarding.welcome_message",
      "auth.tagline",
      "kiosk.labels",
      "tools.pdf.shortcuts",
    ];
    for (const k of expected) {
      const s = resolveSchema(k);
      expect(s, `schéma manquant pour ${k}`).not.toBeNull();
      expect(s?.key).toBe(k);
    }
  });

  it("listKnownSchemaKeys retourne toutes les clés sans doublons", () => {
    const keys = listKnownSchemaKeys();
    expect(keys.length).toBe(SCHEMAS.length);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("les schémas d'objets ont au moins 1 champ", () => {
    for (const s of SCHEMAS) {
      if (s.data?.kind === "object") {
        expect(
          s.data.fields.length,
          `schéma object vide pour ${s.key}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("les schémas d'arrays ont une définition d'item valide", () => {
    for (const s of SCHEMAS) {
      if (s.data?.kind === "array") {
        const item = s.data.item;
        if (item.kind === "object") {
          expect(item.fields.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("toutes les enum/icon options ont un value unique au sein du champ", () => {
    function walk(fields: ReadonlyArray<{ name: string; type: unknown }>) {
      for (const f of fields) {
        const t = f.type as { kind: string; options?: { value: string }[] };
        if (t.kind === "enum" || t.kind === "icon") {
          const values = t.options!.map((o) => o.value);
          expect(new Set(values).size).toBe(values.length);
        }
      }
    }
    for (const s of SCHEMAS) {
      if (s.data?.kind === "object") walk(s.data.fields);
      else if (s.data?.kind === "array" && s.data.item.kind === "object") {
        walk(s.data.item.fields);
      }
    }
  });
});
