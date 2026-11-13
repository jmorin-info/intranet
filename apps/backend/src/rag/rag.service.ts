import { ConflictException, ForbiddenException, Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { assertBackgroundCapacity, positiveInt, throwIfAborted } from "./reindex-safety";
import { acquireReindexLease } from "./reindex-lease";
import { PrismaService } from "../prisma/prisma.service";
import { documentReaderScope, canReadDocumentWithPermissions } from "../common/document-access";
import { TextExtractorService } from "./text-extractor.service";
import { EmbeddingService } from "./embedding/embedding.service";
import { HybridSearchService, HybridChunk } from "./embedding/hybrid-search.service";
import { RerankerService } from "./embedding/reranker.service";
import { QueryExpansionService } from "./embedding/query-expansion.service";
import { SemanticChunkerService } from "./ingestion/semantic-chunker.service";
import { LlmService, getOllamaTimeoutMs } from "./llm/llm.service";
import { getPromptTemplates } from "./prompts/templates";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const _EMBEDDING_DIMS = 1024; // documente la dimension du modele d'embedding (mxbai-embed-large)
const CHUNK_SIZE_CHARS = 2000;
const CHUNK_OVERLAP_CHARS = 200;
const CONFIDENCE_THRESHOLD = 0.3;

// Budgets IA réalistes pour l'inférence CPU (~5 tok/s génération, ~16 tok/s
// prompt-eval mesurés). Les valeurs sont surchargées par l'env :
//   RAG_ANSWER_TIMEOUT_MS (180 s), RAG_ANSWER_MAX_TOKENS (256).
const DEFAULT_ANSWER_TIMEOUT_MS = 180_000;
const DEFAULT_ANSWER_MAX_TOKENS = 256;

// Résumé IA : entrée ≤ 2000 chars (≈ 550 tokens de prompt-eval, ~35 s CPU),
// map-reduce en 2 passes au-delà (max 3 segments = 6000 chars couverts).
const SUMMARY_INPUT_CHARS = 2000;
// Fenêtre d'entrée de la PASSE UNIQUE en streaming (pas de map-reduce) : plus
// large que le mode bloquant car un seul appel LLM, tokens streamés au fil de
// l'eau. ~1700 tokens de contexte, acceptable sur mistral.
// Budget d'entrée du résumé streamé. 4000 chars (baseline latence connu) mais
// échantillonnés INTELLIGEMMENT (début + milieu + fin, cf. sampleForSummary) :
// couvre tout le document au lieu de ne lire que le début, SANS alourdir le
// prompt-eval CPU (le 1er token reste ~30-40 s, pas 54 s comme à 5000).
const SUMMARY_STREAM_INPUT_CHARS = 4000;
const SUMMARY_MAX_SEGMENTS = 3;
// 240 tokens (2026-07-31) : résumé structuré et complet (objet + points clés +
// portée) au lieu de 3-4 phrases. Streamé → surcoût peu perceptible.
const SUMMARY_MAX_TOKENS = 240;
const SUMMARY_SEGMENT_MAX_TOKENS = 120;
const SUMMARY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h — invalidé par checksum de version
// Budget temps AGRÉGÉ de tout le map-reduce (jusqu'à 3 map + 1 reduce). Calé
// SOUS le timeout client (240 s côté fiche document) pour qu'un backend saturé
// n'accumule pas de requêtes zombies : sans lui, les 4 appels × 5 tentatives ×
// 240 s pouvaient atteindre ~80 min par requête HTTP.
const SUMMARY_TOTAL_BUDGET_MS = 200_000;
// En-dessous de ce reliquat, inutile d'entamer un appel LLM : on réduit sur ce
// qu'on a déjà (partiels) plutôt que de lancer une tentative vouée à l'échec.
const SUMMARY_MIN_CALL_MS = 3_000;
// Part du budget réservée à la passe reduce (sinon les 3 segments map peuvent
// consommer tout le budget et ne rien laisser à la synthèse finale).
const SUMMARY_REDUCE_RESERVE_MS = 60_000;

/** Étapes de progression exposées en SSE (chatbot / recherche IA). */
export interface RagStreamStatus {
  stage: "retrieving" | "generating" | "model_fallback" | "queued";
  model?: string;
  level?: number;
  /** Position en file d'attente LLM (stage=queued). 1 = juste après la requête en cours. */
  position?: number;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export const RAG_INDEX_CONTRACT_VERSION = 1;

type SourceType = "DOCUMENT" | "WIKI" | "PROCEDURE" | "RUNBOOK" | "FAQ" | "TICKET";

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
export class RagService implements OnModuleDestroy {
  private reindexController?: AbortController;
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
    return process.env.RAG_ENABLED === "true" || process.env.RAG_ENABLED === "1";
  }

  /** Check whether Ollama LLM is enabled via env var. */
  isOllamaEnabled(): boolean {
    return process.env.OLLAMA_ENABLED === "true" || process.env.OLLAMA_ENABLED === "1";
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

  /** Budget temps de génération d'une réponse RAG (env RAG_ANSWER_TIMEOUT_MS). */
  private getAnswerTimeoutMs(): number {
    const raw = parseInt(process.env.RAG_ANSWER_TIMEOUT_MS || "", 10);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ANSWER_TIMEOUT_MS;
  }

  /** Longueur max (tokens) d'une réponse RAG (env RAG_ANSWER_MAX_TOKENS). */
  private getAnswerMaxTokens(): number {
    const raw = parseInt(process.env.RAG_ANSWER_MAX_TOKENS || "", 10);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ANSWER_MAX_TOKENS;
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
    return this.semanticChunker.fixedSizeChunks(content, CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS);
  }

  // =========================================================================
  // Indexing
  // =========================================================================

  /** Prepare outside the transaction; replace the complete generation atomically. */
  async indexSource(
    sourceType: SourceType,
    sourceId: string,
    content: string,
    metadata?: Record<string, unknown>,
    options: { signal?: AbortSignal; background?: boolean; semantic?: boolean } = {},
  ): Promise<number> {
    const check = () => {
      throwIfAborted(options.signal);
      if (options.background !== false) assertBackgroundCapacity(options.semantic !== false && this.embeddingService.isEnabled());
    };
    check();
    let source: any;
    if (sourceType === "DOCUMENT") {
      source = await this.prisma.document.findFirst({ where: { id: sourceId, deletedAt: null, scanStatus: "CLEAN", currentVersionId: { not: null } } });
      if (!source) return 0;
      const version = await this.prisma.documentVersion.findFirst({ where: { id: source.currentVersionId!, documentId: sourceId } });
      if (!version) return 0;
      // Canonical current version only. Never trust content / provenance supplied by a caller.
      check();
      const stillClean = await this.prisma.document.findFirst({ where: { id: sourceId, deletedAt: null, scanStatus: "CLEAN", currentVersionId: source.currentVersionId, updatedAt: source.updatedAt } });
      if (!stillClean) return 0;
      content = await this.textExtractor.extractText(version.fileUrl, version.fileType, options.signal) ?? "";
      if (!content.trim()) throw new Error("Current document text unavailable; previous index preserved");
      metadata = { title: source.title, reference: source.reference, classification: source.classification, documentVersionId: source.currentVersionId, sourceUpdatedAt: String(source.updatedAt.getTime()) };
    } else if (sourceType === "WIKI" || sourceType === "RUNBOOK") {
      source = sourceType === "WIKI"
        ? await this.prisma.wikiPage.findFirst({ where: { id: sourceId, isPublished: true, visibility: "PUBLIC" } })
        : await this.prisma.runbook.findFirst({ where: { id: sourceId, isPublished: true } });
      if (!source) return 0;
      content = sourceType === "WIKI" ? source.content : `${source.title}\n${source.description ?? ""}\n${source.content}`;
      metadata = { title: source.title, slug: source.slug, sourceUpdatedAt: String(source.updatedAt.getTime()) };
    }
    if (content.length > 512_000) throw new Error("RAG source exceeds the 512000 character indexing limit");
    const chunks = this.chunkContent(content);
    if (chunks.length > 300) throw new Error("RAG source exceeds the 300 chunk indexing limit");
    const vectors: Array<number[] | undefined> = [];
    let embedded = 0;
    for (const chunk of chunks) {
      check();
      let vector: number[] | undefined;
      if (options.semantic !== false && this.embeddingService.isEnabled() && chunk.trim()) {
        try {
          vector = await this.embeddingService.embed(chunk, { signal: options.signal, background: options.background !== false });
          embedded++;
        } catch (err) {
          check(); // cancellation / low capacity must preserve the previous complete index
          this.logger.warn(`rag.embedding.lexical_fallback ${sourceType}/${sourceId}: ${(err as Error).message}`);
        }
      }
      vectors.push(vector);
    }
    check();
    await this.prisma.$transaction(async (tx) => {
      // All writers (including deindex) serialize per source, across backend processes.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sourceType}), hashtext(${sourceId}))`;
      if (source) {
        const table = sourceType === "DOCUMENT" ? Prisma.sql`"Document"` : sourceType === "WIKI" ? Prisma.sql`"WikiPage"` : Prisma.sql`"Runbook"`;
        await tx.$queryRaw(Prisma.sql`SELECT id FROM ${table} WHERE id = ${sourceId} FOR UPDATE`);
        const current = sourceType === "DOCUMENT"
          ? await tx.document.findFirst({ where: { id: sourceId, deletedAt: null, scanStatus: "CLEAN", currentVersionId: source.currentVersionId, updatedAt: source.updatedAt } })
          : sourceType === "WIKI"
            ? await tx.wikiPage.findFirst({ where: { id: sourceId, isPublished: true, visibility: "PUBLIC", updatedAt: source.updatedAt } })
            : await tx.runbook.findFirst({ where: { id: sourceId, isPublished: true, updatedAt: source.updatedAt } });
        if (!current) throw new Error("RAG source changed during indexing; previous index preserved");
      }
      check();
      await tx.ragChunk.deleteMany({ where: { sourceType, sourceId } });
      for (let i = 0; i < chunks.length; i++) {
        check();
        const created = await tx.ragChunk.create({ data: { sourceType, sourceId, chunkIndex: i, content: chunks[i], tokenCount: Math.ceil(chunks[i].length / 4), metadata: metadata as Prisma.InputJsonValue | undefined }, select: { id: true } });
        if (vectors[i]) {
          await tx.$executeRaw`UPDATE "RagChunk" SET embedding = ${`[${vectors[i]!.join(",")}]`}::vector WHERE id = ${created.id}`;
        }
      }
      check();
    }, { maxWait: 5_000, timeout: 30_000 });
    this.logger.log(`Indexed ${chunks.length} chunks for ${sourceType}/${sourceId} (embedded=${embedded})`);
    return chunks.length;
  }

  /** Deindex uses the same advisory lock as replacement. Retrieval also checks live state. */
  async removeFromIndex(sourceType: SourceType, sourceId: string): Promise<number> {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sourceType}), hashtext(${sourceId}))`;
      return tx.ragChunk.deleteMany({ where: { sourceType, sourceId } });
    });
    return result.count;
  }

  /** Bounded, single-flight in this process; DB locks also protect multiple instances. */
  async reindexAll(options: { signal?: AbortSignal; semantic?: boolean } = {}): Promise<{ indexed: Record<string, number>; errors: string[] }> {
    if (this.reindexController) throw new ConflictException("A RAG reindex is already running");
    const controller = new AbortController();
    this.reindexController = controller;
    const onAbort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) onAbort();
    const budget = positiveInt(process.env.RAG_REINDEX_MAX_DURATION_MS, 1_800_000, 7_200_000);
    const deadline = Date.now() + budget;
    const timer = setTimeout(() => controller.abort(new Error("RAG reindex execution budget exceeded")), budget);
    let release: (() => Promise<void>) | undefined;
    const semantic = options.semantic ?? process.env.RAG_REINDEX_SEMANTIC_ENABLED === "true";
    const check = () => { if (Date.now() >= deadline) controller.abort(new Error("RAG reindex execution budget exceeded")); throwIfAborted(controller.signal); assertBackgroundCapacity(semantic && this.embeddingService.isEnabled()); };
    const indexed: Record<string, number> = { DOCUMENT: 0, WIKI: 0, PROCEDURE: 0, RUNBOOK: 0, FAQ: 0 };
    const errors: string[] = [];
    try {
      check();
      release = await acquireReindexLease(budget);
      check();
      const sources = [
        { type: "DOCUMENT" as const, model: this.prisma.document, where: { deletedAt: null, scanStatus: "CLEAN", currentVersionId: { not: null } } },
        { type: "WIKI" as const, model: this.prisma.wikiPage, where: { isPublished: true, visibility: "PUBLIC" } },
        { type: "RUNBOOK" as const, model: this.prisma.runbook, where: { isPublished: true } },
      ];
      for (const source of sources) {
        let cursor: string | undefined;
        while (true) {
          check();
          const rows: Array<{ id: string }> = await (source.model.findMany as Function)({ where: source.where, select: { id: true }, take: 10, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}), orderBy: { id: "asc" } });
          if (!rows.length) break;
          cursor = rows[rows.length - 1].id;
          for (const row of rows) {
            check();
            try {
              indexed[source.type] += await this.indexSource(source.type, row.id, "", undefined, { signal: controller.signal, background: true, semantic });
            } catch (err) {
              check();
              const message = `${source.type} ${row.id}: ${(err as Error).message}`;
              this.logger.warn(message);
              // Bound the report, keep the aggregate count in logs.
              if (errors.length < 100) errors.push(message);
            }
          }
        }
      }
      return { indexed, errors };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      this.reindexController = undefined;
      if (release) await release().catch(() => this.logger.warn("RAG lease release failed; lease will expire"));
    }
  }

  onModuleDestroy(): void {
    this.reindexController?.abort(new Error("Backend shutting down"));
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
    return words.filter((w) => w.length >= 3 && !FR_STOP_WORDS.has(w)).slice(0, 8);
  }

  /** Build a ~420-char snippet window centered on the first matching term. */
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
    const start = Math.max(0, bestPos - 180);
    const end = Math.min(content.length, start + 420);
    let snippet = content.slice(start, end).trim();
    if (start > 0) snippet = "…" + snippet;
    if (end < content.length) snippet = snippet + "…";
    return snippet;
  }

  // =========================================================================
  // RBAC helpers (ISO 27001 Annex A.5.15 — pré-filtrage par classification)
  // =========================================================================

  private async getAccessibleDocuments(ctx: RagSearchContext): Promise<Array<{ id: string; currentVersionId: string | null; updatedAt: Date }>> {
    if (!ctx?.userId || !ctx.role) return [];
    try {
      const scope = await documentReaderScope(this.prisma, { id: ctx.userId, role: ctx.role, departmentId: ctx.departmentId });
      return await this.prisma.document.findMany({
        where: { AND: [scope, { scanStatus: "CLEAN", currentVersionId: { not: null } }] },
        select: { id: true, currentVersionId: true, updatedAt: true },
      });
    } catch {
      this.logger.error("rbac.document_ids.failed");
      return [];
    }
  }

  private async getAccessibleDocumentIds(ctx: RagSearchContext): Promise<string[]> {
    return (await this.getAccessibleDocuments(ctx)).map((doc) => doc.id);
  }

  /** Every retrieval path checks live source state and immutable generation provenance. */
  private async applyRbacFilter(candidates: any[], ctx?: RagSearchContext): Promise<any[]> {
    const docs = candidates.some((c) => c.sourceType === "DOCUMENT") && ctx?.userId && ctx.role
      ? await this.getAccessibleDocuments(ctx) : [];
    const currentDocs = new Map(docs.map((d) => [d.id, d]));
    const wikiIds = candidates.filter((c) => c.sourceType === "WIKI").map((c) => c.sourceId);
    const runbookIds = candidates.filter((c) => c.sourceType === "RUNBOOK").map((c) => c.sourceId);
    const [wiki, runbooks] = await Promise.all([
      wikiIds.length ? this.prisma.wikiPage.findMany({ where: { id: { in: wikiIds }, isPublished: true, visibility: "PUBLIC" }, select: { id: true, updatedAt: true } }).catch(() => []) : [],
      runbookIds.length ? this.prisma.runbook.findMany({ where: { id: { in: runbookIds }, isPublished: true }, select: { id: true, updatedAt: true } }).catch(() => []) : [],
    ]);
    const wikiDates = new Map(wiki.map((p) => [p.id, String(p.updatedAt.getTime())]));
    const runbookDates = new Map(runbooks.map((p) => [p.id, String(p.updatedAt.getTime())]));
    return candidates.filter((chunk) => {
      const meta = chunk.metadata;
      if (chunk.sourceType === "DOCUMENT") {
        const doc = currentDocs.get(chunk.sourceId);
        return !!doc?.currentVersionId && meta?.documentVersionId === doc.currentVersionId && meta?.sourceUpdatedAt === String(doc.updatedAt.getTime());
      }
      if (chunk.sourceType === "WIKI") return wikiDates.has(chunk.sourceId) && meta?.sourceUpdatedAt === wikiDates.get(chunk.sourceId);
      if (chunk.sourceType === "RUNBOOK") return runbookDates.has(chunk.sourceId) && meta?.sourceUpdatedAt === runbookDates.get(chunk.sourceId);
      return true;
    });
  }

  private async lexicalSourceFilter(ctx?: RagSearchContext): Promise<Prisma.RagChunkWhereInput> {
    const ids = ctx?.userId && ctx.role ? await this.getAccessibleDocumentIds(ctx) : [];
    return { OR: [{ sourceType: "DOCUMENT", sourceId: { in: ids } }, { sourceType: { not: "DOCUMENT" } }] };
  }

  /**
   * Lexical TF scoring search (fallback when pgvector is unavailable).
   * Tokenizes the query, pre-filters chunks via Prisma `contains`,
   * then scores with TF heuristics.
   * Applique le filtrage RBAC AVANT le scoring (ISO 27001 A.5.15).
   */
  async searchSimilar(query: string, limit = 10, ctx?: RagSearchContext): Promise<RagSource[]> {
    const terms = this.tokenizeQuery(query);
    if (terms.length === 0) return [];

    const ragChunk = this.prisma.ragChunk;

    // Pre-filter: find chunks containing at least one term
    let candidates: any[] = [];
    try {
      candidates = await ragChunk.findMany({
        where: {
          AND: [await this.lexicalSourceFilter(ctx)],
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
    candidates = await this.applyRbacFilter(candidates, ctx);

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
        chunk.metadata && typeof chunk.metadata === "object" && !Array.isArray(chunk.metadata)
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
  async vectorSearch(query: string, limit = 10, ctx?: RagSearchContext): Promise<RagSource[]> {
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

    const threshold = parseFloat(process.env.VECTOR_SIMILARITY_THRESHOLD || "0.5");

    // The shared builder validates identifiers before constructing the SQL clause.
    const accessFilter = await this.buildAccessFilter(ctx) ?? "";

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

      const filtered = await this.applyRbacFilter(results, ctx);
      return filtered.map((r: any) => ({
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

    const makeKey = (s: RagSource) => `${s.sourceType}:${s.sourceId}:${s.snippet.slice(0, 50)}`;

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
  async search(query: string, limit = 10, ctx?: RagSearchContext): Promise<RagSource[]> {
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
      const filtered = await this.applyRbacFilter(hybrid, ctx);
      return filtered.length ? this.toRagSources(filtered, query) : this.searchSimilar(query, limit, ctx);
    }

    // Cas 2 : lexical pur (ou semantic disabled) -> ancien searchSimilar
    if (mode === "lexical" || !this.isSemanticEnabled()) {
      return this.searchSimilar(query, limit, ctx);
    }

    // Cas 3 : vector pur
    if (mode === "vector") {
      const vector = await this.vectorSearch(query, limit, ctx);
      return vector.length ? vector : this.searchSimilar(query, limit, ctx);
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
  private reciprocalRankFusionMulti(lists: RagSource[][], k = 60): RagSource[] {
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
  private async buildAccessFilter(ctx?: RagSearchContext): Promise<string | undefined> {
    const accessibleIds = ctx?.userId && ctx.role ? await this.getAccessibleDocumentIds(ctx) : [];
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safeIds = accessibleIds.filter((id) => UUID_RE.test(id));
    const documentGuard = safeIds.length ? `("sourceType" = 'DOCUMENT' AND "sourceId" IN (${safeIds.map((id) => `'${id}'`).join(",")}) AND EXISTS (
      SELECT 1 FROM "Document" d JOIN "DocumentVersion" v ON v.id = d."currentVersionId" AND v."documentId" = d.id
      WHERE d.id = "RagChunk"."sourceId" AND d."deletedAt" IS NULL AND d."scanStatus" = 'CLEAN'
        AND "RagChunk".metadata->>'documentVersionId' = d."currentVersionId"
        AND "RagChunk".metadata->>'sourceUpdatedAt' = floor(extract(epoch FROM d."updatedAt") * 1000)::bigint::text
    ))` : "FALSE";
    return `AND (${documentGuard}
      OR ("sourceType" = 'WIKI' AND EXISTS (SELECT 1 FROM "WikiPage" w WHERE w.id = "RagChunk"."sourceId" AND w."isPublished" = true AND w.visibility = 'PUBLIC' AND "RagChunk".metadata->>'sourceUpdatedAt' = floor(extract(epoch FROM w."updatedAt") * 1000)::bigint::text))
      OR ("sourceType" = 'RUNBOOK' AND EXISTS (SELECT 1 FROM "Runbook" r WHERE r.id = "RagChunk"."sourceId" AND r."isPublished" = true AND "RagChunk".metadata->>'sourceUpdatedAt' = floor(extract(epoch FROM r."updatedAt") * 1000)::bigint::text))
      OR "sourceType" IN ('PROCEDURE', 'FAQ', 'TICKET'))`;

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
    // Budget global (env OLLAMA_TIMEOUT_MS, défaut 240 s) : l'ancien défaut de
    // 60 s était mathématiquement intenable sur CPU (prompt-eval ~16 tok/s +
    // génération ~5 tok/s → un résumé réaliste demande ~125 s).
    const timeoutMs = getOllamaTimeoutMs();

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
      throw new Error(`Ollama returned ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as { response?: string };
    return data.response?.trim() ?? "";
  }

  /**
   * Stream tokens from Ollama. Yields each token string as it arrives.
   * Uses Ollama's native `stream: true` which emits newline-delimited JSON.
   */
  async *callLlmStream(prompt: string, maxTokens = 500): AsyncGenerator<string> {
    const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
    const model = process.env.OLLAMA_MODEL || "mistral";
    const timeoutMs = parseInt(process.env.OLLAMA_STREAM_TIMEOUT_MS || "120000", 10);

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
      throw new Error(`Ollama returned ${response.status}: ${response.statusText}`);
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
    onStatus?: (status: RagStreamStatus) => void,
  ): Promise<void> {
    const start = Date.now();

    onStatus?.({ stage: "retrieving" });
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

    // P1.8.1.3 : prompt template adapté au modèle actif.
    // Contexte : 4 chunks × 320 chars (enrichi le 2026-07-31 depuis 3×250 pour
    // des réponses plus complètes). Le prompt-eval domine la latence CPU, donc
    // on borne : 4×320 ≈ +130 tokens de contexte (~+5 s au 1er token) contre un
    // gain net de justesse/ancrage. Au-delà, la latence deviendrait sensible.
    const templates = getPromptTemplates(this.llmService.getActiveModel());
    const prompt = templates.rag({
      query: question,
      chunks: sources.slice(0, 4).map((s) => ({
        sourceType: s.sourceType,
        title: s.title,
        snippet: s.snippet.slice(0, 320),
      })),
    });

    if (this.isOllamaEnabled()) {
      try {
        onStatus?.({
          stage: "generating",
          model: this.llmService.getActiveModel(),
        });
        for await (const token of this.llmService.generateStream(prompt, {
          maxTokens: this.getAnswerMaxTokens(),
          timeoutMs: this.getAnswerTimeoutMs(),
          onModelFallback: (model) => onStatus?.({ stage: "model_fallback", model }),
          onQueue: (position) => onStatus?.({ stage: "queued", position }),
        })) {
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
  async answer(question: string, userId: string, ctx?: RagSearchContext): Promise<RagAnswer> {
    const start = Date.now();

    if (!this.isEnabled()) {
      this.logger.warn({ msg: "rag.pipeline.disabled", userId });
      return {
        answer: "Le moteur RAG est désactivé. Contactez un administrateur pour l'activer.",
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
            this.logger.warn(`Failed to update RAG query duration: ${(err as Error).message}`);
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
      .map((s, i) => `[Source ${i + 1} — ${s.sourceType}] ${s.title}\n${s.snippet}`);
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

        // Inférence Ollama en local sur CPU (~8 tok/s). Le défaut historique
        // (500 tokens, timeout 30 s/modèle) ne pouvait JAMAIS aboutir sur le
        // modèle principal : 500 tokens ≈ 60 s > 30 s → timeout → cascade
        // primary→fallback→emergency (jusqu'à ~150 s) → réponse extractive ou
        // perçue comme « le RAG ne répond pas ». On cale donc une réponse plus
        // concise et un budget temps réaliste pour que le modèle principal
        // termine en un seul passage (surchargeable par env pour le tuning).
        const result = await this.llmService.generate(prompt, {
          maxTokens: this.getAnswerMaxTokens(),
          timeoutMs: this.getAnswerTimeoutMs(),
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

  /**
   * Échantillonne le texte pour le résumé afin de couvrir TOUT le document sans
   * dépasser `budget` caractères (le prompt-eval CPU domine la latence). Si le
   * texte tient dans le budget, on le renvoie tel quel. Sinon on prend le début
   * (~50 %, contient objet/portée), le milieu (~25 %) et la fin (~25 %,
   * contient souvent conclusions/annexes) — bien mieux que de tronquer au début.
   */
  private sampleForSummary(text: string, budget: number): string {
    const t = text.trim();
    if (t.length <= budget) return t;
    const head = Math.floor(budget * 0.5);
    const mid = Math.floor(budget * 0.25);
    const tail = budget - head - mid;
    const midStart = Math.floor(t.length / 2 - mid / 2);
    return [
      t.slice(0, head).trim(),
      "\n[…]\n" + t.slice(midStart, midStart + mid).trim(),
      "\n[…]\n" + t.slice(t.length - tail).trim(),
    ].join("");
  }

  /**
   * Cache L2 PERSISTANT (base) du résumé — survit aux redémarrages et partagé
   * entre utilisateurs. Renvoie le résumé si une ligne existe pour ce document
   * ET que son `versionKey` correspond (sinon le doc a changé → périmé).
   */
  private async getPersistedSummary(
    documentId: string,
    versionKey: string,
  ): Promise<{ summary: string } | undefined> {
    try {
      const row = await this.prisma.documentAiSummary.findUnique({ where: { documentId } });
      if (row && row.versionKey === versionKey && row.summary.trim()) {
        return { summary: row.summary };
      }
    } catch {
      // Cache best-effort : une erreur DB ne doit jamais casser le résumé.
    }
    return undefined;
  }

  /** Écrit/actualise le cache L2 (upsert par documentId). Best-effort. */
  private async persistSummary(
    documentId: string,
    versionKey: string,
    summary: string,
    model: string,
  ): Promise<void> {
    if (!summary.trim()) return;
    try {
      await this.prisma.documentAiSummary.upsert({
        where: { documentId },
        create: { documentId, versionKey, summary, model },
        update: { versionKey, summary, model },
      });
    } catch {
      /* best-effort */
    }
  }

  /**
   * Generate an LLM summary of a document.
   *
   * Fix 2026-07 :
   *  - RBAC par classification DANS le service (ISO A.5.15) : la route est
   *    désormais ouverte à tous les rôles authentifiés, un utilisateur ne
   *    peut résumer que ce qu'il a le droit de lire.
   *  - Passe par LlmService.generate (chaîne de fallback + template [INST]
   *    par modèle) au lieu de callLlm brut.
   *  - Entrée ≤ 2000 chars, map-reduce en 2 passes au-delà.
   *  - Cache L1 mémoire + L2 base keyés par checksum de la version courante,
   *    TTL 24 h L1 (invalidation auto quand une nouvelle version est uploadée).
   *  - Les erreurs LLM REMONTENT à l'appelant (le contrôleur renvoie 503) au
   *    lieu d'un 200 { summary: "Erreur…" } qui polluait cache et monitoring.
   */
  async summarizeDocument(
    documentId: string,
    ctx?: RagSearchContext,
  ): Promise<{ summary: string }> {
    if (!ctx?.userId || !ctx.role) throw new ForbiddenException("Un acteur authentifié est requis pour résumer un document");
    // findFirstOrThrow (et non findUniqueOrThrow) pour filtrer les documents
    // soft-supprimés : deletedAt n'est pas une colonne unique. Absent/soft-delete
    // → P2025 → 404 (aligné sur DocumentsService.findById).
    const doc = await this.prisma.document.findFirstOrThrow({
      where: { id: documentId, deletedAt: null },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    // RBAC complet (rôle × statut × classification), aligné sur findById —
    // fail closed. Sans le contrôle de statut, un PRESTATAIRE/COLLABORATEUR
    // pouvait résumer un brouillon (status !== APPROVED) d'autrui via son UUID.
    if (
      doc.scanStatus !== "CLEAN" ||
      !await canReadDocumentWithPermissions(this.prisma, doc, { id: ctx.userId, role: ctx.role, departmentId: ctx.departmentId })
    ) {
      this.logger.warn({
        msg: "rag.summary.rbac_denied",
        documentId,
        userId: ctx.userId,
        role: ctx.role,
        classification: doc.classification,
      });
      throw new ForbiddenException(
        "Accès restreint : la classification de ce document ne permet pas d'en générer un résumé avec vos habilitations.",
      );
    }

    // Clé de cache liée au contenu : checksum de la version courante, ou hash
    // du contenu natif. Une nouvelle version/édition invalide donc le cache.
    const versionKey =
      doc.versions[0]?.checksum ??
      `native:${createHash("sha256")
        .update(doc.content ?? "")
        .digest("hex")
        .slice(0, 16)}`;
    const cacheKey = `doc-summary:${documentId}:${versionKey}`;
    const cached = getCached<{ summary: string }>(cacheKey);
    if (cached) return cached;
    // L2 : cache persistant (base) — survit aux redémarrages, partagé.
    const persisted = await this.getPersistedSummary(documentId, versionKey);
    if (persisted) {
      setCache(cacheKey, persisted, SUMMARY_CACHE_TTL_MS);
      return persisted;
    }

    let text = doc.content ?? "";

    if (!text && doc.versions.length > 0) {
      const latest = doc.versions[0];
      const extracted = await this.textExtractor.extractText(latest.fileUrl, latest.fileType);
      if (extracted) text = extracted;
    }

    if (!text.trim()) {
      return { summary: "Aucun contenu textuel disponible pour ce document." };
    }

    if (!this.isOllamaEnabled()) {
      // Extractive fallback: first 500 chars
      const summary = text.slice(0, 500).trim() + (text.length > 500 ? "…" : "");
      const result = { summary };
      setCache(cacheKey, result, SUMMARY_CACHE_TTL_MS);
      return result;
    }

    const templates = getPromptTemplates(this.llmService.getActiveModel());
    // Budget temps AGRÉGÉ de tout l'appel (bornée sous le timeout client) : le
    // reliquat est passé comme `timeoutMs` à chaque generate(), désormais
    // interprété par LlmService comme un budget global (retries + fallbacks
    // compris) et non plus par tentative.
    const deadline = Date.now() + SUMMARY_TOTAL_BUDGET_MS;
    const remaining = () => deadline - Date.now();
    let summary: string;

    if (text.length <= SUMMARY_INPUT_CHARS) {
      const result = await this.llmService.generate(templates.summary(text), {
        maxTokens: SUMMARY_MAX_TOKENS,
        timeoutMs: Math.max(SUMMARY_MIN_CALL_MS, remaining()),
      });
      summary = result.text;
    } else {
      // Map-reduce en 2 passes : résumés partiels de segments de 2000 chars
      // (max 3 segments), puis résumé final de la concaténation.
      const segments: string[] = [];
      for (
        let i = 0;
        i < text.length && segments.length < SUMMARY_MAX_SEGMENTS;
        i += SUMMARY_INPUT_CHARS
      ) {
        const seg = text.slice(i, i + SUMMARY_INPUT_CHARS).trim();
        if (seg) segments.push(seg);
      }

      const partials: string[] = [];
      for (let s = 0; s < segments.length; s++) {
        // On réserve SUMMARY_REDUCE_RESERVE_MS pour la synthèse finale et on
        // répartit le reste entre les segments map restants. Si le budget est
        // trop maigre, on abandonne la boucle map et on réduit sur les partiels
        // déjà obtenus (voire sur le début du texte) plutôt que d'accumuler des
        // tentatives vouées à l'échec.
        const mapBudget = remaining() - SUMMARY_REDUCE_RESERVE_MS;
        if (mapBudget < SUMMARY_MIN_CALL_MS) break;
        const perSegment = Math.max(
          SUMMARY_MIN_CALL_MS,
          Math.floor(mapBudget / (segments.length - s)),
        );
        const partial = await this.llmService.generate(templates.summary(segments[s]), {
          maxTokens: SUMMARY_SEGMENT_MAX_TOKENS,
          timeoutMs: perSegment,
        });
        if (partial.text.trim()) partials.push(partial.text.trim());
      }

      // Si la passe map n'a rien produit (réponses vides), on retombe sur le
      // début du texte plutôt que d'envoyer un prompt vide à la passe reduce.
      const combined =
        partials.join("\n\n").slice(0, SUMMARY_INPUT_CHARS) || text.slice(0, SUMMARY_INPUT_CHARS);
      const final = await this.llmService.generate(templates.summary(combined), {
        maxTokens: SUMMARY_MAX_TOKENS,
        timeoutMs: Math.max(SUMMARY_MIN_CALL_MS, remaining()),
      });
      summary = final.text;
    }

    const result = { summary };
    setCache(cacheKey, result, SUMMARY_CACHE_TTL_MS);
    void this.persistSummary(documentId, versionKey, summary, this.llmService.getActiveModel());
    return result;
  }

  /**
   * Variante STREAMING du résumé (SSE).
   *
   * Pourquoi : sur CPU l'inférence dure 50 s–2 min ; un résumé bloquant est
   * coupé par le timeout de la passerelle réseau (~30 s) avant d'aboutir. En
   * streaming, les tokens partent au fur et à mesure → la connexion reste
   * active (réarme le read-timeout) et l'utilisateur voit le texte se former.
   *
   * Différence avec `summarizeDocument` : PASSE UNIQUE (pas de map-reduce, qui
   * n'est pas streamable et sous-budgétait chaque segment à ~46 s < un appel
   * de 53 s → auto-coupure). On tronque l'entrée à SUMMARY_STREAM_INPUT_CHARS
   * (fenêtre plus large qu'en bloquant car un seul appel) et on streame.
   *
   * Même RBAC (classification × statut) et même cache (checksum de version)
   * que la version bloquante : un résumé déjà en cache est renvoyé en flux
   * immédiat, et le résultat complet réalimente le cache.
   */
  async summarizeDocumentStream(
    documentId: string,
    ctx: RagSearchContext | undefined,
    onToken: (token: string) => void,
    onStatus?: (status: RagStreamStatus) => void,
  ): Promise<void> {
    if (!ctx?.userId || !ctx.role) throw new ForbiddenException("Un acteur authentifié est requis pour résumer un document");
    onStatus?.({ stage: "retrieving" });

    const doc = await this.prisma.document.findFirstOrThrow({
      where: { id: documentId, deletedAt: null },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    if (
      doc.scanStatus !== "CLEAN" ||
      !await canReadDocumentWithPermissions(this.prisma, doc, { id: ctx.userId, role: ctx.role, departmentId: ctx.departmentId })
    ) {
      this.logger.warn({
        msg: "rag.summary_stream.rbac_denied",
        documentId,
        userId: ctx.userId,
        role: ctx.role,
        classification: doc.classification,
      });
      throw new ForbiddenException(
        "Accès restreint : la classification de ce document ne permet pas d'en générer un résumé avec vos habilitations.",
      );
    }

    const versionKey =
      doc.versions[0]?.checksum ??
      `native:${createHash("sha256")
        .update(doc.content ?? "")
        .digest("hex")
        .slice(0, 16)}`;
    const cacheKey = `doc-summary:${documentId}:${versionKey}`;

    // Cache chaud (L1 mémoire, puis L2 base) → on streame le texte déjà connu
    // (chunks de mots) pour une UX cohérente, sans rappeler le LLM.
    const cached =
      getCached<{ summary: string }>(cacheKey) ??
      (await this.getPersistedSummary(documentId, versionKey));
    if (cached) {
      setCache(cacheKey, cached, SUMMARY_CACHE_TTL_MS);
      onStatus?.({ stage: "generating" });
      for (const chunk of cached.summary.match(/\S+\s*/g) ?? [cached.summary]) {
        onToken(chunk);
      }
      return;
    }

    let text = doc.content ?? "";
    if (!text && doc.versions.length > 0) {
      const latest = doc.versions[0];
      const extracted = await this.textExtractor.extractText(latest.fileUrl, latest.fileType);
      if (extracted) text = extracted;
    }

    if (!text.trim()) {
      onToken("Aucun contenu textuel disponible pour ce document.");
      return;
    }

    if (!this.isOllamaEnabled()) {
      const summary = text.slice(0, 500).trim() + (text.length > 500 ? "…" : "");
      onToken(summary);
      setCache(cacheKey, { summary }, SUMMARY_CACHE_TTL_MS);
      return;
    }

    onStatus?.({ stage: "generating" });
    const templates = getPromptTemplates(this.llmService.getActiveModel());
    // Échantillonnage début+milieu+fin → le résumé couvre tout le document.
    const prompt = templates.summary(this.sampleForSummary(text, SUMMARY_STREAM_INPUT_CHARS));

    let acc = "";
    for await (const token of this.llmService.generateStream(prompt, {
      maxTokens: SUMMARY_MAX_TOKENS,
      timeoutMs: SUMMARY_TOTAL_BUDGET_MS,
      onModelFallback: (model, level) => onStatus?.({ stage: "model_fallback", model, level }),
      onQueue: (position) => onStatus?.({ stage: "queued", position }),
    })) {
      acc += token;
      onToken(token);
    }

    // Ne mettre en cache qu'un résumé réellement produit (une génération vide
    // ne doit pas empoisonner le cache). L1 mémoire + L2 base persistant.
    if (acc.trim()) {
      setCache(cacheKey, { summary: acc.trim() }, SUMMARY_CACHE_TTL_MS);
      void this.persistSummary(
        documentId,
        versionKey,
        acc.trim(),
        this.llmService.getActiveModel(),
      );
    }
  }

  // =========================================================================
  // Ticket response suggestion
  // =========================================================================

  /** Suggest a response for a support ticket using RAG context. */
  async suggestTicketResponse(ticketId: string): Promise<{ suggestion: string }> {
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
  async askAboutArticle(articleId: string, question: string): Promise<{ answer: string }> {
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

    let chunksByType: Array<{ sourceType: string; _count: { id: number } }> = [];
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
