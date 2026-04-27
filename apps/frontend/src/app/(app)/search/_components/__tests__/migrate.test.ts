/**
 * Tests Vitest — migration des recherches sauvegardees v1 -> v2.
 *
 * Couvre les cas degenres (JSON corrompu, entrees partielles) et la traduction
 * du schema legacy (`type`, `dateRange`, `classification`) vers le nouveau
 * (`modules[]`, `categories[]`, `classifications[]`, `statuses[]`).
 */

import { describe, it, expect } from "vitest";
import { migrateLegacySearches } from "../migrate";

describe("migrateLegacySearches", () => {
  it("retourne [] pour JSON corrompu", () => {
    expect(migrateLegacySearches("{not-json")).toEqual([]);
  });

  it("retourne [] si la racine n'est pas un array", () => {
    expect(migrateLegacySearches('{"foo":"bar"}')).toEqual([]);
  });

  it("ignore les entrees sans query", () => {
    const raw = JSON.stringify([{ id: "x", name: "test" }, { query: 123 }]);
    expect(migrateLegacySearches(raw)).toEqual([]);
  });

  it("traduit type=documents en modules=[documents]", () => {
    const raw = JSON.stringify([
      { id: "1", name: "Mes docs", query: "iso", type: "documents" },
    ]);
    const out = migrateLegacySearches(raw);
    expect(out).toHaveLength(1);
    const first = out[0]!;
    expect(first.modules).toEqual(["documents"]);
    expect(first.query).toBe("iso");
    expect(first.name).toBe("Mes docs");
  });

  it("traduit type=all en modules=[]", () => {
    const raw = JSON.stringify([
      { id: "1", query: "test", type: "all" },
    ]);
    const out = migrateLegacySearches(raw);
    expect(out[0]!.modules).toEqual([]);
  });

  it("traduit classification en classifications uppercase array", () => {
    const raw = JSON.stringify([
      { id: "1", query: "x", classification: "internE" },
    ]);
    const out = migrateLegacySearches(raw);
    expect(out[0]!.classifications).toEqual(["INTERNE"]);
  });

  it("ignore classification=all", () => {
    const raw = JSON.stringify([
      { id: "1", query: "x", classification: "all" },
    ]);
    const out = migrateLegacySearches(raw);
    expect(out[0]!.classifications).toEqual([]);
  });

  it("conserve le sortBy s'il est valide, sinon fallback sur 'relevance'", () => {
    const raw = JSON.stringify([
      { query: "a", sortBy: "newest" },
      { query: "b", sortBy: "wat" },
      { query: "c" }, // sans sortBy
    ]);
    const out = migrateLegacySearches(raw);
    expect(out[0]!.sort).toBe("newest");
    expect(out[1]!.sort).toBe("relevance");
    expect(out[2]!.sort).toBe("relevance");
  });

  it("genere un nom par defaut a partir de la query si name est manquant", () => {
    const raw = JSON.stringify([{ query: "politique de mot de passe" }]);
    const out = migrateLegacySearches(raw);
    expect(out[0]!.name).toBe("politique de mot de passe");
  });

  it("genere un id si manquant", () => {
    const raw = JSON.stringify([{ query: "a" }, { query: "b" }]);
    const out = migrateLegacySearches(raw);
    expect(out[0]!.id).toBeTruthy();
    expect(out[1]!.id).toBeTruthy();
    expect(out[0]!.id).not.toBe(out[1]!.id);
  });

  it("dateRange n'a pas d'equivalent direct — abandonne (categories vides)", () => {
    const raw = JSON.stringify([
      { query: "x", type: "documents", dateRange: "week" },
    ]);
    const out = migrateLegacySearches(raw);
    // dateRange est abandonne (non migre)
    expect(out[0]!.categories).toEqual([]);
    expect(out[0]!.statuses).toEqual([]);
  });

  it("preserve createdAt si fourni, sinon insere now()", () => {
    const fixed = "2024-01-01T00:00:00.000Z";
    const raw = JSON.stringify([
      { query: "a", createdAt: fixed },
      { query: "b" },
    ]);
    const out = migrateLegacySearches(raw);
    expect(out[0]!.createdAt).toBe(fixed);
    expect(new Date(out[1]!.createdAt).getTime()).toBeGreaterThan(0);
  });
});
