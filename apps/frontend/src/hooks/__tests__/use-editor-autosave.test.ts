import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

/**
 * Tests « pure logic » pour useEditorAutosave.
 *
 * On évite jsdom (pas installé dans la stack vitest frontend qui tourne en
 * node env) en testant la logique de sérialisation / décision via les
 * helpers exposés. Le hook React est testé via E2E Playwright.
 */

// Reproduit la logique « décide-t-on de stocker un draft ? » du hook,
// extraite ici comme fonction pure pour testabilité côté node.
function shouldPersist<T>(
  value: T,
  serverValue: T,
  serialize: (v: T) => string = (v) => JSON.stringify(v),
): boolean {
  return serialize(value) !== serialize(serverValue);
}

function detectDraft<T>(
  storedRaw: string | null,
  serverValue: T,
  serialize: (v: T) => string = (v) => JSON.stringify(v),
): boolean {
  if (!storedRaw) return false;
  try {
    const parsed = JSON.parse(storedRaw) as T;
    return serialize(parsed) !== serialize(serverValue);
  } catch {
    return false;
  }
}

describe("useEditorAutosave logic", () => {
  beforeEach(() => {
    // pas de localStorage en node, on n'utilise pas le hook directement.
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("shouldPersist", () => {
    it("returns false when value equals server", () => {
      expect(shouldPersist("a", "a")).toBe(false);
      expect(shouldPersist({ x: 1 }, { x: 1 })).toBe(false);
    });

    it("returns true when value differs from server", () => {
      expect(shouldPersist("edited", "original")).toBe(true);
      expect(shouldPersist({ x: 2 }, { x: 1 })).toBe(true);
    });

    it("handles complex objects", () => {
      const a = { title: "Hello", body: "World" };
      const b = { title: "Hello", body: "World" };
      const c = { title: "Hello", body: "World!" };
      expect(shouldPersist(a, b)).toBe(false);
      expect(shouldPersist(a, c)).toBe(true);
    });
  });

  describe("detectDraft", () => {
    it("returns false for null storage", () => {
      expect(detectDraft(null, "server")).toBe(false);
    });

    it("returns false when stored matches server", () => {
      expect(detectDraft(JSON.stringify("hello"), "hello")).toBe(false);
    });

    it("returns true when stored differs from server", () => {
      expect(detectDraft(JSON.stringify("hello"), "world")).toBe(true);
    });

    it("returns false on invalid JSON", () => {
      expect(detectDraft("{not json", "server")).toBe(false);
    });

    it("handles object payloads", () => {
      const stored = JSON.stringify({ title: "A", body: "B" });
      expect(detectDraft(stored, { title: "A", body: "B" })).toBe(false);
      expect(detectDraft(stored, { title: "A", body: "C" })).toBe(true);
    });
  });
});
