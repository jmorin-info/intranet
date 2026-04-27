/**
 * Tests Vitest — sanitize-highlight.
 *
 * Verifie que :
 *  - les balises <mark>...</mark> sont preservees (re-injectees avec classes Tailwind)
 *  - tout autre HTML est echappe (pas de XSS via le contenu indexe)
 *  - les entites HTML deja presentes dans le texte source sont aussi echappees
 *    (afin que le rendu visuel reflete la chaine originale)
 */

import { describe, it, expect } from "vitest";
import { sanitizeHighlight } from "../sanitize-highlight";

describe("sanitizeHighlight", () => {
  it("retourne une chaine vide pour input vide", () => {
    expect(sanitizeHighlight("")).toBe("");
  });

  it("preserve les <mark> Meilisearch en y ajoutant les classes Tailwind", () => {
    const out = sanitizeHighlight("hello <mark>world</mark>");
    expect(out).toContain('<mark class="bg-amber-200/80');
    expect(out).toContain("</mark>");
    expect(out).toContain("world");
  });

  it("echappe une balise <script> dans le texte (XSS protection)", () => {
    const out = sanitizeHighlight("<script>alert('xss')</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("alert(&#39;xss&#39;)");
  });

  it("echappe une balise <img onerror> tordue", () => {
    const out = sanitizeHighlight('<img src=x onerror="alert(1)">');
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("preserve plusieurs <mark> sur la meme ligne", () => {
    const out = sanitizeHighlight(
      "<mark>iso</mark> politique <mark>27001</mark>",
    );
    const matches = out.match(/<mark class=/g);
    expect(matches).toHaveLength(2);
  });

  it("echappe le ET commercial dans le texte", () => {
    const out = sanitizeHighlight("R&D");
    expect(out).toContain("R&amp;D");
  });

  it("echappe les guillemets et apostrophes", () => {
    const out = sanitizeHighlight(`"test" 'test'`);
    expect(out).toContain("&quot;test&quot;");
    expect(out).toContain("&#39;test&#39;");
  });

  it("preserve <mark> avec contenu accentue (typo Meili FR)", () => {
    const out = sanitizeHighlight("<mark>Procédure</mark> de sauvegarde");
    expect(out).toContain("Procédure");
    expect(out).toContain('<mark class="bg-amber-200');
  });

  it("ne casse pas si le HTML d'entree est deja echappe (Meili pre-encode parfois)", () => {
    const out = sanitizeHighlight("&amp;lt;<mark>foo</mark>&amp;gt;");
    // Le "&" deja present est re-echappe (defensive) — c'est attendu.
    expect(out).toContain("&amp;amp;lt;");
    expect(out).toContain('<mark class="bg-amber-200');
  });
});
