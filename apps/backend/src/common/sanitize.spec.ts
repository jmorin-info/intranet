import { sanitizePlainText, sanitizeRichText } from "./sanitize";

/**
 * Couverture défensive XSS pour `sanitize-html` + nos wrappers. La lib est
 * mature, on ne la re-teste pas — on s'assure que la whitelist OMNITECH
 * neutralise les vecteurs OWASP classiques sur les **payloads réellement
 * consommés** par le CMS (titre, contenu, slug…).
 *
 * Ajouter une entrée si un nouveau vecteur est découvert / signalé pendant
 * un audit (penser à mettre un commentaire avec la référence audit/CVE).
 */
describe("sanitize — vecteurs XSS OMNITECH", () => {
  describe("sanitizePlainText (titres, slugs, refs)", () => {
    const cases: Array<{ name: string; input: string; expected: RegExp }> = [
      {
        name: "balise <script> simple",
        input: "Bonjour<script>alert(1)</script>",
        expected: /^Bonjouralert\(1\)$/,
      },
      {
        name: "balise <img onerror=>",
        input: 'Hello<img src=x onerror="alert(1)">',
        expected: /^Hello$/,
      },
      {
        name: "lien javascript:",
        input: 'Cliquez<a href="javascript:alert(1)">ici</a>',
        expected: /^Cliquezici$/,
      },
      {
        name: "iframe injection",
        input: 'OK<iframe src="evil.com"></iframe>',
        expected: /^OK$/,
      },
      {
        name: "balise SVG avec onload",
        input: '<svg onload="alert(1)">test</svg>',
        expected: /^test$/,
      },
    ];

    it.each(cases)("strip $name", ({ input, expected }) => {
      const out = sanitizePlainText(input);
      expect(out).toMatch(expected);
      expect(out.toLowerCase()).not.toMatch(/<script|onerror|onload|onclick/);
      expect(out.toLowerCase()).not.toMatch(/javascript:|data:/);
    });
  });

  describe("sanitizeRichText (contenu CMS)", () => {
    /**
     * Une entrée du test : payload XSS attendu + ce qui doit rester
     * (forbiddenSubstrings et requiredSubstrings) ou être strip après
     * sanitisation.
     */
    const cases: Array<{
      name: string;
      input: string;
      mustNotContain: string[];
      mustContain?: string[];
    }> = [
      {
        name: "<script> entre paragraphes légitimes",
        input: "<p>Avant</p><script>window.x=1;</script><p>Après</p>",
        mustNotContain: ["<script", "window.x"],
        mustContain: ["<p>Avant</p>", "<p>Après</p>"],
      },
      {
        name: "handler inline onclick",
        input: '<p onclick="alert(1)">Click</p>',
        mustNotContain: ["onclick"],
        mustContain: ["<p>Click</p>"],
      },
      {
        name: "handler inline onmouseover",
        input: '<a href="https://ok.com" onmouseover="evil()">link</a>',
        mustNotContain: ["onmouseover", "evil"],
      },
      {
        name: "img onerror",
        input: '<img src="x" onerror="alert(1)" />',
        mustNotContain: ["onerror"],
      },
      {
        name: "URI javascript: dans un lien",
        input: '<a href="javascript:alert(1)">x</a>',
        mustNotContain: ["javascript:"],
      },
      {
        name: "URI data: pour <a>",
        input: '<a href="data:text/html,<script>alert(1)</script>">x</a>',
        mustNotContain: ["data:text/html", "<script"],
      },
      {
        name: "iframe (interdit même avec src safe)",
        input: '<iframe src="https://ok.com"></iframe>',
        mustNotContain: ["<iframe"],
      },
      {
        name: "form (interdit)",
        input: '<form action="https://evil"><input type="text"/></form>',
        mustNotContain: ["<form", "<input"],
      },
      {
        name: "<style> tag (CSS injection)",
        input: "<style>body{display:none}</style><p>texte</p>",
        mustNotContain: ["<style"],
        mustContain: ["<p>texte</p>"],
      },
      {
        name: "SVG avec onload",
        input: '<svg onload="alert(1)"><circle r="10"/></svg>',
        mustNotContain: ["onload", "<svg"],
      },
      {
        name: "MathML (vecteur DOMPurify cheatsheet)",
        input:
          "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>",
        mustNotContain: ["onerror", "<math", "<style"],
      },
      {
        name: "balise rich-text légitime préservée",
        input:
          "<h2>Titre</h2><p><strong>gras</strong> et <em>italique</em>, <code>x = 1</code></p><ul><li>item</li></ul>",
        mustNotContain: ["<script", "javascript:"],
        mustContain: [
          "<h2>Titre</h2>",
          "<strong>gras</strong>",
          "<em>italique</em>",
          "<code>x = 1</code>",
          "<li>item</li>",
        ],
      },
      {
        name: "lien externe — target=_blank + rel=noopener auto",
        input: '<a href="https://ok.com">x</a>',
        mustNotContain: ["onclick", "javascript:"],
        mustContain: ['target="_blank"', 'rel="noopener noreferrer"'],
      },
    ];

    it.each(cases)("$name", ({ input, mustNotContain, mustContain }) => {
      const out = sanitizeRichText(input);
      for (const forbidden of mustNotContain) {
        expect(out.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }
      if (mustContain) {
        for (const required of mustContain) {
          expect(out).toContain(required);
        }
      }
    });

    it("retourne chaîne vide pour null / undefined / vide", () => {
      expect(sanitizeRichText(null)).toBe("");
      expect(sanitizeRichText(undefined)).toBe("");
      expect(sanitizeRichText("")).toBe("");
    });
  });
});
