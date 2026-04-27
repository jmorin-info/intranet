import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TextExtractorService } from "./text-extractor.service";
import { EmbeddingService } from "./embedding/embedding.service";
import { HybridSearchService, HybridChunk } from "./embedding/hybrid-search.service";
import { RerankerService } from "./embedding/reranker.service";
import { QueryExpansionService } from "./embedding/query-expansion.service";
import { SemanticChunkerService } from "./ingestion/semantic-chunker.service";
import { LlmService } from "./llm/llm.service";
import { getPromptTemplates } from "./prompts/templates";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const _EMBEDDING_DIMS = 1024; // documente la dimension du modele d'embedding (mxbai-embed-large)
const CHUNK_SIZE_CHARS = 2000;
const CHUNK_OVERLAP_CHARS = 200;
const CONFIDENCE_THRESHOLD = 0.3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type SourceType =
  | "DOCUMENT"
  | "WIKI"
  | "PROCEDURE"
  | "RUNBOOK"
  | "FAQ"
  | "TICKET";

/**
 * Contexte RBAC pour le filtrage pré-retrieval (ISO 27001 Annex A.5.15, A.8.3).
 * Le filtrage est appliqué AVANT le scoring pour garantir que seuls les chunks
 * autorisés sont considérés.
 */
export interface RagSearchContext {
  userId: string;
  role: string;
  departmentId?: string | null;
}

interface RagSource {
  sourceType: SourceType;
  sourceId: string;
  title: string;
  snippet: string;
  score: number;
  /** Classification RBAC (PUBLIC | INTERNE | CONFIDENTIEL | SECRET) si connue. */
  classification?: string;
}

interface RagAnswer {
  answer: string;
  sources: RagSource[];
  retrievalConfidence: number;
  source: "llm" | "extractive" | "none";
  pipelineInfo: Record<string, unknown>;
  durationMs: number;
  queryId?: string;
}

// ---------------------------------------------------------------------------
// In-memory cache with TTL
// ---------------------------------------------------------------------------
const cache = new Map<string, { value: unknown; expiresAt: number }>();

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function setCache(key: string, value: unknown, ttlMs = 5 * 60 * 1000): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ---------------------------------------------------------------------------
// French stop-words for tokenizer
// ---------------------------------------------------------------------------
const FR_STOP_WORDS = new Set([
  "le",
  "la",
  "les",
  "un",
  "une",
  "des",
  "du",
  "de",
  "et",
  "en",
  "au",
  "aux",
  "ce",
  "ces",
  "qui",
  "que",
  "quoi",
  "dont",
  "ou",
  "est",
  "son",
  "sur",
  "par",
  "pour",
  "pas",
  "dans",
  "avec",
  "plus",
  "tout",
  "faire",
  "comme",
  "mais",
  "aussi",
  "été",
  "être",
  "avoir",
  "fait",
  "peut",
  "sont",
  "cette",
  "nous",
  "vous",
  "ils",
  "elle",
  "ses",
  "nos",
  "vos",
  "leur",
  "leurs",
  "mes",
  "mon",
  "ton",
  "tes",
  "the",
  "and",
  "for",
  "are",
  "was",
  "not",
  "but",
  "had",
  "has",
  "its",
  "our",
  "will",
  "all",
  "each",
  "which",
  "this",
  "from",
  "been",
  "have",
  "were",
  "they",
  "them",
  "than",
]);

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly textExtractor: TextExtractorService,
    private readonly embeddingService: EmbeddingService,
    private readonly llmService: LlmService,
    // Item 30 — services optionnels actives par feature flag
    private readonly hybridSearch: HybridSearchService,
    private readonly reranker: RerankerService,
    private readonly queryExpansion: QueryExpansionService,
    private readonly semanticChunker: SemanticChunkerService,
  ) {}

  // =========================================================================
  // Feature flags
  // =========================================================================

  /** Check whether the RAG pipeline is enabled via env var. */
  isEnabled(): boolean {
    return (
      process.env.RAG_ENABLED === "true" || process.env.RAG_ENABLED === "1"
    );
  }

  /** Check whether Ollama LLM is enabled via env var. */
  isOllamaEnabled(): boolean {
    return (
      process.env.OLLAMA_ENABLED === "true" ||
      process.env.OLLAMA_ENABLED === "1"
    );
  }

  /** Check whether semantic RAG (P1 pgvector) is enabled. */
  isSemanticEnabled(): boolean {
    return process.env.RAG_SEMANTIC_ENABLED === "true";
  }

  /** Get the current search mode: lexical | vector | hybrid. */
  getSearchMode(): "lexical" | "vector" | "hybrid" {
    const mode = process.env.RAG_HYBRID_MODE || "lexical";
    if (mode === "vector" || mode === "hybrid") return mode;
    return "lexical";
  }

  // =========================================================================
  // Chunking
  // =========================================================================

  /**
   * Split content into chunks.
   *
   * Item 30 : si `RAG_SEMANTIC_CHUNKING_ENABLED=true`, utilise la strategie
   * structure-aware (`SemanticChunkerService` — split sur titres, paragraphes,
   * preserve les listes / tableaux). Sinon, fallback sur la strategie historique
   * fixed-size 2000 chars / overlap 200 chars.
   *
   * Le service semantique gere son propre fallback : `chunk(...)` retombe sur
   * fixed-size si le flag est off, donc le code ci-dessous est defensif mais
   * stable cote re-index.
   */
  chunkContent(content: string): string[] {
    if (!content || content.length === 0) return [];
    if (this.semanticChunker.isEnabled()) {
      return this.semanticChunker.chunk(content, {
        maxChars: CHUNK_SIZE_CHARS,
        overlapChars: CHUNK_OVERLAP_CHARS,
      });
    }
    return this.semanticChunker.fixedSizeChunks(
      content,
      CHUNK_SIZE_CHARS,
      CHUNK_OVERLAP_CHARS,
    );
  }

  // =========================================================================
  // Indexing
  // =========================================================================

  /**
   * Index a single source: purge existing chunks then create new ones.
   */
  async indexSource(
    sourceType: SourceType,
    sourceId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<number> {
    const ragChunk = this.prisma.ragChunk;

    // Purge old chunks
    await ragChunk
      .deleteMany({
        where: { sourceType, sourceId },
      })
      .catch((err: Error) => {
        this.logger.warn(
          `Failed to delete old chunks for ${sourceType}/${sourceId}: ${err.message}`,
        );
      });

    const chunks = this.chunkContent(content);
    for (let i = 0; i < chunks.length; i++) {
      await ragChunk
        .create({
          data: {
            sourceType,
            sourceId,
            chunkIndex: i,
            content: chunks[i],
            tokenCount: Math.ceil(chunks[i].length / 4),
            // Prisma.InputJsonValue : metadata est un Record<string, unknown>.
            metadata: (metadata ?? undefined) as
              | Prisma.InputJsonValue
              | undefined,
          },
        })
        .catch((err: Error) => {
          this.logger.warn(
            `Failed to create chunk ${i} for ${sourceType}/${sourceId}: ${err.message}`,
          );
        });
    }

    this.logger.log(
      `Indexed ${chunks.length} chunks for ${sourceType}/${sourceId}`,
    );
    return chunks.length;
  }

  /**
   * Removes a source from the RAG index (all its chunks).
   * Called when a Document / WikiPage / Runbook / NewsPost is deleted
   * or soft-deleted so it disappears from AI search results.
   * Safe to call on a source that's not indexed (no-op).
   */
  async removeFromIndex(
    sourceType: SourceType,
    sourceId: string,
  ): Promise<number> {
    const ragChunk = this.prisma.ragChunk;
    const result = await ragChunk
      .deleteMany({
        where: { sourceType, sourceId },
      })
      .catch((err: Error) => {
        this.logger.warn(
          `rag.deindex.failed ${sourceType}/${sourceId}: ${err.message}`,
        );
        return { count: 0 };
      });
    const count = result?.count ?? 0;
    if (count > 0) {
      this.logger.log(
        `rag.deindex ${sourceType}/${sourceId} — ${count} chunks removed`,
      );
    }
    return count;
  }

  /**
   * Reindex all known content sources using cursor-based pagination.
   */
  async reindexAll(): Promise<{
    indexed: Record<string, number>;
    errors: string[];
  }> {
    const BATCH_SIZE = 100;
    const indexed: Record<string, number> = {
      DOCUMENT: 0,
      WIKI: 0,
      PROCEDURE: 0,
      RUNBOOK: 0,
      FAQ: 0,
    };
    const errors: string[] = [];

    // --- Documents ---
    try {
      let cursor: string | undefined;
      while (true) {
        const docs = await this.prisma.document.findMany({
          take: BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: "asc" },
          include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
        });
        if (docs.length === 0) break;
        cursor = docs[docs.length - 1].id;

        for (const doc of docs) {
          try {
            let text = doc.content ?? "";

            // If the document has uploaded file versions, try to extract text
            if (!text && doc.versions.length > 0) {
              const latestVersion = doc.versions[0];
              const extracted = await this.textExtractor.extractText(
                latestVersion.fileUrl,
                latestVersion.fileType,
              );
              if (extracted) text = extracted;
            }

            if (text.trim().length > 0) {
              const n = await this.indexSource("DOCUMENT", doc.id, text, {
                title: doc.title,
                reference: doc.reference,
                classification: doc.classification,
              });
              indexed.DOCUMENT += n;
            }
          } catch (err) {
            const msg = `Document ${doc.id}: ${(err as Error).message}`;
            this.logger.warn(msg);
            errors.push(msg);
          }
        }
      }
    } catch (err) {
      const msg = `Documents batch error: ${(err as Error).message}`;
      this.logger.warn(msg);
      errors.push(msg);
    }

    // --- Wiki pages ---
    try {
      let cursor: string | undefined;
      while (true) {
        const pages = await this.prisma.wikiPage.findMany({
          take: BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: "asc" },
        });
        if (pages.length === 0) break;
        cursor = pages[pages.length - 1].id;

        for (const page of pages) {
          try {
            if (page.content && page.content.trim().length > 0) {
              const n = await this.indexSource("WIKI", page.id, page.content, {
                title: page.title,
                slug: page.slug,
              });
              indexed.WIKI += n;
            }
          } catch (err) {
            const msg = `Wiki ${page.id}: ${(err as Error).message}`;
            this.logger.warn(msg);
            errors.push(msg);
          }
        }
      }
    } catch (err) {
      const msg = `Wiki batch error: ${(err as Error).message}`;
      this.logger.warn(msg);
      errors.push(msg);
    }

    // --- Runbooks ---
    try {
      let cursor: string | undefined;
      while (true) {
        const runbooks = await this.prisma.runbook.findMany({
          take: BATCH_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: "asc" },
        });
        if (runbooks.length === 0) break;
        cursor = runbooks[runbooks.length - 1].id;

        for (const rb of runbooks) {
          try {
            const text = `${rb.title}\n${rb.description ?? ""}\n${rb.content}`;
            if (text.trim().length > 0) {
              const n = await this.indexSource("RUNBOOK", rb.id, text, {
                title: rb.title,
                slug: rb.slug,
              });
              indexed.RUNBOOK += n;
            }
          } catch (err) {
            const msg = `Runbook ${rb.id}: ${(err as Error).message}`;
            this.logger.warn(msg);
            errors.push(msg);
          }
        }
      }
    } catch (err) {
      const msg = `Runbooks batch error: ${(err as Error).message}`;
      this.logger.warn(msg);
      errors.push(msg);
    }

    // --- Procedures (via ragChunk — no dedicated model, indexed externally) ---
    // Procedures and FAQs don't have dedicated Prisma models yet.
    // They can be indexed via `indexSource()` from external callers.

    this.logger.log(
      `Reindex complete: ${JSON.stringify(indexed)}, errors: ${errors.length}`,
    );
    return { indexed, errors };
  }

  // =========================================================================
  // Search (lexical TF scoring fallback — no pgvector)
  // =========================================================================

  /** Tokenize a query: NFD normalization, FR stop-words removal, min length 3. */
  tokenizeQuery(text: string): string[] {
    const normalized = text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const words = normalized.split(/\W+/).filter(Boolean);
    return words
      .filter((w) => w.length >= 3 && !FR_STOP_WORDS.has(w))
      .slice(0, 8);
  }

  /** Build a ~300-char snippet window centered on the first matching term. */
  buildSnippet(content: string, terms: string[]): string {
    const lowerContent = content
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    let bestPos = -1;
    for (const term of terms) {
      const idx = lowerContent.indexOf(term);
      if (idx !== -1) {
        bestPos = idx;
        break;
      }
    }
    if (bestPos === -1) bestPos = 0;
    const start = Math.max(0, bestPos - 150);
    const end = Math.min(content.length, start + 300);
    let snippet = content.slice(start, end).trim();
    if (start > 0) snippet = "…" + snippet;
    if (end < content.length) snippet = snippet + "…";
    return snippet;
  }

  // =========================================================================
  // RBAC helpers (ISO 27001 Annex A.5.15 — pré-filtrage par classification)
  // =========================================================================

  /**
   * Renvoie la liste des sourceIds de Documents auxquels l'utilisateur a accès,
   * en se basant sur la classification (PUBLIC < INTERNE < CONFIDENTIEL < SECRET).
   * Filtrage AVANT retrieval pour conformité ISO 27001.
   */
  private async getAccessibleDocumentIds(
    ctx: RagSearchContext,
  ): Promise<string[] | "ALL"> {
    const isPrivileged = ["SUPER_ADMIN", "ADMIN", "DIRECTION"].includes(
      ctx.role,
    );
    if (isPrivileged) return "ALL";

    try {
      const docs = await this.prisma.document.findMany({
        where: {
          OR: [
            { classification: "PUBLIC" },
            { classification: "INTERNE" },
            // CONFIDENTIEL : accessible si owner, reviewer, ou approver
            {
              classification: "CONFIDENTIEL",
              OR: [
                { ownerId: ctx.userId },
                { reviewerId: ctx.userId },
                { approverId: ctx.userId },
              ],
            },
            // SECRET : uniquement owner
            { classification: "SECRET", ownerId: ctx.userId },
          ],
        },
        select: { id: true },
      });
      return docs.map((d) => d.id);
    } catch (err) {
      this.logger.error({
        msg: "rbac.document_ids.failed",
        userId: ctx.userId,
        error: (err as Error).message,
      });
      return []; // Fail closed : aucun accès en cas d'erreur
    }
  }

  /**
   * Applique le filtrage RBAC sur les chunks candidats.
   * - Documents : filtrage par classification
   * - Wiki / Runbook : accessible si publié (déjà filtré à l'indexation)
   * - Procédure / FAQ : accessible à tous les authentifiés
   */
  private async applyRbacFilter(
    candidates: any[],
    ctx: RagSearchContext,
  ): Promise<any[]> {
    if (!ctx || process.env.RBAC_RAG_ENABLED === "false") {
      return candidates; // Feature flag désactivé → pas de filtrage
    }

    const docChunks = candidates.filter(
      (c: any) => c.sourceType === "DOCUMENT",
    );
    const otherChunks = candidates.filter(
      (c: any) => c.sourceType !== "DOCUMENT",
    );

    if (docChunks.length === 0) return candidates;

    const accessibleIds = await this.getAccessibleDocumentIds(ctx);

    let filteredDocChunks: any[];
    if (accessibleIds === "ALL") {
      filteredDocChunks = docChunks;
    } else {
      filteredDocChunks = docChunks.filter((c: any) =>
        accessibleIds.includes(c.sourceId),
      );
    }

    const filteredOut = docChunks.length - filteredDocChunks.length;
    if (filteredOut > 0) {
      this.logger.log({
        msg: "rbac.chunks_filtered",
        userId: ctx.userId,
        role: ctx.role,
        totalDocChunks: docChunks.length,
        filteredOut,
        remaining: filteredDocChunks.length,
      });
    }

    return [...filteredDocChunks, ...otherChunks];
  }

  /**
   * Lexical TF scoring search (fallback when pgvector is unavailable).
   * Tokenizes the query, pre-filters chunks via Prisma `contains`,
   * then scores with TF heuristics.
   * Applique le filtrage RBAC AVANT le scoring (ISO 27001 A.5.15).
   */
  async searchSimilar(
    query: string,
    limit = 10,
    ctx?: RagSearchContext,
  ): Promise<RagSource[]> {
    const terms = this.tokenizeQuery(query);
    if (terms.length === 0) return [];

    const ragChunk = this.prisma.ragChunk;

    // Pre-filter: find chunks containing at least one term
    let candidates: any[] = [];
    try {
      candidates = await ragChunk.findMany({
        where: {
          OR: terms.map((t: string) => ({
            content: { contains: t, mode: "insensitive" },
          })),
        },
        take: 200,
      });
    } catch (err) {
      this.logger.error({
        msg: "rag.search.pre_filter_failed",
        query: query.slice(0, 100),
        error: (err as Error).message,
      });
      return [];
    }

    // RBAC filtering BEFORE scoring (ISO 27001 Annex A.5.15)
    if (ctx) {
      candidates = await this.applyRbacFilter(candidates, ctx);
    }

    const lowerQuery = query
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    // Score each candidate
    const scored = candidates.map((chunk: any) => {
      const lowerContent = chunk.content
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      let score = 0;

      // +3 per occurrence of each term
      for (const term of terms) {
        let idx = 0;
        while (true) {
          idx = lowerContent.indexOf(term, idx);
          if (idx === -1) break;
          score += 3;
          idx += term.length;
        }
      }

      // +5 bonus if all terms appear
      const allPresent = terms.every((t) => lowerContent.includes(t));
      if (allPresent) score += 5;

      // +10 bonus for exact phrase match
      if (lowerContent.includes(lowerQuery)) score += 10;

      return { chunk, score };
    });

    // Sort descending by score, take top N
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, limit);

    // Normalize scores
    const maxScore = top.length > 0 ? top[0].score : 1;

    return top.map(({ chunk, score }) => {
      // Prisma.JsonValue dynamique — extraction défensive du metadata
      const meta =
        chunk.metadata &&
        typeof chunk.metadata === "object" &&
        !Array.isArray(chunk.metadata)
          ? (chunk.metadata as Record<string, unknown>)
          : {};
      return {
        sourceType: chunk.sourceType as SourceType,
        sourceId: chunk.sourceId as string,
        title: (meta.title as string | undefined) ?? chunk.sourceId,
        snippet: this.buildSnippet(chunk.content, terms),
        score: maxScore > 0 ? score / maxScore : 0,
        classification: meta.classification as string | undefined,
      };
    });
  }

  // =========================================================================
  // Vector search (P1.3 — requiert pgvector + embeddings)
  // =========================================================================

  /**
   * Recherche par similarité cosine via pgvector.
   * Nécessite RAG_SEMANTIC_ENABLED=true et des embeddings non-null.
   */
  async vectorSearch(
    query: string,
    limit = 10,
    ctx?: RagSearchContext,
  ): Promise<RagSource[]> {
    if (!this.isSemanticEnabled()) return [];

    let queryEmbedding: number[];
    try {
      queryEmbedding = await this.embeddingService.embed(query);
    } catch (err) {
      this.logger.error({
        msg: "rag.vector_search.embedding_failed",
        error: (err as Error).message,
      });
      return [];
    }

    const threshold = parseFloat(
      process.env.VECTOR_SIMILARITY_THRESHOLD || "0.5",
    );

    // Build accessible IDs filter for RBAC
    let accessFilter = "";
    if (ctx && process.env.RBAC_RAG_ENABLED !== "false") {
      const isPrivileged = ["SUPER_ADMIN", "ADMIN", "DIRECTION"].includes(
        ctx.role,
      );
      if (!isPrivileged) {
        const accessibleIds = await this.getAccessibleDocumentIds(ctx);
        if (accessibleIds !== "ALL" && accessibleIds.length === 0) {
          // User has no document access — only search non-DOCUMENT sources
          accessFilter = `AND ("sourceType" != 'DOCUMENT')`;
        } else if (accessibleIds !== "ALL") {
          const idsList = accessibleIds.map((id) => `'${id}'`).join(",");
          accessFilter = `AND ("sourceType" != 'DOCUMENT' OR "sourceId" IN (${idsList}))`;
        }
      }
    }

    try {
      const embeddingStr = `[${queryEmbedding.join(",")}]`;
      const results: any[] = await this.prisma.$queryRawUnsafe(
        `
        SELECT id, content, "sourceType", "sourceId", metadata,
               1 - (embedding <=> $1::vector) AS similarity
        FROM "RagChunk"
        WHERE embedding IS NOT NULL
          AND 1 - (embedding <=> $1::vector) >= ${threshold}
          ${accessFilter}
        ORDER BY embedding <=> $1::vector
        LIMIT ${limit}
      `,
        embeddingStr,
      );

      return results.map((r: any) => ({
        sourceType: r.sourceType as SourceType,
        sourceId: r.sourceId as string,
        title: r.metadata?.title ?? r.sourceId,
        snippet: this.buildSnippet(r.content, this.tokenizeQuery(query)),
        score: parseFloat(r.similarity) || 0,
        classification: r.metadata?.classification,
      }));
    } catch (err) {
      this.logger.error({
        msg: "rag.vector_search.query_failed",
        error: (err as Error).message,
      });
      return [];
    }
  }

  // =========================================================================
  // Hybrid search — RRF fusion (P1.3)
  // =========================================================================

  /**
   * Reciprocal Rank Fusion des résultats lexicaux et vectoriels.
   * Paramètre k=60 (standard Cormack et al. 2009).
   */
  private reciprocalRankFusion(
    lexicalResults: RagSource[],
    vectorResults: RagSource[],
    k = 60,
  ): RagSource[] {
    const scores = new Map<string, { score: number; source: RagSource }>();

    const makeKey = (s: RagSource) =>
      `${s.sourceType}:${s.sourceId}:${s.snippet.slice(0, 50)}`;

    lexicalResults.forEach((r, idx) => {
      const key = makeKey(r);
      const existing = scores.get(key);
      const rrfScore = 1 / (k + idx + 1);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scores.set(key, { score: rrfScore, source: r });
      }
    });

    vectorResults.forEach((r, idx) => {
      const key = makeKey(r);
      const existing = scores.get(key);
      const rrfScore = 1 / (k + idx + 1);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scores.set(key, { score: rrfScore, source: r });
      }
    });

    return Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .map(({ source, score }) => ({ ...source, score }));
  }

  /**
   * Point d'entrée unifié de recherche selon le mode configuré.
   * Remplace les appels directs à searchSimilar dans le pipeline RAG.
   *
   * Item 30 — pipeline upgrade :
   *  1. Query expansion (`RAG_QUERY_EXPANSION_ENABLED`) : LLM genere N
   *     reformulations -> chaque variant fait un retrieval -> fusion RRF.
   *  2. Hybrid BM25-vector (`RAG_BM25_ENABLED`) : retrieval combine BM25 sur
   *     RagChunk + vector via `HybridSearchService`. Fallback sur l'ancien
   *     pipeline si flag off.
   *  3. Reranker (`RAG_RERANKER_ENABLED`) : cross-encoder reordonne le top-K
   *     en top-N pour ameliorer le MRR.
   *
   * Tous les flags sont independants. Quand tous off, comportement = legacy.
   */
  async search(
    query: string,
    limit = 10,
    ctx?: RagSearchContext,
  ): Promise<RagSource[]> {
    if (!query || !query.trim()) return [];

    // Etape 1 : query expansion (no-op si flag off — retourne [query]).
    const queries = await this.queryExpansion.expand(query).catch((err) => {
      this.logger.warn({
        msg: "rag.search.query_expansion_failed",
        error: (err as Error).message,
      });
      return [query];
    });

    // Etape 2 : retrieval pour chaque variant + fusion si > 1
    const perQueryLimit = Math.max(limit, 10);
    const retrievalResults: RagSource[][] = [];
    for (const q of queries) {
      const r = await this.retrieveOnce(q, perQueryLimit, ctx);
      if (r.length > 0) retrievalResults.push(r);
    }

    if (retrievalResults.length === 0) return [];

    let merged: RagSource[];
    if (retrievalResults.length === 1) {
      merged = retrievalResults[0];
    } else {
      // RRF entre toutes les listes pour fusionner les variants
      merged = this.reciprocalRankFusionMulti(retrievalResults);
    }

    // Etape 3 : reranker (no-op si flag off — retourne le top-N initial)
    if (this.reranker.isEnabled() && merged.length > 0) {
      try {
        const candidates = merged.slice(0, this.reranker.getTopK()).map((s) => ({
          id: `${s.sourceType}:${s.sourceId}`,
          content: s.snippet,
          source: s,
          initialScore: s.score,
        }));
        const reranked = await this.reranker.rerank(query, candidates, limit);
        if (reranked.length > 0) {
          return reranked.map((r) => ({
            ...r.candidate.source,
            score: r.rerankScore,
          }));
        }
      } catch (err) {
        // Reranker non bloquant : log + on retourne le retrieval initial
        this.logger.warn({
          msg: "rag.search.rerank_failed",
          error: (err as Error).message,
        });
      }
    }

    return merged.slice(0, limit);
  }

  /**
   * Une passe de retrieval (sans expansion ni rerank).
   *
   * Honore `RAG_HYBRID_MODE` (`lexical|vector|hybrid`) et `RAG_BM25_ENABLED`.
   * Quand BM25 est on et qu'on est en mode hybrid, on utilise
   * `HybridSearchService` (BM25 SQL + vector pgvector + alpha/RRF).
   */
  private async retrieveOnce(
    query: string,
    limit: number,
    ctx?: RagSearchContext,
  ): Promise<RagSource[]> {
    const mode = this.getSearchMode();

    // Cas 1 : hybrid + BM25 enabled -> nouveau service hybride
    if (mode === "hybrid" && this.hybridSearch.isBM25Enabled()) {
      const filter = await this.buildAccessFilter(ctx);
      const hybrid = await this.hybridSearch.search(query, limit, filter);
      // Le filtrage RBAC est deja applique cote SQL via `filter`. On ne re-filtre
      // que si l'appelant a fourni un ctx (defense en profondeur post-SQL).
      const filtered = ctx ? await this.applyRbacFilter(hybrid, ctx) : hybrid;
      return this.toRagSources(filtered, query);
    }

    // Cas 2 : lexical pur (ou semantic disabled) -> ancien searchSimilar
    if (mode === "lexical" || !this.isSemanticEnabled()) {
      return this.searchSimilar(query, limit, ctx);
    }

    // Cas 3 : vector pur
    if (mode === "vector") {
      return this.vectorSearch(query, limit, ctx);
    }

    // Cas 4 : hybrid sans BM25 (legacy) -> RRF lexical + vector
    const [lexical, vector] = await Promise.all([
      this.searchSimilar(query, limit, ctx),
      this.vectorSearch(query, limit, ctx),
    ]);
    const fused = this.reciprocalRankFusion(lexical, vector);
    return fused.slice(0, limit);
  }

  /**
   * Reciprocal Rank Fusion sur N listes (utilise pour fusionner les retrieval
   * apres query expansion). Cle = sourceType:sourceId pour deduper les chunks
   * issus de variants differents.
   */
  private reciprocalRankFusionMulti(
    lists: RagSource[][],
    k = 60,
  ): RagSource[] {
    const scores = new Map<string, { score: number; source: RagSource }>();
    const makeKey = (s: RagSource) => `${s.sourceType}:${s.sourceId}`;

    for (const list of lists) {
      list.forEach((r, idx) => {
        const key = makeKey(r);
        const inc = 1 / (k + idx + 1);
        const existing = scores.get(key);
        if (existing) {
          existing.score += inc;
        } else {
          scores.set(key, { score: inc, source: r });
        }
      });
    }

    return Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .map(({ source, score }) => ({ ...source, score }));
  }

  /**
   * Construit le clause SQL de filtrage RBAC pour `HybridSearchService`.
   * Retourne `undefined` si pas de contexte (filtrage applique post-retrieval),
   * ou si user privileged (acces total).
   */
  private async buildAccessFilter(
    ctx?: RagSearchContext,
  ): Promise<string | undefined> {
    if (!ctx || process.env.RBAC_RAG_ENABLED === "false") return undefined;

    const isPrivileged = ["SUPER_ADMIN", "ADMIN", "DIRECTION"].includes(
      ctx.role,
    );
    if (isPrivileged) return undefined;

    const accessibleIds = await this.getAccessibleDocumentIds(ctx);
    if (accessibleIds === "ALL") return undefined;
    if (accessibleIds.length === 0) {
      return `AND ("sourceType" != 'DOCUMENT')`;
    }
    // Defense-in-depth : whitelist UUID v4 strict avant l'injection SQL.
    // Les ids viennent de Prisma (donc UUID-valides par construction), mais
    // on valide explicitement pour bloquer toute corruption du flux amont
    // (cache, mock test, futur refactor). N'importe quel id non-UUID est
    // silencieusement filtré — l'effet est qu'il ne sera pas accessible,
    // pas qu'on injecte du SQL.
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safeIds = accessibleIds.filter((id) => UUID_RE.test(id));
    if (safeIds.length === 0) {
      return `AND ("sourceType" != 'DOCUMENT')`;
    }
    const idsList = safeIds.map((id) => `'${id}'`).join(",");
    return `AND ("sourceType" != 'DOCUMENT' OR "sourceId" IN (${idsList}))`;
  }

  /**
   * Convertit `HybridChunk[]` (sortie du hybrid search) en `RagSource[]`
   * (forme attendue par le reste du pipeline).
   */
  private toRagSources(chunks: HybridChunk[], query: string): RagSource[] {
    const terms = this.tokenizeQuery(query);
    return chunks.map((c) => {
      const meta =
        c.metadata && typeof c.metadata === "object" && !Array.isArray(c.metadata)
          ? (c.metadata as Record<string, unknown>)
          : {};
      return {
        sourceType: c.sourceType as SourceType,
        sourceId: c.sourceId,
        title: (meta.title as string | undefined) ?? c.sourceId,
        snippet: this.buildSnippet(c.content, terms),
        score: c.score,
        classification: meta.classification as string | undefined,
      };
    });
  }

  // =========================================================================
  // LLM interaction (Ollama)
  // =========================================================================

  /** Call local Ollama instance for text generation. */
  async callLlm(prompt: string, maxTokens = 500): Promise<string> {
    const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
    const model = process.env.OLLAMA_MODEL || "mistral";
    const timeoutMs = parseInt(process.env.OLLAMA_TIMEOUT_MS || "60000", 10);

    // Ajout timeout : sans signal d'abort, fetch peut pendre indéfiniment si
    // Ollama ne répond pas (CPU thrashing, deadlock, etc.) → bloque la requête HTTP appelante.
    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { num_predict: maxTokens },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama returned ${response.status}: ${response.statusText}`,
      );
    }

    const data = (await response.json()) as { response?: string };
    return data.response?.trim() ?? "";
  }

  /**
   * Stream tokens from Ollama. Yields each token string as it arrives.
   * Uses Ollama's native `stream: true` which emits newline-delimited JSON.
   */
  async *callLlmStream(
    prompt: string,
    maxTokens = 500,
  ): AsyncGenerator<string> {
    const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
    const model = process.env.OLLAMA_MODEL || "mistral";
    const timeoutMs = parseInt(
      process.env.OLLAMA_STREAM_TIMEOUT_MS || "120000",
      10,
    );

    const response = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: true,
        options: { num_predict: maxTokens },
      }),
      // Timeout d'init de connexion uniquement — le streaming peut durer plus longtemps,
      // mais le 1er byte doit arriver dans la fenêtre.
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama returned ${response.status}: ${response.statusText}`,
      );
    }

    const reader = response.body as AsyncIterable<Uint8Array>;
    const decoder = new TextDecoder();
    let buffer = "";

    for await (const chunk of reader) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line) as {
            response?: string;
            done?: boolean;
          };
          if (parsed.response) {
            yield parsed.response;
          }
        } catch {
          // Partial JSON, skip
        }
      }
    }
  }

  /**
   * Streaming RAG pipeline: performs retrieval, then streams the LLM answer token-by-token.
   * Calls `onToken(token)` for each LLM token and `onDone(metadata)` when complete.
   * Falls back to non-streaming if Ollama is disabled.
   * Applique le filtrage RBAC si un contexte est fourni (P-1.1).
   */
  async answerStream(
    question: string,
    userId: string,
    onToken: (token: string) => void,
    onMeta: (meta: {
      sources: RagSource[];
      retrievalConfidence: number;
      durationMs: number;
      queryId?: string;
    }) => void,
    ctx?: RagSearchContext,
  ): Promise<void> {
    const start = Date.now();

    const sources = await this.search(question, 10, ctx);
    const retrievalConfidence = sources.length > 0 ? sources[0].score : 0;

    // Log the query
    let queryId: string | undefined;
    try {
      const logEntry = await this.prisma.ragQueryLog.create({
        data: {
          userId,
          query: question,
          chunksUsed: sources.length,
          durationMs: 0,
        },
      });
      queryId = logEntry.id;
    } catch (err) {
      this.logger.error({
        msg: "rag.query_log.create_failed",
        userId,
        error: (err as Error).message,
      });
    }

    // Confidence gate
    if (retrievalConfidence < CONFIDENCE_THRESHOLD || sources.length === 0) {
      const noAnswer =
        "Je n'ai pas trouvé d'information suffisamment pertinente pour répondre à cette question. Essayez de reformuler ou contactez le support.";
      onToken(noAnswer);
      const durationMs = Date.now() - start;
      if (queryId) {
        this.prisma.ragQueryLog
          .update({ where: { id: queryId }, data: { durationMs } })
          .catch((err) => {
            this.logger.error({
              msg: "rag.query_log.update_failed",
              queryId,
              error: (err as Error).message,
            });
          });
      }
      onMeta({ sources: [], retrievalConfidence, durationMs, queryId });
      return;
    }

    // Emit sources immediately so the frontend can display them while LLM streams
    onMeta({ sources, retrievalConfidence, durationMs: 0, queryId });

    // P1.8.1.3 : prompt template adapté au modèle actif
    const templates = getPromptTemplates(this.llmService.getActiveModel());
    const prompt = templates.rag({
      query: question,
      chunks: sources.slice(0, 5).map((s) => ({
        sourceType: s.sourceType,
        title: s.title,
        snippet: s.snippet,
      })),
    });

    if (this.isOllamaEnabled()) {
      try {
        for await (const token of this.llmService.generateStream(prompt)) {
          onToken(token);
        }
      } catch (err) {
        this.logger.error({
          msg: "rag.llm_stream.failed",
          userId,
          error: (err as Error).message,
        });
        // Extractive fallback — l'utilisateur reçoit le meilleur chunk brut
        onToken(sources[0].snippet);
      }
    } else {
      // Extractive fallback
      onToken(sources[0].snippet);
    }

    const durationMs = Date.now() - start;
    if (queryId) {
      this.prisma.ragQueryLog
        .update({ where: { id: queryId }, data: { durationMs } })
        .catch((err) => {
          this.logger.error({
            msg: "rag.query_log.update_failed",
            queryId,
            error: (err as Error).message,
          });
        });
    }
  }

  // =========================================================================
  // RAG answer pipeline
  // =========================================================================

  /**
   * Full RAG pipeline: search -> confidence gate -> context assembly -> LLM or extractive fallback.
   * Applique le filtrage RBAC si un contexte est fourni (P-1.1).
   */
  async answer(
    question: string,
    userId: string,
    ctx?: RagSearchContext,
  ): Promise<RagAnswer> {
    const start = Date.now();

    if (!this.isEnabled()) {
      this.logger.warn({ msg: "rag.pipeline.disabled", userId });
      return {
        answer:
          "Le moteur RAG est désactivé. Contactez un administrateur pour l'activer.",
        sources: [],
        retrievalConfidence: 0,
        source: "none",
        pipelineInfo: { enabled: false },
        durationMs: Date.now() - start,
        queryId: undefined,
      };
    }

    // 1. Search for relevant chunks (with RBAC filtering)
    const sources = await this.search(question, 10, ctx);
    const retrievalConfidence = sources.length > 0 ? sources[0].score : 0;

    // Log the query
    let queryId: string | undefined;
    try {
      const logEntry = await this.prisma.ragQueryLog.create({
        data: {
          userId,
          query: question,
          chunksUsed: sources.length,
          durationMs: 0, // updated at end
        },
      });
      queryId = logEntry.id;
    } catch (err) {
      this.logger.error({
        msg: "rag.query_log.create_failed",
        userId,
        error: (err as Error).message,
      });
    }

    // 2. Confidence gate
    if (retrievalConfidence < CONFIDENCE_THRESHOLD || sources.length === 0) {
      const earlyDurationMs = Date.now() - start;
      if (queryId) {
        this.prisma.ragQueryLog
          .update({
            where: { id: queryId },
            data: { durationMs: earlyDurationMs },
          })
          .catch((err) => {
            this.logger.warn(
              `Failed to update RAG query duration: ${(err as Error).message}`,
            );
          });
      }
      return {
        answer:
          "Je n'ai pas trouvé d'information suffisamment pertinente pour répondre à cette question. Essayez de reformuler ou contactez le support.",
        sources: [],
        retrievalConfidence,
        source: "none",
        pipelineInfo: { belowThreshold: true, threshold: CONFIDENCE_THRESHOLD },
        durationMs: earlyDurationMs,
        queryId,
      };
    }

    // 3. Assemble context from top sources
    const contextParts = sources
      .slice(0, 5)
      .map(
        (s, i) =>
          `[Source ${i + 1} — ${s.sourceType}] ${s.title}\n${s.snippet}`,
      );
    // contextParts assemble plus bas par le LLM dans buildPrompt — on conserve
    // les chunks tries pour traceabilite de citation.
    const _context = contextParts.join("\n\n");

    // 4. LLM or extractive fallback
    let answer: string;
    let answerSource: "llm" | "extractive";

    if (this.isOllamaEnabled()) {
      try {
        // P1.8.1.3 : prompt template adapté au modèle actif (Mistral [INST], phi3 ChatML, qwen legacy)
        const templates = getPromptTemplates(this.llmService.getActiveModel());
        const prompt = templates.rag({
          query: question,
          chunks: sources.slice(0, 5).map((s) => ({
            sourceType: s.sourceType,
            title: s.title,
            snippet: s.snippet,
          })),
        });

        const result = await this.llmService.generate(prompt, {
          maxTokens: 500,
        });
        answer = result.text;
        answerSource = "llm";
      } catch (err) {
        this.logger.error({
          msg: "rag.llm.call_failed",
          userId,
          error: (err as Error).message,
        });
        answer = sources[0].snippet;
        answerSource = "extractive";
      }
    } else {
      // Extractive fallback: return the best snippet
      answer = sources[0].snippet;
      answerSource = "extractive";
    }

    const durationMs = Date.now() - start;

    // Update the query log with actual duration
    if (queryId) {
      this.prisma.ragQueryLog
        .update({
          where: { id: queryId },
          data: { durationMs },
        })
        .catch((err) => {
          this.logger.error({
            msg: "rag.query_log.update_failed",
            queryId,
            error: (err as Error).message,
          });
        });
    }

    return {
      answer,
      sources,
      retrievalConfidence,
      source: answerSource,
      pipelineInfo: {
        ollamaEnabled: this.isOllamaEnabled(),
        chunksFound: sources.length,
        topScore: retrievalConfidence,
      },
      durationMs,
      queryId,
    };
  }

  // =========================================================================
  // Document summary
  // =========================================================================

  /** Generate an LLM summary of a document. Results are cached. */
  async summarizeDocument(documentId: string): Promise<{ summary: string }> {
    const cacheKey = `doc-summary:${documentId}`;
    const cached = getCached<{ summary: string }>(cacheKey);
    if (cached) return cached;

    const doc = await this.prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    let text = doc.content ?? "";

    if (!text && doc.versions.length > 0) {
      const latest = doc.versions[0];
      const extracted = await this.textExtractor.extractText(
        latest.fileUrl,
        latest.fileType,
      );
      if (extracted) text = extracted;
    }

    if (!text.trim()) {
      return { summary: "Aucun contenu textuel disponible pour ce document." };
    }

    if (!this.isOllamaEnabled()) {
      // Extractive fallback: first 500 chars
      const summary =
        text.slice(0, 500).trim() + (text.length > 500 ? "…" : "");
      const result = { summary };
      setCache(cacheKey, result);
      return result;
    }

    const prompt = `Tu es un assistant documentaire pour OMNITECH SECURITY. Résume le document suivant en français, en 3 à 5 phrases concises.

Document : ${doc.title}
Contenu :
${text.slice(0, 4000)}

Résumé :`;

    const summary = await this.callLlm(prompt, 300);
    const result = { summary };
    setCache(cacheKey, result);
    return result;
  }

  // =========================================================================
  // Ticket response suggestion
  // =========================================================================

  /** Suggest a response for a support ticket using RAG context. */
  async suggestTicketResponse(
    ticketId: string,
  ): Promise<{ suggestion: string }> {
    const ticket = await this.prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { comments: { orderBy: { createdAt: "asc" } } },
    });

    const ticketText = `${ticket.title}\n${ticket.description}`;
    const sources = await this.searchSimilar(ticketText, 5);

    if (sources.length === 0 || sources[0].score < CONFIDENCE_THRESHOLD) {
      return {
        suggestion:
          "Pas assez de contexte dans la base de connaissances pour suggérer une réponse.",
      };
    }

    const context = sources
      .slice(0, 3)
      .map((s, i) => `[${i + 1}] ${s.title}: ${s.snippet}`)
      .join("\n\n");

    if (!this.isOllamaEnabled()) {
      return { suggestion: sources[0].snippet };
    }

    const prompt = `Tu es un technicien support OMNITECH SECURITY. Suggère une réponse professionnelle en français pour ce ticket.

Ticket : ${ticket.title}
Description : ${ticket.description}
${
  ticket.comments.length > 0
    ? `Derniers commentaires :\n${ticket.comments
        .slice(-3)
        .map((c: any) => c.content)
        .join("\n---\n")}`
    : ""
}

Base de connaissances :
${context}

Réponse suggérée :`;

    const suggestion = await this.callLlm(prompt, 500);
    return { suggestion };
  }

  // =========================================================================
  // Wiki article Q&A
  // =========================================================================

  /** Answer a question about a specific wiki article. */
  async askAboutArticle(
    articleId: string,
    question: string,
  ): Promise<{ answer: string }> {
    const page = await this.prisma.wikiPage.findUniqueOrThrow({
      where: { id: articleId },
    });

    if (!page.content || !page.content.trim()) {
      return { answer: "Cet article ne contient pas de contenu textuel." };
    }

    if (!this.isOllamaEnabled()) {
      // Extractive fallback
      const terms = this.tokenizeQuery(question);
      const snippet = this.buildSnippet(page.content, terms);
      return { answer: snippet || page.content.slice(0, 300) };
    }

    const prompt = `Tu es un assistant intranet OMNITECH SECURITY. Réponds à la question en te basant uniquement sur l'article wiki suivant. Réponds en français.

Article : ${page.title}
Contenu :
${page.content.slice(0, 4000)}

Question : ${question}

Réponse :`;

    const answer = await this.callLlm(prompt, 400);
    return { answer };
  }

  // =========================================================================
  // Stats
  // =========================================================================

  /** Aggregated stats for the admin page. */
  async getStats(): Promise<Record<string, unknown>> {
    const ragChunk = this.prisma.ragChunk;

    let chunksByType: Array<{ sourceType: string; _count: { id: number } }> =
      [];
    try {
      // Prisma's groupBy a une signature `T extends RagChunkGroupByArgs &
      // any[]` qui force l'argument à être déclaré comme tuple sinon TS rejette
      // l'objet seul. On contourne avec un cast structurel sur l'arg d'entrée.
      chunksByType = (await ragChunk.groupBy({
        by: ["sourceType"],
        _count: { id: true },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)) as Array<{ sourceType: string; _count: { id: number } }>;
    } catch (err) {
      this.logger.warn(`Failed to get chunk stats: ${(err as Error).message}`);
    }

    let totalChunks = 0;
    const byType: Record<string, number> = {};
    for (const row of chunksByType) {
      byType[row.sourceType] = row._count.id;
      totalChunks += row._count.id;
    }

    let recentQueries: any[] = [];
    try {
      recentQueries = await this.prisma.ragQueryLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { user: { select: { email: true } } },
      });
    } catch (err) {
      this.logger.warn(`Failed to get query stats: ${(err as Error).message}`);
    }

    let totalQueries = 0;
    try {
      totalQueries = await this.prisma.ragQueryLog.count();
    } catch (err) {
      this.logger.warn(`Failed to count queries: ${(err as Error).message}`);
    }

    return {
      enabled: this.isEnabled(),
      ollamaEnabled: this.isOllamaEnabled(),
      totalChunks,
      chunksByType: byType,
      totalQueries,
      recentQueries: recentQueries.map((q: any) => ({
        id: q.id,
        query: q.query,
        chunksUsed: q.chunksUsed,
        durationMs: q.durationMs,
        createdAt: q.createdAt,
        userEmail: q.user?.email,
      })),
    };
  }
}
