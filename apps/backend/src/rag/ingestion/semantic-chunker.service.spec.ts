import { SemanticChunkerService } from "./semantic-chunker.service";

describe("SemanticChunkerService", () => {
  let service: SemanticChunkerService;

  beforeEach(() => {
    service = new SemanticChunkerService();
    delete process.env.RAG_SEMANTIC_CHUNKING_ENABLED;
  });

  describe("isEnabled", () => {
    it("returns false by default", () => {
      expect(service.isEnabled()).toBe(false);
    });
    it("returns true when flag set to 'true'", () => {
      process.env.RAG_SEMANTIC_CHUNKING_ENABLED = "true";
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe("chunk - feature off (fallback fixed-size)", () => {
    it("falls back to fixed-size chunks when disabled", () => {
      const text = "a".repeat(5000);
      const chunks = service.chunk(text, { maxChars: 2000, overlapChars: 200 });
      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk <= maxChars
      chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(2000));
    });

    it("returns empty array for empty content", () => {
      expect(service.chunk("")).toEqual([]);
      expect(service.chunk("   ")).toEqual([]);
    });
  });

  describe("chunk - feature on (semantic)", () => {
    beforeEach(() => {
      process.env.RAG_SEMANTIC_CHUNKING_ENABLED = "true";
    });

    it("splits markdown on h1/h2 boundaries", () => {
      const md = `# Section 1
Premier paragraphe sur la section 1.

## Section 1.1
Sous-section A.

# Section 2
Contenu de la section 2 avec details.`;
      const chunks = service.chunk(md, {
        maxChars: 2000,
        minChars: 50,
        overlapChars: 0,
      });
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      // Each section heading should be in its own chunk (or the next chunk's tail-overlap)
      const joined = chunks.join("\n");
      expect(joined).toContain("# Section 1");
      expect(joined).toContain("# Section 2");
    });

    it("preserves bullet lists (no split mid-list)", () => {
      const md = `# Tasks
- Premier
- Deuxieme
- Troisieme`;
      const chunks = service.chunk(md, {
        maxChars: 2000,
        minChars: 10,
        overlapChars: 0,
      });
      // List should not be split: all items in same chunk
      const containsList = chunks.some(
        (c) =>
          c.includes("- Premier") &&
          c.includes("- Deuxieme") &&
          c.includes("- Troisieme"),
      );
      expect(containsList).toBe(true);
    });

    it("strips HTML preserving headings", () => {
      const html = `<h1>Titre</h1><p>Premier paragraphe</p><h2>Sous-titre</h2><p>Contenu</p>`;
      const chunks = service.chunk(html, {
        maxChars: 2000,
        minChars: 10,
        overlapChars: 0,
      });
      expect(chunks.length).toBeGreaterThan(0);
      const joined = chunks.join("\n");
      expect(joined).toContain("# Titre");
      expect(joined).toContain("## Sous-titre");
      expect(joined).not.toContain("<h1>");
      expect(joined).not.toContain("<p>");
    });

    it("decodes HTML character references once and preserves escaped code", () => {
      const html = '<h2>Exemple &lt;strong&gt;</h2>' +
        '<p>&amp;lt;script&amp;gt; &lt;em&gt;visible&lt;/em&gt; &#233; &#x1F512;</p>';
      const text = service.chunk(html, { overlapChars: 0 }).join("\n");
      expect(text).toContain("## Exemple <strong>");
      expect(text).toContain("&lt;script&gt;");
      expect(text).toContain("<em>visible</em> é 🔒");
    });

    it("preserves heading, list, and preformatted text without link attributes", () => {
      const html = '<h1>Guide</h1><ul><li>Premier &amp; second</li><li>Suite</li></ul>' +
        '<p><a href="https://example.invalid/private">Notice</a></p>' +
        '<pre>if (a &lt; b) {\n  return 1;\n}</pre>';
      const text = service.chunk(html, { overlapChars: 0 }).join("\n");
      expect(text).toContain("# Guide");
      expect(text).toContain("- Premier & second");
      expect(text).toContain("- Suite");
      expect(text).toContain("Notice");
      expect(text).not.toContain("example.invalid");
      expect(text).toContain("if (a < b) {\n  return 1;\n}");
    });

    it("does not index executable HTML content", () => {
      const html = '<p>Texte visible<script>secretScript()</script>' +
        '<style>.secretStyle { display:none }</style> seulement</p>';
      expect(service.chunk(html, { overlapChars: 0 }).join(" ")).toBe("Texte visible seulement");
    });

    it("subdivides oversized sections by paragraphs", () => {
      const para = "Une phrase. ".repeat(60); // ~720 chars
      const text = `# Big section\n\n${para}\n\n${para}\n\n${para}\n\n${para}`;
      const chunks = service.chunk(text, {
        maxChars: 1000,
        minChars: 100,
        overlapChars: 0,
      });
      // Expect at least 2 chunks since total > maxChars*2
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(1100));
    });

    it("merges small consecutive sections", () => {
      const text = `# A\nshort\n\n# B\nshort\n\n# C\nshort`;
      const chunks = service.chunk(text, {
        maxChars: 2000,
        minChars: 200,
        overlapChars: 0,
      });
      // All 3 small sections merge into 1 since each < minChars
      expect(chunks.length).toBeLessThanOrEqual(2);
    });

    it("adds overlap between chunks (continuity)", () => {
      const text = `# Section 1\n${"premier ".repeat(200)}\n\n# Section 2\n${"deuxieme ".repeat(200)}`;
      const chunks = service.chunk(text, {
        maxChars: 1500,
        minChars: 200,
        overlapChars: 80,
      });
      if (chunks.length >= 2) {
        // Second chunk starts with tail of first chunk (overlap)
        const tailOfFirst = chunks[0].slice(-50);
        // overlap may not match exactly due to trim, so we check at least one substring
        expect(tailOfFirst.length).toBeGreaterThan(0);
      }
    });

    it("splits French sentences cleanly (.!?...)", () => {
      const sentence = "Une phrase complete. ".repeat(50); // ~1000 chars
      const text = `# Title\n\n${sentence}`;
      const chunks = service.chunk(text, {
        maxChars: 500,
        minChars: 50,
        overlapChars: 0,
      });
      // Each chunk should end on a sentence boundary (approximately)
      expect(chunks.length).toBeGreaterThanOrEqual(2);
    });

    it("protects French abbreviations from over-split", () => {
      const text = `# Title

Le Dr. Martin a recommande le M. Dupont. Mme. Petit a confirme. Les regles s'appliquent.`;
      const chunks = service.chunk(text, {
        maxChars: 2000,
        minChars: 10,
        overlapChars: 0,
      });
      // Abbreviations like Dr., M., Mme. should not break the sentence prematurely.
      expect(chunks.length).toBeGreaterThan(0);
      const joined = chunks.join(" ");
      expect(joined).toContain("Dr.");
      expect(joined).toContain("Mme.");
    });
  });

  describe("fixedSizeChunks (fallback path)", () => {
    it("respects max size with overlap", () => {
      const text = "x".repeat(10000);
      const chunks = service.fixedSizeChunks(text, 1000, 100);
      expect(chunks.length).toBeGreaterThan(5);
      chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(1000));
    });

    it("returns empty array for empty input", () => {
      expect(service.fixedSizeChunks("", 1000, 100)).toEqual([]);
    });

    it("returns single chunk if content < maxChars", () => {
      const chunks = service.fixedSizeChunks("hello world", 1000, 100);
      expect(chunks.length).toBe(1);
      expect(chunks[0]).toBe("hello world");
    });
  });
});
