import { Test, TestingModule } from "@nestjs/testing";
import { NoaMemoryService } from "./noa-memory.service";
import { PrismaService } from "../prisma/prisma.service";
import { LlmService } from "../rag/llm/llm.service";
import { EmbeddingService } from "../rag/embedding/embedding.service";

/**
 * Wave D — Item 31 — Tests NoaMemoryService.
 *
 * On stub LlmService (extract → JSON déterministe) et EmbeddingService
 * (vector tronqué — la dim réelle 1024 est inutile pour vérifier les
 * branchements). PrismaService est complètement stubbé.
 */
describe("NoaMemoryService", () => {
  let service: NoaMemoryService;
  let prisma: any;
  let llm: any;
  let embedding: any;

  beforeEach(async () => {
    prisma = {
      noaMemory: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(async ({ data }: any) => ({ id: "mem-1", ...data })),
        update: jest.fn(async ({ data }: any) => ({ id: "mem-1", ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ noaMemoryEnabled: true }),
      },
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    llm = {
      generate: jest.fn(),
    };
    embedding = {
      isEnabled: jest.fn().mockReturnValue(true),
      embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NoaMemoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: LlmService, useValue: llm },
        { provide: EmbeddingService, useValue: embedding },
      ],
    }).compile();
    service = module.get(NoaMemoryService);
  });

  // =========================================================================
  // extract
  // =========================================================================

  describe("extract", () => {
    it("parses a clean JSON response from Ollama", async () => {
      llm.generate.mockResolvedValue({
        text: '{ "items": [{ "key": "preference.tutoiement", "value": "Préfère le tutoiement", "importance": 0.9 }] }',
        modelUsed: "mistral",
        latencyMs: 100,
        fallbackLevel: 0,
      });
      const items = await service.extract("u1", {
        user: "Tu peux me tutoyer",
        assistant: "OK je te tutoie",
      });
      expect(items).toEqual([
        {
          key: "preference.tutoiement",
          value: "Préfère le tutoiement",
          importance: 0.9,
        },
      ]);
    });

    it("tolerates LLM responses wrapped in prose", async () => {
      llm.generate.mockResolvedValue({
        text: 'Voici le JSON : { "items": [{ "key": "projet.actif", "value": "Travaille sur SEAL", "importance": 0.7 }] } merci',
        modelUsed: "mistral",
        latencyMs: 100,
        fallbackLevel: 0,
      });
      const items = await service.extract("u1", { user: "x", assistant: "y" });
      expect(items.length).toBe(1);
      expect(items[0].key).toBe("projet.actif");
    });

    it("returns [] on invalid JSON", async () => {
      llm.generate.mockResolvedValue({
        text: "Pas de JSON ici",
        modelUsed: "mistral",
        latencyMs: 100,
        fallbackLevel: 0,
      });
      const items = await service.extract("u1", { user: "x", assistant: "y" });
      expect(items).toEqual([]);
    });

    it("returns [] when LLM throws", async () => {
      llm.generate.mockRejectedValue(new Error("Ollama down"));
      const items = await service.extract("u1", { user: "x", assistant: "y" });
      expect(items).toEqual([]);
    });

    it("clamps importance to [0,1] and skips empty items", async () => {
      llm.generate.mockResolvedValue({
        text: '{ "items": [{ "key": "a", "value": "x", "importance": 5 }, { "key": "", "value": "skipped" }, { "key": "b", "value": "y", "importance": -1 }] }',
        modelUsed: "mistral",
        latencyMs: 1,
        fallbackLevel: 0,
      });
      const items = await service.extract("u1", { user: "x", assistant: "y" });
      expect(items).toHaveLength(2);
      expect(items[0].importance).toBe(1);
      expect(items[1].importance).toBe(0);
    });
  });

  // =========================================================================
  // store
  // =========================================================================

  describe("store", () => {
    it("creates a new memory and updates embedding", async () => {
      const stored = await service.store("u1", [
        { key: "k1", value: "v1", importance: 0.6 },
      ]);
      expect(stored).toBe(1);
      expect(prisma.noaMemory.create).toHaveBeenCalled();
      expect(prisma.$executeRawUnsafe).toHaveBeenCalled();
    });

    it("upserts when key already exists", async () => {
      prisma.noaMemory.findFirst.mockResolvedValue({ id: "existing-1" });
      const stored = await service.store("u1", [
        { key: "k1", value: "v2", importance: 0.6 },
      ]);
      expect(stored).toBe(1);
      expect(prisma.noaMemory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "existing-1" },
          data: expect.objectContaining({ value: "v2" }),
        }),
      );
      expect(prisma.noaMemory.create).not.toHaveBeenCalled();
    });

    it("is a no-op when noaMemoryEnabled=false", async () => {
      prisma.user.findUnique.mockResolvedValue({ noaMemoryEnabled: false });
      const stored = await service.store("u1", [
        { key: "k1", value: "v1", importance: 0.5 },
      ]);
      expect(stored).toBe(0);
      expect(prisma.noaMemory.create).not.toHaveBeenCalled();
    });

    it("returns 0 on empty items without DB calls", async () => {
      const stored = await service.store("u1", []);
      expect(stored).toBe(0);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("does not crash if embedding fails", async () => {
      embedding.embed.mockRejectedValue(new Error("Ollama embed down"));
      const stored = await service.store("u1", [
        { key: "k1", value: "v1", importance: 0.6 },
      ]);
      expect(stored).toBe(1); // store passe quand même
    });

    it("computes null expiry for high importance memories", async () => {
      await service.store("u1", [
        { key: "k1", value: "important", importance: 0.95 },
      ]);
      const arg = prisma.noaMemory.create.mock.calls[0][0];
      expect(arg.data.expiresAt).toBeNull();
    });

    it("computes ~6mo expiry for normal importance", async () => {
      await service.store("u1", [
        { key: "k1", value: "normal", importance: 0.5 },
      ]);
      const arg = prisma.noaMemory.create.mock.calls[0][0];
      expect(arg.data.expiresAt).toBeInstanceOf(Date);
      const ttlMs = arg.data.expiresAt.getTime() - Date.now();
      expect(ttlMs).toBeGreaterThan(170 * 24 * 3600_000);
      expect(ttlMs).toBeLessThan(190 * 24 * 3600_000);
    });
  });

  // =========================================================================
  // recall
  // =========================================================================

  describe("recall", () => {
    it("uses pgvector cosine + recency boost when embedding is enabled", async () => {
      const now = new Date();
      prisma.$queryRawUnsafe.mockResolvedValue([
        {
          id: "m1",
          userId: "u1",
          key: "k1",
          value: "v1",
          importanceScore: 0.9,
          recallCount: 0,
          lastRecalledAt: null,
          createdAt: now,
          updatedAt: now,
          expiresAt: null,
          metadata: null,
          cosine_similarity: 0.95,
        },
        {
          id: "m2",
          userId: "u1",
          key: "k2",
          value: "v2",
          importanceScore: 0.6,
          recallCount: 0,
          lastRecalledAt: null,
          createdAt: now,
          updatedAt: now,
          expiresAt: null,
          metadata: null,
          cosine_similarity: 0.8,
        },
      ]);
      const results = await service.recall("u1", "ma question", { k: 2 });
      expect(results.length).toBe(2);
      expect(results[0].id).toBe("m1"); // higher score
      expect(prisma.noaMemory.updateMany).toHaveBeenCalled();
    });

    it("falls back to importance ordering when embedding throws", async () => {
      prisma.$queryRawUnsafe.mockRejectedValue(new Error("pgvector boom"));
      const now = new Date();
      prisma.noaMemory.findMany.mockResolvedValue([
        { id: "m1", key: "k", value: "v", importanceScore: 0.7, recallCount: 0, createdAt: now },
      ]);
      const results = await service.recall("u1", "q");
      expect(results.length).toBe(1);
      expect(prisma.noaMemory.findMany).toHaveBeenCalled();
    });

    it("returns [] when noaMemoryEnabled=false", async () => {
      prisma.user.findUnique.mockResolvedValue({ noaMemoryEnabled: false });
      const results = await service.recall("u1", "q");
      expect(results).toEqual([]);
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it("falls back to plain query when embedding service is disabled", async () => {
      embedding.isEnabled.mockReturnValue(false);
      const now = new Date();
      prisma.noaMemory.findMany.mockResolvedValue([
        { id: "m1", key: "k", value: "v", importanceScore: 0.6, recallCount: 0, createdAt: now },
      ]);
      const results = await service.recall("u1", "q");
      expect(results.length).toBe(1);
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // forget / forgetAll / export
  // =========================================================================

  describe("forget", () => {
    it("deletes only the user's own memory", async () => {
      prisma.noaMemory.deleteMany.mockResolvedValue({ count: 1 });
      const ok = await service.forget("u1", "mem-1");
      expect(ok).toBe(true);
      expect(prisma.noaMemory.deleteMany).toHaveBeenCalledWith({
        where: { id: "mem-1", userId: "u1" },
      });
    });

    it("returns false when nothing was deleted (id not owned)", async () => {
      prisma.noaMemory.deleteMany.mockResolvedValue({ count: 0 });
      const ok = await service.forget("u1", "wrong");
      expect(ok).toBe(false);
    });
  });

  describe("forgetAll", () => {
    it("returns the count of deleted rows", async () => {
      prisma.noaMemory.deleteMany.mockResolvedValue({ count: 7 });
      const count = await service.forgetAll("u1");
      expect(count).toBe(7);
    });
  });

  describe("exportForUser", () => {
    it("renders a flat RGPD-friendly payload", async () => {
      const now = new Date();
      prisma.noaMemory.findMany.mockResolvedValue([
        {
          id: "m1",
          key: "k1",
          value: "v1",
          importanceScore: 0.5,
          recallCount: 2,
          createdAt: now,
          updatedAt: now,
          expiresAt: null,
        },
      ]);
      const out = await service.exportForUser("u1");
      expect(out.userId).toBe("u1");
      expect(out.items.length).toBe(1);
      expect(out.items[0].key).toBe("k1");
      expect(typeof out.exportedAt).toBe("string");
    });
  });

  // =========================================================================
  // formatForPrompt
  // =========================================================================

  describe("formatForPrompt", () => {
    it("returns empty string when no memories", () => {
      expect(service.formatForPrompt([])).toBe("");
    });

    it("renders bullet list with header", () => {
      const out = service.formatForPrompt([
        { id: "1", key: "k", value: "Préfère le tutoiement", importanceScore: 0.9, recallCount: 0, createdAt: new Date() },
        { id: "2", key: "k2", value: "Travaille sur SEAL", importanceScore: 0.7, recallCount: 0, createdAt: new Date() },
      ]);
      expect(out).toContain("Contexte utilisateur");
      expect(out).toContain("- Préfère le tutoiement");
      expect(out).toContain("- Travaille sur SEAL");
    });
  });
});
