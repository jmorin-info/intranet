import { ForbiddenException } from "@nestjs/common";
import { RagService, RagSearchContext } from "./rag.service";
import { LlmService } from "./llm/llm.service";

/**
 * Tests RagService.summarizeDocument — fix 2026-07.
 *
 * Couvre les trois changements de fond :
 *  - RBAC par classification DANS le service (la route est ouverte à tous les
 *    rôles authentifiés : un utilisateur ne résume que ce qu'il peut lire) ;
 *  - passage par LlmService.generate (chaîne de fallback + template [INST])
 *    avec map-reduce en 2 passes au-delà de 2000 chars ;
 *  - propagation des erreurs LLM (le contrôleur renvoie 503) au lieu d'un
 *    200 { summary: "Erreur…" } qui polluait cache et monitoring.
 */

interface DocStub {
  id: string;
  classification: string;
  ownerId: string;
  reviewerId?: string | null;
  approverId?: string | null;
  status: string;
  scanStatus: string;
  deletedAt?: Date | null;
  category?: string | null;
  isPublic?: boolean | null;
  content?: string | null;
  versions: Array<{ checksum: string | null; fileUrl: string; fileType: string }>;
}

/** Compteur global pour garantir des ids uniques (le cache résumé est module-level). */
let docSeq = 0;

function makeDoc(overrides: Partial<DocStub> = {}): DocStub {
  docSeq += 1;
  return {
    id: `doc-${docSeq}-${Date.now()}`,
    classification: "INTERNE",
    ownerId: "owner-1",
    reviewerId: null,
    approverId: null,
    // Le RBAC s'aligne désormais sur DocumentsService.findById (statut +
    // soft-delete inclus) : un document lisible par défaut = APPROVED, vivant.
    status: "APPROVED",
    scanStatus: "CLEAN",
    deletedAt: null,
    category: "PROCEDURE",
    isPublic: false,
    content: "Contenu court du document.",
    versions: [{ checksum: `sum-${docSeq}`, fileUrl: "/f.pdf", fileType: "pdf" }],
    ...overrides,
  };
}

function build(doc: DocStub) {
  const prisma = {
    // Le service utilise findFirstOrThrow (filtre deletedAt: null).
    document: { findFirstOrThrow: jest.fn().mockResolvedValue(doc) },
  };
  const textExtractor = { extractText: jest.fn().mockResolvedValue("") };
  const llmService = {
    getActiveModel: jest.fn().mockReturnValue("mistral"),
    generate: jest.fn().mockResolvedValue({
      text: "Résumé généré.",
      modelUsed: "mistral",
      latencyMs: 10,
      fallbackLevel: 0,
    }),
  };

  const service = new RagService(
    prisma as never,
    textExtractor as never,
    {} as never,
    llmService as unknown as LlmService,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  jest.spyOn(service["logger"], "warn").mockImplementation(() => undefined);
  jest.spyOn(service["logger"], "error").mockImplementation(() => undefined);

  return { service, prisma, textExtractor, llmService };
}

const collaborateur = (userId = "someone-else"): RagSearchContext => ({
  userId,
  role: "COLLABORATEUR",
  departmentId: null,
});

describe("RagService.summarizeDocument", () => {
  beforeEach(() => {
    process.env.OLLAMA_ENABLED = "true";
    delete process.env.RBAC_RAG_ENABLED;
    delete process.env.OLLAMA_TIMEOUT_MS;
  });

  afterEach(() => {
    delete process.env.OLLAMA_ENABLED;
    delete process.env.RBAC_RAG_ENABLED;
    jest.restoreAllMocks();
  });

  // ------------------------------------------------------------------ RBAC

  describe("contrôle d'accès par classification (ISO A.5.15)", () => {
    it("autorise un COLLABORATEUR sur un document INTERNE", async () => {
      const doc = makeDoc({ classification: "INTERNE" });
      const { service, llmService } = build(doc);

      const res = await service.summarizeDocument(doc.id, collaborateur());

      expect(res.summary).toBe("Résumé généré.");
      expect(llmService.generate).toHaveBeenCalledTimes(1);
    });

    it("refuse un COLLABORATEUR non habilité sur un document CONFIDENTIEL", async () => {
      const doc = makeDoc({ classification: "CONFIDENTIEL", ownerId: "owner-1" });
      const { service, llmService } = build(doc);

      await expect(service.summarizeDocument(doc.id, collaborateur())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      // Aucun appel LLM gaspillé sur un document interdit.
      expect(llmService.generate).not.toHaveBeenCalled();
    });

    it("autorise un REVIEWER sur un document CONFIDENTIEL (matrice findById)", async () => {
      const doc = makeDoc({ classification: "CONFIDENTIEL" });
      const { service } = build(doc);

      const res = await service.summarizeDocument(doc.id, {
        userId: "rev-1",
        role: "REVIEWER",
        departmentId: null,
      });
      expect(res.summary).toBe("Résumé généré.");
    });

    it("REFUSE un COLLABORATEUR sur un brouillon INTERNE d'autrui (statut non APPROVED)", async () => {
      // Régression fermée : sans contrôle de statut, un brouillon d'autrui
      // était résumable via son UUID.
      const doc = makeDoc({ classification: "INTERNE", status: "DRAFT", ownerId: "owner-1" });
      const { service, llmService } = build(doc);

      await expect(service.summarizeDocument(doc.id, collaborateur("bob"))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(llmService.generate).not.toHaveBeenCalled();
    });

    it("refuse un REVIEWER non-owner sur un document SECRET", async () => {
      const doc = makeDoc({ classification: "SECRET", ownerId: "owner-1" });
      const { service } = build(doc);

      await expect(
        service.summarizeDocument(doc.id, {
          userId: "rev-1",
          role: "REVIEWER",
          departmentId: null,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuse tout le monde sur un document soft-supprimé (findFirstOrThrow → 404 via P2025)", async () => {
      const doc = makeDoc({ deletedAt: new Date() });
      const prisma = {
        // findFirstOrThrow avec deletedAt: null ne renvoie rien → P2025.
        document: {
          findFirstOrThrow: jest
            .fn()
            .mockRejectedValue(Object.assign(new Error("No Document found"), { code: "P2025" })),
        },
      };
      const llmService = {
        getActiveModel: jest.fn().mockReturnValue("mistral"),
        generate: jest.fn(),
      };
      const service = new RagService(
        prisma as never,
        { extractText: jest.fn() } as never,
        {} as never,
        llmService as unknown as LlmService,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      jest.spyOn(service["logger"], "warn").mockImplementation(() => undefined);

      await expect(
        service.summarizeDocument(doc.id, {
          userId: "owner-1",
          role: "DIRECTION",
          departmentId: null,
        }),
      ).rejects.toMatchObject({ code: "P2025" });
      expect(llmService.generate).not.toHaveBeenCalled();
    });

    it("laisse passer un rôle privilégié (DIRECTION) sur SECRET", async () => {
      const doc = makeDoc({ classification: "SECRET", ownerId: "owner-1" });
      const { service } = build(doc);

      const res = await service.summarizeDocument(doc.id, {
        userId: "dir-1",
        role: "DIRECTION",
        departmentId: null,
      });
      expect(res.summary).toBe("Résumé généré.");
    });

    it("fail closed sur une classification inconnue", async () => {
      const doc = makeDoc({ classification: "INCONNUE" });
      const { service } = build(doc);

      await expect(service.summarizeDocument(doc.id, collaborateur())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("ne permet jamais au flag RBAC_RAG_ENABLED=false de désactiver les habilitations", async () => {
      process.env.RBAC_RAG_ENABLED = "false";
      const doc = makeDoc({ classification: "SECRET" });
      const { service } = build(doc);

      await expect(service.summarizeDocument(doc.id, collaborateur())).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ------------------------------------------------------------ Map-reduce

  describe("génération et map-reduce", () => {
    it("fait un seul appel borné au budget configuré pour un texte ≤ 2000 chars", async () => {
      const doc = makeDoc({ content: "a".repeat(1500) });
      const { service, llmService } = build(doc);

      await service.summarizeDocument(doc.id, collaborateur());

      expect(llmService.generate).toHaveBeenCalledTimes(1);
      expect(llmService.generate.mock.calls[0][1]).toMatchObject({ maxTokens: 240 });
    });

    it("découpe en segments puis résume la concaténation au-delà de 2000 chars", async () => {
      // 5000 chars → 3 segments max (2000+2000+1000) + 1 passe de réduction.
      const doc = makeDoc({ content: "b".repeat(5000) });
      const { service, llmService } = build(doc);

      await service.summarizeDocument(doc.id, collaborateur());

      expect(llmService.generate).toHaveBeenCalledTimes(4);
      // Les 3 premiers appels = passe "map" (budget réduit par segment).
      for (let i = 0; i < 3; i++) {
        expect(llmService.generate.mock.calls[i][1]).toMatchObject({ maxTokens: 120 });
      }
      // Dernier appel = passe "reduce" avec le budget plein.
      expect(llmService.generate.mock.calls[3][1]).toMatchObject({ maxTokens: 240 });
    });

    it("plafonne à 3 segments même pour un très gros document", async () => {
      const doc = makeDoc({ content: "c".repeat(50_000) });
      const { service, llmService } = build(doc);

      await service.summarizeDocument(doc.id, collaborateur());
      // 3 segments + 1 réduction, jamais plus.
      expect(llmService.generate).toHaveBeenCalledTimes(4);
    });

    it("n'envoie jamais un prompt vide en réduction si la passe map ne produit rien", async () => {
      const doc = makeDoc({ content: "d".repeat(5000) });
      const { service, llmService } = build(doc);
      llmService.generate.mockResolvedValue({
        text: "   ",
        modelUsed: "mistral",
        latencyMs: 1,
        fallbackLevel: 0,
      });

      await service.summarizeDocument(doc.id, collaborateur());

      const reducePrompt = llmService.generate.mock.calls[3][0] as string;
      expect(reducePrompt.trim().length).toBeGreaterThan(50);
      expect(reducePrompt).toContain("d");
    });

    it("passe un budget temps AGRÉGÉ (≤ 200 s) à LlmService, découplé d'OLLAMA_TIMEOUT_MS", async () => {
      // Le résumé n'utilise plus OLLAMA_TIMEOUT_MS (240 s par appel) comme
      // budget : il impose un budget global calé sous le timeout client, pour
      // ne pas accumuler de requêtes zombies quand Ollama est saturé.
      process.env.OLLAMA_TIMEOUT_MS = "240000";
      const doc = makeDoc();
      const { service, llmService } = build(doc);

      await service.summarizeDocument(doc.id, collaborateur());
      const { timeoutMs } = llmService.generate.mock.calls[0][1] as { timeoutMs: number };
      expect(timeoutMs).toBeLessThanOrEqual(200_000);
      expect(timeoutMs).toBeGreaterThan(100_000);
    });
  });

  // ---------------------------------------------------------------- Erreurs

  describe("erreurs et dégradations", () => {
    it("propage l'échec LLM (le contrôleur le traduit en 503)", async () => {
      const doc = makeDoc();
      const { service, llmService } = build(doc);
      llmService.generate.mockRejectedValue(new Error("All LLM models in chain failed"));

      await expect(service.summarizeDocument(doc.id, collaborateur())).rejects.toThrow(
        /All LLM models in chain failed/,
      );
    });

    it("ne met PAS en cache un résumé en échec", async () => {
      const doc = makeDoc();
      const { service, llmService } = build(doc);
      llmService.generate.mockRejectedValueOnce(new Error("timeout"));

      await expect(service.summarizeDocument(doc.id, collaborateur())).rejects.toThrow("timeout");

      // Le 2e appel doit bien retenter le LLM (rien de mis en cache).
      llmService.generate.mockResolvedValue({
        text: "Résumé après reprise.",
        modelUsed: "mistral",
        latencyMs: 5,
        fallbackLevel: 0,
      });
      const res = await service.summarizeDocument(doc.id, collaborateur());
      expect(res.summary).toBe("Résumé après reprise.");
    });

    it("renvoie un message explicite quand le document n'a aucun texte", async () => {
      const doc = makeDoc({ content: "", versions: [] });
      const { service, llmService } = build(doc);

      const res = await service.summarizeDocument(doc.id, collaborateur());
      expect(res.summary).toMatch(/aucun contenu textuel/i);
      expect(llmService.generate).not.toHaveBeenCalled();
    });

    it("retombe en extractif quand Ollama est désactivé", async () => {
      process.env.OLLAMA_ENABLED = "false";
      const doc = makeDoc({ content: "e".repeat(900) });
      const { service, llmService } = build(doc);

      const res = await service.summarizeDocument(doc.id, collaborateur());
      expect(llmService.generate).not.toHaveBeenCalled();
      expect(res.summary.endsWith("…")).toBe(true);
    });
  });

  // ------------------------------------------------------------------ Cache

  describe("cache keyé par checksum de version", () => {
    it("ne rappelle pas le LLM pour le même checksum", async () => {
      const doc = makeDoc();
      const { service, llmService } = build(doc);

      await service.summarizeDocument(doc.id, collaborateur());
      await service.summarizeDocument(doc.id, collaborateur());

      expect(llmService.generate).toHaveBeenCalledTimes(1);
    });

    it("régénère quand une nouvelle version change le checksum", async () => {
      const doc = makeDoc();
      const { service, prisma, llmService } = build(doc);

      await service.summarizeDocument(doc.id, collaborateur());

      // Nouvelle version uploadée → checksum différent → cache invalidé.
      prisma.document.findFirstOrThrow.mockResolvedValue({
        ...doc,
        versions: [{ checksum: "checksum-v2", fileUrl: "/f.pdf", fileType: "pdf" }],
      });
      await service.summarizeDocument(doc.id, collaborateur());

      expect(llmService.generate).toHaveBeenCalledTimes(2);
    });

    it("vérifie le RBAC AVANT de servir le cache", async () => {
      const doc = makeDoc({ classification: "CONFIDENTIEL", ownerId: "owner-1" });
      const { service } = build(doc);

      // L'owner remplit le cache…
      await service.summarizeDocument(doc.id, collaborateur("owner-1"));
      // …un autre utilisateur ne doit pas pouvoir le lire.
      await expect(
        service.summarizeDocument(doc.id, collaborateur("intrus")),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});


describe('Document content access is mandatory before AI work', () => {
  it('rejects missing identity before querying the document or a cached summary', async () => {
    const doc = makeDoc(); const { service, prisma, llmService } = build(doc);
    await expect(service.summarizeDocument(doc.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.summarizeDocumentStream(doc.id, undefined, jest.fn())).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.document.findFirstOrThrow).not.toHaveBeenCalled();
    expect(llmService.generate).not.toHaveBeenCalled();
  });
  it.each(['PENDING', 'ERROR', 'INFECTED'])('refuses %s files before extraction or inference', async (scanStatus) => {
    const doc = makeDoc({ scanStatus }); const { service, textExtractor, llmService } = build(doc);
    await expect(service.summarizeDocument(doc.id, collaborateur())).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.summarizeDocumentStream(doc.id, collaborateur(), jest.fn())).rejects.toBeInstanceOf(ForbiddenException);
    expect(textExtractor.extractText).not.toHaveBeenCalled(); expect(llmService.generate).not.toHaveBeenCalled();
  });
});
