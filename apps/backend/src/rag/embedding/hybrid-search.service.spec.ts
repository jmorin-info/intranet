import { HybridSearchService, HybridChunk } from "./hybrid-search.service";

describe("HybridSearchService", () => {
  let service: HybridSearchService;
  let prisma: { $queryRawUnsafe: jest.Mock };
  let embedding: {
    embed: jest.Mock;
    isEnabled: jest.Mock;
  };

  beforeEach(() => {
    prisma = { $queryRawUnsafe: jest.fn() };
    embedding = {
      embed: jest.fn().mockResolvedValue(new Array(1024).fill(0.1)),
      isEnabled: jest.fn().mockReturnValue(true),
    };
    service = new HybridSearchService(prisma as never, embedding as never);
    delete process.env.RAG_BM25_ENABLED;
    delete process.env.RAG_HYBRID_FUSION;
    delete process.env.RAG_HYBRID_ALPHA;
  });

  describe("config", () => {
    it("isBM25Enabled false by default", () => {
      expect(service.isBM25Enabled()).toBe(false);
    });
    it("isBM25Enabled true when env=true", () => {
      process.env.RAG_BM25_ENABLED = "true";
      expect(service.isBM25Enabled()).toBe(true);
    });
  });

  describe("searchVector", () => {
    it("returns empty when embedding service disabled", async () => {
      embedding.isEnabled.mockReturnValue(false);
      const result = await service.searchVector("query", 10);
      expect(result).toEqual([]);
    });

    it("calls pgvector with embedding and returns sources", async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([
        {
          id: "1",
          sourceType: "WIKI",
          sourceId: "wiki-1",
          content: "content 1",
          metadata: { title: "Wiki Page" },
          similarity: 0.85,
        },
      ]);

      const result = await service.searchVector("test query", 5);
      expect(result.length).toBe(1);
      expect(result[0].vectorScore).toBeCloseTo(0.85);
      expect(result[0].sourceType).toBe("WIKI");
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
    });

    it("returns empty on embedding failure (graceful)", async () => {
      embedding.embed.mockRejectedValue(new Error("Ollama down"));
      const result = await service.searchVector("query", 10);
      expect(result).toEqual([]);
    });

    it("returns empty on Prisma failure (graceful)", async () => {
      prisma.$queryRawUnsafe.mockRejectedValue(new Error("DB error"));
      const result = await service.searchVector("query", 10);
      expect(result).toEqual([]);
    });
  });

  describe("searchBM25", () => {
    it("returns empty for empty query", async () => {
      const result = await service.searchBM25("", 10);
      expect(result).toEqual([]);
    });

    it("calls tsvector and normalizes scores", async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([
        {
          id: "1",
          sourceType: "WIKI",
          sourceId: "wiki-1",
          content: "content",
          metadata: null,
          rank: 0.5,
        },
        {
          id: "2",
          sourceType: "DOCUMENT",
          sourceId: "doc-1",
          content: "content",
          metadata: null,
          rank: 0.25,
        },
      ]);

      const result = await service.searchBM25("test", 10);
      expect(result.length).toBe(2);
      // Top result normalized to 1.0
      expect(result[0].bm25Score).toBeCloseTo(1.0);
      expect(result[1].bm25Score).toBeCloseTo(0.5);
    });

    it("returns empty on Postgres failure", async () => {
      prisma.$queryRawUnsafe.mockRejectedValue(new Error("syntax error"));
      const result = await service.searchBM25("query", 10);
      expect(result).toEqual([]);
    });
  });

  describe("search - BM25 disabled", () => {
    beforeEach(() => {
      // BM25 OFF -> only vector
    });
    it("returns vector results only", async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([
        {
          id: "1",
          sourceType: "WIKI",
          sourceId: "wiki-1",
          content: "content",
          metadata: null,
          similarity: 0.9,
        },
      ]);

      const result = await service.search("test", 5);
      expect(result.length).toBe(1);
      expect(result[0].vectorScore).toBeCloseTo(0.9);
    });
  });

  describe("search - hybrid (BM25 + Vector + weighted fusion)", () => {
    beforeEach(() => {
      process.env.RAG_BM25_ENABLED = "true";
      process.env.RAG_HYBRID_FUSION = "weighted";
      process.env.RAG_HYBRID_ALPHA = "0.5";
    });

    it("fuses both results using weighted alpha", async () => {
      // BM25 query call
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          {
            id: "1",
            sourceType: "WIKI",
            sourceId: "w-1",
            content: "shared",
            metadata: null,
            rank: 1.0,
          },
        ])
        // Vector query call
        .mockResolvedValueOnce([
          {
            id: "1",
            sourceType: "WIKI",
            sourceId: "w-1",
            content: "shared",
            metadata: null,
            similarity: 0.8,
          },
        ]);

      const result = await service.search("query", 5);
      expect(result.length).toBe(1);
      // Both scores merged for the same chunk
      expect(result[0].vectorScore).toBeCloseTo(0.8);
      expect(result[0].bm25Score).toBeCloseTo(1.0);
      // Weighted: 0.5*0.8 + 0.5*1.0 = 0.9
      expect(result[0].score).toBeCloseTo(0.9);
    });

    it("returns BM25 only if vector empty", async () => {
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          {
            id: "1",
            sourceType: "WIKI",
            sourceId: "w-1",
            content: "x",
            metadata: null,
            rank: 0.9,
          },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.search("query", 5);
      expect(result.length).toBe(1);
      expect(result[0].bm25Score).toBeCloseTo(1.0);
    });

    it("returns vector only if BM25 empty", async () => {
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: "1",
            sourceType: "WIKI",
            sourceId: "w-1",
            content: "x",
            metadata: null,
            similarity: 0.7,
          },
        ]);

      const result = await service.search("query", 5);
      expect(result.length).toBe(1);
      expect(result[0].vectorScore).toBeCloseTo(0.7);
    });
  });

  describe("search - RRF fusion mode", () => {
    beforeEach(() => {
      process.env.RAG_BM25_ENABLED = "true";
      process.env.RAG_HYBRID_FUSION = "rrf";
    });

    it("uses RRF when configured", async () => {
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          {
            id: "1",
            sourceType: "WIKI",
            sourceId: "w-1",
            content: "x",
            metadata: null,
            rank: 0.5,
          },
          {
            id: "2",
            sourceType: "WIKI",
            sourceId: "w-2",
            content: "y",
            metadata: null,
            rank: 0.3,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "2",
            sourceType: "WIKI",
            sourceId: "w-2",
            content: "y",
            metadata: null,
            similarity: 0.9,
          },
          {
            id: "1",
            sourceType: "WIKI",
            sourceId: "w-1",
            content: "x",
            metadata: null,
            similarity: 0.7,
          },
        ]);

      const result = await service.search("query", 5);
      expect(result.length).toBe(2);
      // RRF should give item 2 a slight edge since it ranks higher in vector
      // Both items get 1/(60+1) + 1/(60+1) = ~0.0328 if at same rank, but
      // ordering varies — just check we got both
      const ids = result.map((r) => r.id);
      expect(ids).toContain("1");
      expect(ids).toContain("2");
    });
  });

  describe("search - invalid input", () => {
    it("returns empty for empty query", async () => {
      const result = await service.search("", 5);
      expect(result).toEqual([]);
    });

    it("returns empty for whitespace-only query", async () => {
      const result = await service.search("   ", 5);
      expect(result).toEqual([]);
    });
  });
});
