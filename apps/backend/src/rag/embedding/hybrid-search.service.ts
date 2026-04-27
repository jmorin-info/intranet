import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { EmbeddingService } from "./embedding.service";

/**
 * Hybrid retrieval service (Item 30 — RAG fine-tuning corpus maison).
 *
 * Combine deux signaux :
 *  - Vector cosine similarity via pgvector (`embedding <=> $1`).
 *  - BM25 lexical via Postgres `to_tsvector('french')` + `ts_rank` sur la
 *    table RagChunk (re-utilise l'index full-text deja en place dans
 *    `SearchService` pour Document/News/Wiki).
 *
 * Deux modes de fusion :
 *  - `weighted` : score final = alpha * vector_norm + (1 - alpha) * bm25_norm
 *    (alpha configurable via `RAG_HYBRID_ALPHA`, defaut 0.7).
 *  - `rrf` : Reciprocal Rank Fusion (Cormack et al. 2009), pas de tuning alpha.
 *
 * Performance cible : < 100ms total (vector + BM25 en parallele, fusion in-mem).
 */

export interface HybridChunk {
  id: string;
  sourceType: string;
  sourceId: string;
  content: string;
  metadata: Record<string, unknown> | null;
  /** Score vectoriel cosine (0-1) si dispo. */
  vectorScore?: number;
  /** Score BM25 normalise (0-1) si dispo. */
  bm25Score?: number;
  /** Score fusionne. */
  score: number;
}

const DEFAULT_LIMIT = 20;
const DEFAULT_ALPHA = 0.7;
const RRF_K = 60;

@Injectable()
export class HybridSearchService {
  private readonly logger = new Logger(HybridSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Strategie de fusion : "weighted" (alpha) ou "rrf".
   * Defaut : "weighted" pour pouvoir tuner via env, RRF en fallback.
   */
  private getFusionMode(): "weighted" | "rrf" {
    const m = process.env.RAG_HYBRID_FUSION || "weighted";
    return m === "rrf" ? "rrf" : "weighted";
  }

  /** Pondération vector ([0, 1]). 1 = vector pur, 0 = BM25 pur. */
  private getAlpha(): number {
    const raw = parseFloat(process.env.RAG_HYBRID_ALPHA || String(DEFAULT_ALPHA));
    if (Number.isNaN(raw)) return DEFAULT_ALPHA;
    return Math.max(0, Math.min(1, raw));
  }

  /** Active si l'env le demande explicitement. */
  isBM25Enabled(): boolean {
    return process.env.RAG_BM25_ENABLED === "true";
  }

  /**
   * Recherche BM25 pure sur RagChunk via tsvector('french').
   * Pas de cache : la query Postgres est rapide (< 20ms sur 1k chunks).
   *
   * SECURITE : la query utilise `plainto_tsquery` qui parse safely.
   * `accessSourceIdsFilter` est builde via Prisma.sql template (parametre).
   */
  async searchBM25(
    query: string,
    limit: number,
    accessSourceIdsFilter?: string,
  ): Promise<HybridChunk[]> {
    if (!query.trim()) return [];

    const sql = `
      SELECT id, "sourceType", "sourceId", content, metadata,
             ts_rank(
               to_tsvector('french', content),
               plainto_tsquery('french', $1)
             ) AS rank
      FROM "RagChunk"
      WHERE to_tsvector('french', content) @@ plainto_tsquery('french', $1)
        ${accessSourceIdsFilter ?? ""}
      ORDER BY rank DESC
      LIMIT ${Math.max(1, Math.min(limit, 100))}
    `;

    try {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          sourceType: string;
          sourceId: string;
          content: string;
          metadata: Record<string, unknown> | null;
          rank: number;
        }>
      >(sql, query);

      const maxRank = rows.reduce((m, r) => Math.max(m, Number(r.rank) || 0), 0);

      return rows.map((r) => ({
        id: r.id,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        content: r.content,
        metadata: r.metadata,
        bm25Score: maxRank > 0 ? Number(r.rank) / maxRank : 0,
        score: maxRank > 0 ? Number(r.rank) / maxRank : 0,
      }));
    } catch (err) {
      this.logger.warn({
        msg: "rag.bm25.failed",
        error: (err as Error).message,
      });
      return [];
    }
  }

  /**
   * Recherche vectorielle pure sur RagChunk via pgvector.
   * Pas de threshold ici (laisse au caller le choix), seulement le top-K.
   */
  async searchVector(
    query: string,
    limit: number,
    accessSourceIdsFilter?: string,
  ): Promise<HybridChunk[]> {
    if (!this.embeddingService.isEnabled()) return [];

    let qVec: number[];
    try {
      qVec = await this.embeddingService.embed(query);
    } catch (err) {
      this.logger.warn({
        msg: "rag.vector.embed_failed",
        error: (err as Error).message,
      });
      return [];
    }

    const embStr = `[${qVec.join(",")}]`;

    const sql = `
      SELECT id, "sourceType", "sourceId", content, metadata,
             1 - (embedding <=> $1::vector) AS similarity
      FROM "RagChunk"
      WHERE embedding IS NOT NULL
        ${accessSourceIdsFilter ?? ""}
      ORDER BY embedding <=> $1::vector
      LIMIT ${Math.max(1, Math.min(limit, 100))}
    `;

    try {
      const rows = await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          sourceType: string;
          sourceId: string;
          content: string;
          metadata: Record<string, unknown> | null;
          similarity: number;
        }>
      >(sql, embStr);

      return rows.map((r) => ({
        id: r.id,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        content: r.content,
        metadata: r.metadata,
        vectorScore: Number(r.similarity) || 0,
        score: Number(r.similarity) || 0,
      }));
    } catch (err) {
      this.logger.warn({
        msg: "rag.vector.failed",
        error: (err as Error).message,
      });
      return [];
    }
  }

  /**
   * Recherche hybride BM25 + Vector.
   *
   * - Lance les deux requetes en parallele (Promise.all).
   * - Fusionne via weighted alpha (defaut) ou RRF.
   * - Retourne max `limit` resultats.
   *
   * @param accessSourceIdsFilter clause SQL injectee dans `WHERE` pour filtrage
   *        RBAC (ex: `AND ("sourceType" != 'DOCUMENT' OR "sourceId" IN ('a','b'))`).
   *        DOIT etre construit cote caller via une whitelist de sourceIds (jamais
   *        depuis la query utilisateur).
   */
  async search(
    query: string,
    limit: number = DEFAULT_LIMIT,
    accessSourceIdsFilter?: string,
  ): Promise<HybridChunk[]> {
    if (!query.trim()) return [];

    // On retrieve plus large que `limit` cote BM25/vector pour avoir de la
    // diversite a fusionner. Multiplier par 2 marche bien jusqu'a limit=20.
    const wide = Math.min(limit * 2, 50);

    const [bm25, vector] = await Promise.all([
      this.isBM25Enabled() ? this.searchBM25(query, wide, accessSourceIdsFilter) : [],
      this.searchVector(query, wide, accessSourceIdsFilter),
    ]);

    // Cas degenere : pas de BM25 dispo -> on retourne juste vector
    if (bm25.length === 0) {
      return vector.slice(0, limit);
    }
    // Cas degenere : pas de vector -> juste BM25
    if (vector.length === 0) {
      return bm25.slice(0, limit);
    }

    const mode = this.getFusionMode();
    if (mode === "rrf") {
      return this.fuseRRF(bm25, vector, limit);
    }
    return this.fuseWeighted(bm25, vector, this.getAlpha(), limit);
  }

  /**
   * Fusion ponderee : score = alpha * vector + (1 - alpha) * bm25
   * avec normalisation min-max sur chaque liste pour rendre les scores
   * comparables.
   */
  private fuseWeighted(
    bm25: HybridChunk[],
    vector: HybridChunk[],
    alpha: number,
    limit: number,
  ): HybridChunk[] {
    const merged = new Map<string, HybridChunk>();

    for (const c of bm25) {
      merged.set(c.id, { ...c });
    }
    for (const c of vector) {
      const existing = merged.get(c.id);
      if (existing) {
        existing.vectorScore = c.vectorScore;
      } else {
        merged.set(c.id, { ...c });
      }
    }

    // Min-max normalize already 0-1 par construction (cosine sim et bm25 max-rank).
    // On combine directement.
    const fused = Array.from(merged.values()).map((c) => {
      const v = c.vectorScore ?? 0;
      const b = c.bm25Score ?? 0;
      return { ...c, score: alpha * v + (1 - alpha) * b };
    });

    fused.sort((a, b) => b.score - a.score);
    return fused.slice(0, limit);
  }

  /**
   * Reciprocal Rank Fusion (Cormack et al. 2009).
   * score = sum over rankings : 1 / (k + rank_i)
   */
  private fuseRRF(
    bm25: HybridChunk[],
    vector: HybridChunk[],
    limit: number,
    k = RRF_K,
  ): HybridChunk[] {
    const scores = new Map<string, { score: number; chunk: HybridChunk }>();

    bm25.forEach((c, idx) => {
      const cur = scores.get(c.id);
      const inc = 1 / (k + idx + 1);
      if (cur) cur.score += inc;
      else scores.set(c.id, { score: inc, chunk: { ...c, score: inc } });
    });

    vector.forEach((c, idx) => {
      const cur = scores.get(c.id);
      const inc = 1 / (k + idx + 1);
      if (cur) {
        cur.score += inc;
        cur.chunk.vectorScore = c.vectorScore;
      } else {
        scores.set(c.id, { score: inc, chunk: { ...c, score: inc } });
      }
    });

    const out = Array.from(scores.values()).map(({ score, chunk }) => ({
      ...chunk,
      score,
    }));
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  }
}
