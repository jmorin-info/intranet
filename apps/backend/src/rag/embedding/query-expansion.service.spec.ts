import { QueryExpansionService } from "./query-expansion.service";

describe("QueryExpansionService", () => {
  let service: QueryExpansionService;
  let llmService: { generate: jest.Mock; getActiveModel: jest.Mock };
  let cacheService: {
    get: jest.Mock;
    set: jest.Mock;
  };

  beforeEach(() => {
    delete process.env.RAG_QUERY_EXPANSION_ENABLED;
    delete process.env.RAG_QUERY_EXPANSION_N;
    llmService = {
      generate: jest.fn(),
      getActiveModel: jest.fn().mockReturnValue("mistral"),
    };
    cacheService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };
    service = new QueryExpansionService(llmService as never, cacheService as never);
  });

  describe("config", () => {
    it("isEnabled false by default", () => {
      expect(service.isEnabled()).toBe(false);
    });
    it("isEnabled true when env=true", () => {
      process.env.RAG_QUERY_EXPANSION_ENABLED = "true";
      expect(service.isEnabled()).toBe(true);
    });
    it("getN clamps to [1,10]", () => {
      process.env.RAG_QUERY_EXPANSION_N = "100";
      expect(service.getN()).toBe(10);
      process.env.RAG_QUERY_EXPANSION_N = "0";
      expect(service.getN()).toBe(1);
      process.env.RAG_QUERY_EXPANSION_N = "5";
      expect(service.getN()).toBe(5);
    });
  });

  describe("expand - feature off", () => {
    it("returns single original query", async () => {
      const result = await service.expand("comment activer 2FA");
      expect(result).toEqual(["comment activer 2FA"]);
      expect(llmService.generate).not.toHaveBeenCalled();
    });

    it("returns empty for empty query", async () => {
      const result = await service.expand("");
      expect(result).toEqual([]);
    });
  });

  describe("expand - feature on, cache miss", () => {
    beforeEach(() => {
      process.env.RAG_QUERY_EXPANSION_ENABLED = "true";
      process.env.RAG_QUERY_EXPANSION_N = "3";
    });

    it("calls LLM and returns original + reformulations", async () => {
      llmService.generate.mockResolvedValue({
        text: `Comment activer la double authentification ?
Procedure pour mettre en place le 2FA
Comment configurer l'authentification a deux facteurs ?`,
        modelUsed: "mistral",
        latencyMs: 100,
        fallbackLevel: 0,
      });

      const result = await service.expand("comment activer 2FA");
      expect(result.length).toBe(4); // original + 3 reformulations
      expect(result[0]).toBe("comment activer 2FA");
      expect(result[1]).toContain("double authentification");
      expect(llmService.generate).toHaveBeenCalledTimes(1);
    });

    it("strips numbering and bullets from LLM output", async () => {
      llmService.generate.mockResolvedValue({
        text: `1. Premiere reformulation
2) Deuxieme reformulation
- Troisieme reformulation`,
        modelUsed: "mistral",
        latencyMs: 50,
        fallbackLevel: 0,
      });

      const result = await service.expand("query test");
      expect(result.length).toBe(4);
      expect(result[1]).toBe("Premiere reformulation");
      expect(result[2]).toBe("Deuxieme reformulation");
      expect(result[3]).toBe("Troisieme reformulation");
    });

    it("dedupes reformulations identical to original (case-insensitive)", async () => {
      llmService.generate.mockResolvedValue({
        text: `Test Query
Une autre formulation
TEST QUERY`,
        modelUsed: "mistral",
        latencyMs: 50,
        fallbackLevel: 0,
      });

      const result = await service.expand("test query");
      // Original + only "Une autre formulation" (the two duplicates of original are filtered)
      expect(result.length).toBe(2);
      expect(result[0]).toBe("test query");
      expect(result[1]).toBe("Une autre formulation");
    });

    it("falls back to [query] when LLM fails", async () => {
      llmService.generate.mockRejectedValue(new Error("Ollama down"));
      const result = await service.expand("test");
      expect(result).toEqual(["test"]);
    });

    it("does not expand for very long queries (paste accident)", async () => {
      const longQuery = "x".repeat(600);
      const result = await service.expand(longQuery);
      expect(result).toEqual([longQuery]);
      expect(llmService.generate).not.toHaveBeenCalled();
    });

    it("stores result in cache", async () => {
      llmService.generate.mockResolvedValue({
        text: "Reformulation 1\nReformulation 2\nReformulation 3",
        modelUsed: "mistral",
        latencyMs: 100,
        fallbackLevel: 0,
      });

      await service.expand("test query");
      // Cache.set fires-and-forgets; wait for it
      await new Promise((r) => setImmediate(r));
      expect(cacheService.set).toHaveBeenCalled();
      const setArgs = cacheService.set.mock.calls[0];
      expect(setArgs[0]).toMatch(/^rag:query-expansion:[a-f0-9]+$/);
      expect(setArgs[2]).toBe(3600); // TTL 1h
    });
  });

  describe("expand - cache hit", () => {
    beforeEach(() => {
      process.env.RAG_QUERY_EXPANSION_ENABLED = "true";
      process.env.RAG_QUERY_EXPANSION_N = "3";
    });

    it("returns cached value without calling LLM", async () => {
      cacheService.get.mockResolvedValue([
        "test query",
        "Reformulation cached 1",
        "Reformulation cached 2",
      ]);

      const result = await service.expand("test query");
      expect(result).toEqual([
        "test query",
        "Reformulation cached 1",
        "Reformulation cached 2",
      ]);
      expect(llmService.generate).not.toHaveBeenCalled();

      const m = service.getMetrics();
      expect(m.cacheHits).toBe(1);
    });

    it("falls through to LLM if cache returns null", async () => {
      cacheService.get.mockResolvedValue(null);
      llmService.generate.mockResolvedValue({
        text: "Reformulation 1",
        modelUsed: "mistral",
        latencyMs: 50,
        fallbackLevel: 0,
      });

      await service.expand("test");
      expect(llmService.generate).toHaveBeenCalled();
    });

    it("falls through to LLM if cache GET fails (Redis down)", async () => {
      cacheService.get.mockRejectedValue(new Error("Redis down"));
      llmService.generate.mockResolvedValue({
        text: "Reformulation 1",
        modelUsed: "mistral",
        latencyMs: 50,
        fallbackLevel: 0,
      });

      const result = await service.expand("test");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("expand - no cache provided", () => {
    it("works with no Redis cache (Optional injection)", async () => {
      const noCacheService = new QueryExpansionService(llmService as never);
      process.env.RAG_QUERY_EXPANSION_ENABLED = "true";
      llmService.generate.mockResolvedValue({
        text: "Reformulation 1",
        modelUsed: "mistral",
        latencyMs: 50,
        fallbackLevel: 0,
      });
      const result = await noCacheService.expand("test");
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getMetrics", () => {
    it("aggregates calls and cache stats", async () => {
      process.env.RAG_QUERY_EXPANSION_ENABLED = "true";
      llmService.generate.mockResolvedValue({
        text: "R1\nR2",
        modelUsed: "mistral",
        latencyMs: 100,
        fallbackLevel: 0,
      });
      await service.expand("query 1");
      await service.expand("query 2");
      const m = service.getMetrics();
      expect(m.callsTotal).toBe(2);
      expect(m.callsFailed).toBe(0);
      expect(m.enabled).toBe(true);
    });
  });
});
