import { describe, it, expect } from "vitest";

import {
  getBlockText,
  getBlockData,
  type ContentBlock,
  type ContentBlocksMap,
} from "../cms-shared";

function makeBlock(
  key: string,
  overrides: Partial<ContentBlock> = {},
): ContentBlock {
  return {
    key,
    locale: "fr",
    title: null,
    body: "",
    data: null,
    updatedAt: new Date("2026-01-01").toISOString(),
    ...overrides,
  };
}

describe("getBlockText", () => {
  it("retourne le body du bloc si présent et non vide", () => {
    const blocks: ContentBlocksMap = {
      "welcome.hero.title": makeBlock("welcome.hero.title", {
        body: "Bienvenue",
      }),
    };
    expect(getBlockText(blocks, "welcome.hero.title", "Fallback")).toBe(
      "Bienvenue",
    );
  });

  it("retourne le fallback si le bloc est absent", () => {
    const blocks: ContentBlocksMap = {};
    expect(getBlockText(blocks, "welcome.hero.title", "Fallback")).toBe(
      "Fallback",
    );
  });

  it("retourne le fallback si le body est vide", () => {
    const blocks: ContentBlocksMap = {
      "welcome.hero.title": makeBlock("welcome.hero.title", { body: "" }),
    };
    expect(getBlockText(blocks, "welcome.hero.title", "Fallback")).toBe(
      "Fallback",
    );
  });
});

describe("getBlockData", () => {
  it("retourne le payload data typé si présent", () => {
    type CTA = { label: string; href: string };
    const payload: CTA = { label: "Connexion", href: "/login" };
    const blocks: ContentBlocksMap = {
      "welcome.hero.cta": makeBlock("welcome.hero.cta", { data: payload }),
    };
    const fallback: CTA = { label: "—", href: "#" };
    const result = getBlockData<CTA>(blocks, "welcome.hero.cta", fallback);
    expect(result).toEqual(payload);
    expect(result.label).toBe("Connexion");
  });

  it("retourne le fallback si data est null", () => {
    const blocks: ContentBlocksMap = {
      "welcome.steps": makeBlock("welcome.steps", { data: null }),
    };
    const fallback = [{ title: "Etape 1" }];
    expect(getBlockData(blocks, "welcome.steps", fallback)).toBe(fallback);
  });

  it("retourne le fallback si le bloc est absent", () => {
    const blocks: ContentBlocksMap = {};
    const fallback = { foo: "bar" };
    expect(getBlockData(blocks, "missing.key", fallback)).toBe(fallback);
  });

  it("parse correctement un array JSON depuis data", () => {
    type Item = { question: string; answer: string };
    const items: Item[] = [
      { question: "Q1", answer: "A1" },
      { question: "Q2", answer: "A2" },
    ];
    const blocks: ContentBlocksMap = {
      "welcome.faq": makeBlock("welcome.faq", { data: items }),
    };
    const result = getBlockData<Item[]>(blocks, "welcome.faq", []);
    expect(result).toHaveLength(2);
    expect(result[0]?.question).toBe("Q1");
  });
});
