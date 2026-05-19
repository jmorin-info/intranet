import { describe, it, expect } from "vitest";

import { normalizeThemeTokens, buildThemeCss } from "../cms-theme";

describe("normalizeThemeTokens — couleurs", () => {
  it("accepte un hex 6 chiffres valide", () => {
    const tokens = normalizeThemeTokens({
      colors: { sealOrange: "#f9964a" },
    });
    expect(tokens.colors.sealOrange).toBe("#f9964a");
  });

  it("accepte un hex 3 chiffres + un hex 8 chiffres (alpha)", () => {
    const tokens = normalizeThemeTokens({
      colors: { sealNavy: "#069", sealTaupe: "#83727480" },
    });
    expect(tokens.colors.sealNavy).toBe("#069");
    expect(tokens.colors.sealTaupe).toBe("#83727480");
  });

  it("rejette les couleurs hors hex (rgb, named, calc)", () => {
    const tokens = normalizeThemeTokens({
      colors: {
        sealOrange: "rgb(255,0,0)",
        sealBlue: "red",
        sealGreen: "calc(1px)",
        sealBordeaux: "var(--foo)",
      },
    });
    expect(tokens.colors.sealOrange).toBeUndefined();
    expect(tokens.colors.sealBlue).toBeUndefined();
    expect(tokens.colors.sealGreen).toBeUndefined();
    expect(tokens.colors.sealBordeaux).toBeUndefined();
  });

  it("rejette les clés hors whitelist (injection de CSS var arbitraire)", () => {
    const tokens = normalizeThemeTokens({
      colors: {
        "--evil": "#000000",
        "sealOrange; background: url(http://evil)": "#000000",
        unknownToken: "#abcdef",
      },
    });
    expect(Object.keys(tokens.colors).length).toBe(0);
  });
});

describe("normalizeThemeTokens — fontes", () => {
  it("accepte un stack de fontes valide", () => {
    const tokens = normalizeThemeTokens({
      fonts: {
        body: '"Inter", system-ui, sans-serif',
        display: "Arial, Helvetica, sans-serif",
      },
    });
    expect(tokens.fonts.body).toBe('"Inter", system-ui, sans-serif');
    expect(tokens.fonts.display).toBe("Arial, Helvetica, sans-serif");
  });

  it("rejette les caractères dangereux qui pourraient casser le <style>", () => {
    const tokens = normalizeThemeTokens({
      fonts: {
        body: "</style><script>alert(1)</script>",
        display: "Arial; background: url(evil)",
      },
    });
    expect(tokens.fonts.body).toBeUndefined();
    expect(tokens.fonts.display).toBeUndefined();
  });

  it("rejette les fontes trop longues (>200 caractères)", () => {
    const tokens = normalizeThemeTokens({
      fonts: { body: "A".repeat(201) },
    });
    expect(tokens.fonts.body).toBeUndefined();
  });
});

describe("normalizeThemeTokens — rayons", () => {
  it("accepte px et rem", () => {
    const tokens = normalizeThemeTokens({
      radii: { card: "12px", button: "0.5rem", input: "1em" },
    });
    expect(tokens.radii.card).toBe("12px");
    expect(tokens.radii.button).toBe("0.5rem");
    expect(tokens.radii.input).toBe("1em");
  });

  it("rejette calc() et var() et %", () => {
    const tokens = normalizeThemeTokens({
      radii: {
        card: "calc(8px + 4px)",
        button: "var(--foo)",
        input: "50%",
      },
    });
    expect(tokens.radii.card).toBeUndefined();
    expect(tokens.radii.button).toBeUndefined();
    expect(tokens.radii.input).toBeUndefined();
  });
});

describe("normalizeThemeTokens — entrées vides / mal formées", () => {
  it("retourne un objet vide pour null/undefined/primitif", () => {
    expect(normalizeThemeTokens(null)).toEqual({
      colors: {},
      fonts: {},
      radii: {},
    });
    expect(normalizeThemeTokens(undefined)).toEqual({
      colors: {},
      fonts: {},
      radii: {},
    });
    expect(normalizeThemeTokens("string")).toEqual({
      colors: {},
      fonts: {},
      radii: {},
    });
    expect(normalizeThemeTokens(42)).toEqual({
      colors: {},
      fonts: {},
      radii: {},
    });
  });
});

describe("buildThemeCss", () => {
  it("retourne une string vide si aucun token", () => {
    expect(buildThemeCss({ colors: {}, fonts: {}, radii: {} })).toBe("");
  });

  it("génère du CSS valide avec un mix de tokens", () => {
    const css = buildThemeCss({
      colors: { sealOrange: "#f9964a", sealNavy: "#004469" },
      fonts: { body: "Inter, sans-serif" },
      radii: { card: "16px" },
    });
    expect(css).toContain(":root{");
    expect(css).toContain("--seal-orange: #f9964a;");
    expect(css).toContain("--seal-navy: #004469;");
    expect(css).toContain("--font-body: Inter, sans-serif;");
    expect(css).toContain("--radius-card: 16px;");
    expect(css).toMatch(/^:root\{[^}]+\}$/);
  });

  it("ne contient AUCUN caractère hors whitelist (anti-injection)", () => {
    // Si jamais une valeur passait, le résultat ne doit pas contenir
    // <, >, &, etc.
    const css = buildThemeCss({
      colors: { sealOrange: "#f9964a" },
      fonts: {},
      radii: {},
    });
    expect(css).not.toContain("<");
    expect(css).not.toContain(">");
    expect(css).not.toContain("</style");
  });
});
