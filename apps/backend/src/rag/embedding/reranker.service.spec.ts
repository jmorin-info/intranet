import { RerankerService } from "./reranker.service";

/**
 * Tests RerankerService — Item 30
 * Mock du fetch global pour simuler les reponses Ollama / TEI.
 */

describe("RerankerService", () => {
  let service: RerankerService;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    service = new RerankerService();
    originalFetch = global.fetch;
    delete process.env.RAG_RERANKER_ENABLED;
    delete process.env.OLLAMA_RERANKER_MODEL;
    delete process.env.RAG_RERANKER_TOP_K;
    delete process.env.RAG_RERANKER_TOP_N;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe("config", () => {
    it("isEnabled false by default", () => {
      expect(service.isEnabled()).toBe(false);
    });
    it("isEnabled true when env=true", () => {
      process.env.RAG_RERANKER_ENABLED = "true";
      expect(service.isEnabled()).toBe(true);
    });
    it("getModel default = bge-reranker-v2-m3", () => {
      expect(service.getModel()).toBe("bge-reranker-v2-m3");
    });
    it("getModel honors env override", () => {
      process.env.OLLAMA_RERANKER_MODEL = "custom-model";
      expect(service.getModel()).toBe("custom-model");
    });
    it("getTopK default 20", () => {
      expect(service.getTopK()).toBe(20);
    });
    it("getTopN default 5", () => {
      expect(service.getTopN()).toBe(5);
    });
  });

  describe("rerank - feature off (passthrough)", () => {
    it("returns first topN candidates unchanged when disabled", async () => {
      const candidates = [
        { id: "c1", content: "doc 1", initialScore: 0.9 },
        { id: "c2", content: "doc 2", initialScore: 0.8 },
        { id: "c3", content: "doc 3", initialScore: 0.7 },
      ];
      const result = await service.rerank("test query", candidates, 2);
      expect(result.length).toBe(2);
      expect(result[0].candidate.id).toBe("c1");
      expect(result[1].candidate.id).toBe("c2");
      expect(result[0].rerankedRank).toBe(0);
    });

    it("returns empty array for empty candidates", async () => {
      process.env.RAG_RERANKER_ENABLED = "true";
      const result = await service.rerank("q", []);
      expect(result).toEqual([]);
    });

    it("passthrough on empty query (even if enabled)", async () => {
      process.env.RAG_RERANKER_ENABLED = "true";
      const result = await service.rerank("", [
        { id: "c1", content: "doc 1" },
      ]);
      expect(result.length).toBe(1);
      expect(result[0].candidate.id).toBe("c1");
    });
  });

  describe("rerank - feature on (Ollama call)", () => {
    beforeEach(() => {
      process.env.RAG_RERANKER_ENABLED = "true";
    });

    it("reorders candidates by Ollama scores", async () => {
      // Mock fetch returning scores: c2 > c1 > c3
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ scores: [0.5, 0.95, 0.2] }),
      } as unknown as Response) as typeof fetch;

      const candidates = [
        { id: "c1", content: "doc 1", initialScore: 0.9 },
        { id: "c2", content: "doc 2", initialScore: 0.8 },
        { id: "c3", content: "doc 3", initialScore: 0.7 },
      ];
      const result = await service.rerank("test query", candidates, 3);

      expect(result.length).toBe(3);
      expect(result[0].candidate.id).toBe("c2"); // highest rerank score
      expect(result[1].candidate.id).toBe("c1");
      expect(result[2].candidate.id).toBe("c3");
      expect(result[0].rerankScore).toBeCloseTo(0.95);
      expect(result[0].initialRank).toBe(1); // c2 was originally at index 1
      expect(result[0].rerankedRank).toBe(0); // now at index 0
    });

    it("falls back to passthrough on Ollama error", async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as typeof fetch;
      const candidates = [
        { id: "c1", content: "doc 1", initialScore: 0.9 },
        { id: "c2", content: "doc 2", initialScore: 0.8 },
      ];
      const result = await service.rerank("query", candidates, 2);
      expect(result.length).toBe(2);
      expect(result[0].candidate.id).toBe("c1");
      const m = service.getMetrics();
      expect(m.callsFailed).toBeGreaterThan(0);
    });

    it("falls back when Ollama returns 404 (no /api/rerank endpoint)", async () => {
      // First call: 404 to /api/rerank. Then service tries embedding-based scoring.
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 404,
            statusText: "Not Found",
            json: async () => ({}),
          } as Response;
        }
        // Subsequent calls: /api/embeddings success
        return {
          ok: true,
          status: 200,
          json: async () => ({ embedding: new Array(1024).fill(0.1) }),
        } as Response;
      }) as typeof fetch;

      const candidates = [
        { id: "c1", content: "doc 1" },
        { id: "c2", content: "doc 2" },
      ];
      const result = await service.rerank("query", candidates, 2);
      expect(result.length).toBe(2);
      // Should have attempted multiple fetch calls (1 rerank + N embeddings)
      expect(callCount).toBeGreaterThan(1);
    });

    it("handles results array format from Ollama", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            { index: 0, score: 0.3 },
            { index: 1, score: 0.9 },
          ],
        }),
      } as unknown as Response) as typeof fetch;

      const candidates = [
        { id: "c1", content: "doc 1" },
        { id: "c2", content: "doc 2" },
      ];
      const result = await service.rerank("query", candidates, 2);
      expect(result[0].candidate.id).toBe("c2"); // higher score
    });

    it("respects topN limit", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ scores: [0.9, 0.8, 0.7, 0.6, 0.5] }),
      } as unknown as Response) as typeof fetch;

      const candidates = Array.from({ length: 5 }, (_, i) => ({
        id: `c${i}`,
        content: `doc ${i}`,
      }));
      const result = await service.rerank("q", candidates, 2);
      expect(result.length).toBe(2);
    });
  });

  describe("getMetrics", () => {
    it("tracks calls and latency", async () => {
      process.env.RAG_RERANKER_ENABLED = "true";
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ scores: [0.9] }),
      } as unknown as Response) as typeof fetch;

      await service.rerank("q", [{ id: "c1", content: "doc" }], 1);
      const m = service.getMetrics();
      expect(m.callsTotal).toBe(1);
      expect(m.enabled).toBe(true);
    });
  });
});
