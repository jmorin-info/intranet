import { Injectable, Logger } from "@nestjs/common";

/**
 * Cross-encoder reranker service (Item 30 — RAG fine-tuning corpus maison).
 *
 * Reordonne une liste de candidats issus du retrieval initial (vector / BM25 /
 * RRF) par pertinence query <-> passage en utilisant un modele cross-encoder
 * type `bge-reranker-v2-m3` heberge dans Ollama (souverainete des donnees).
 *
 * Pourquoi : un cross-encoder voit la query ET le passage en meme temps,
 * contrairement a un bi-encoder (embeddings) qui les encode separement. Il
 * capture mieux les relations fines (negation, polysemie, ordering). Le cout
 * supplementaire est compense en limitant l'appel au top-K candidats (K=20).
 *
 * Performance cible : < 200ms pour 20 documents (CPU only, modele 568M params).
 *
 * Activation : `RAG_RERANKER_ENABLED=true` + `ollama pull bge-reranker-v2-m3`
 *
 * Fallback : si Ollama est down ou que le modele n'est pas dispo, on retourne
 * la liste d'entree inchangee (best-effort, non bloquant).
 */

export interface RerankCandidate {
  id: string;
  content: string;
  /** Score initial pre-rerank, conserve pour observabilite et fallback. */
  initialScore?: number;
}

export interface RerankResult<T extends RerankCandidate> {
  candidate: T;
  /** Score cross-encoder (typiquement [0, 1]) ou initialScore en cas de fallback. */
  rerankScore: number;
  /** Position avant rerank (0-indexe) — utile pour metriques delta. */
  initialRank: number;
  /** Position apres rerank (0-indexe). */
  rerankedRank: number;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_TOP_K = 20;
const DEFAULT_TOP_N = 5;

@Injectable()
export class RerankerService {
  private readonly logger = new Logger(RerankerService.name);
  private readonly metrics = {
    callsTotal: 0,
    callsFailed: 0,
    totalLatencyMs: 0,
  };

  /** Active uniquement si la feature flag est explicitement a true. */
  isEnabled(): boolean {
    return process.env.RAG_RERANKER_ENABLED === "true";
  }

  /** Modele Ollama du cross-encoder. */
  getModel(): string {
    return process.env.OLLAMA_RERANKER_MODEL || "bge-reranker-v2-m3";
  }

  /** Top-K candidats consideres avant rerank. */
  getTopK(): number {
    return parseInt(process.env.RAG_RERANKER_TOP_K || String(DEFAULT_TOP_K), 10);
  }

  /** Top-N retournes apres rerank. */
  getTopN(): number {
    return parseInt(process.env.RAG_RERANKER_TOP_N || String(DEFAULT_TOP_N), 10);
  }

  /**
   * Reordonne `candidates` par pertinence cross-encoder.
   *
   * @param query   Query utilisateur (apres expansion eventuelle).
   * @param candidates Liste candidats (top-K issus du retrieval initial).
   * @param topN    Nombre max de candidats a retourner (defaut: getTopN()).
   * @returns Liste triee desc par rerankScore, max `topN` elements.
   */
  async rerank<T extends RerankCandidate>(
    query: string,
    candidates: T[],
    topN?: number,
  ): Promise<RerankResult<T>[]> {
    if (candidates.length === 0) return [];

    const limit = topN ?? this.getTopN();

    // Si feature off ou query vide -> passthrough (preserve l'ordre initial)
    if (!this.isEnabled() || !query.trim()) {
      return candidates.slice(0, limit).map((c, idx) => ({
        candidate: c,
        rerankScore: c.initialScore ?? 1 / (idx + 1),
        initialRank: idx,
        rerankedRank: idx,
      }));
    }

    const start = Date.now();
    this.metrics.callsTotal++;

    let scores: number[];
    try {
      scores = await this.scorePairs(query, candidates.map((c) => c.content));
    } catch (err) {
      this.metrics.callsFailed++;
      this.logger.warn({
        msg: "rag.reranker.failed",
        model: this.getModel(),
        nCandidates: candidates.length,
        error: (err as Error).message,
      });
      // Fallback : pas de rerank, on conserve l'ordre du retrieval initial
      return candidates.slice(0, limit).map((c, idx) => ({
        candidate: c,
        rerankScore: c.initialScore ?? 1 / (idx + 1),
        initialRank: idx,
        rerankedRank: idx,
      }));
    }

    const indexed = candidates.map((c, idx) => ({
      candidate: c,
      score: scores[idx] ?? -Infinity,
      initialRank: idx,
    }));

    indexed.sort((a, b) => b.score - a.score);

    const reranked: RerankResult<T>[] = indexed.slice(0, limit).map((item, newIdx) => ({
      candidate: item.candidate,
      rerankScore: item.score,
      initialRank: item.initialRank,
      rerankedRank: newIdx,
    }));

    const latency = Date.now() - start;
    this.metrics.totalLatencyMs += latency;

    this.logger.log({
      msg: "rag.reranker.done",
      model: this.getModel(),
      nCandidates: candidates.length,
      nReturned: reranked.length,
      latencyMs: latency,
    });

    return reranked;
  }

  /**
   * Appel Ollama pour scorer une liste de paires (query, passage).
   *
   * Format `bge-reranker-v2-m3` : on envoie un prompt formate et on recupere
   * le logit / score de pertinence. Comme Ollama ne supporte pas nativement
   * les cross-encoders rerank API, on utilise l'endpoint `/api/embeddings`
   * en concatenant query + passage et en mesurant la norme de l'embedding,
   * ou bien on utilise un endpoint custom si disponible.
   *
   * Implementation v1 : on tente l'endpoint `/api/rerank` (custom Ollama
   * extension), avec fallback vers un scoring base sur la similarite cosine
   * de l'embedding concatene (proxy raisonnable pour ce modele).
   *
   * Note : si on bascule sur une infra HuggingFace/TEI plus tard, il suffira
   * de remplacer cette methode (le rerank service public reste stable).
   */
  private async scorePairs(query: string, passages: string[]): Promise<number[]> {
    const url = `${process.env.OLLAMA_URL || "http://localhost:11434"}/api/rerank`;
    const model = this.getModel();
    const timeoutMs = parseInt(
      process.env.RAG_RERANKER_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS),
      10,
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          query,
          documents: passages,
        }),
        signal: controller.signal as AbortSignal,
      });

      // Si endpoint /api/rerank inexistant (404) -> fallback embedding-based
      if (response.status === 404) {
        return this.scoreViaEmbeddings(query, passages);
      }

      if (!response.ok) {
        throw new Error(`Rerank ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as {
        scores?: number[];
        results?: Array<{ index: number; score: number }>;
      };

      // Format possible : { scores: [...] } ou { results: [{index, score}, ...] }
      if (Array.isArray(data.scores) && data.scores.length === passages.length) {
        return data.scores;
      }

      if (Array.isArray(data.results)) {
        const out = new Array<number>(passages.length).fill(0);
        for (const r of data.results) {
          if (typeof r.index === "number" && r.index >= 0 && r.index < passages.length) {
            out[r.index] = r.score;
          }
        }
        return out;
      }

      // Reponse inattendue : fallback embeddings
      return this.scoreViaEmbeddings(query, passages);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fallback rerank via embeddings (pas un vrai cross-encoder, mais > random) :
   * embed la query une fois, embed chaque passage, calcule la cosine.
   * Acceptable comme fallback degrade tant que `/api/rerank` n'est pas dispo.
   */
  private async scoreViaEmbeddings(query: string, passages: string[]): Promise<number[]> {
    const url = `${process.env.OLLAMA_URL || "http://localhost:11434"}/api/embeddings`;
    const model = process.env.OLLAMA_EMBEDDING_MODEL || "bge-m3";

    const embed = async (text: string): Promise<number[]> => {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: text }),
      });
      if (!r.ok) throw new Error(`Embed ${r.status}`);
      const d = (await r.json()) as { embedding?: number[] };
      if (!Array.isArray(d.embedding)) throw new Error("no embedding");
      return d.embedding;
    };

    const cosine = (a: number[], b: number[]): number => {
      let dot = 0, na = 0, nb = 0;
      const len = Math.min(a.length, b.length);
      for (let i = 0; i < len; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
      }
      const denom = Math.sqrt(na) * Math.sqrt(nb);
      return denom > 0 ? dot / denom : 0;
    };

    const qVec = await embed(query);
    const scores: number[] = [];
    // Sequentiel pour eviter de saturer Ollama (CPU). Avec 20 passages, ca tient
    // largement dans le budget < 200ms si bge-m3 est warm.
    for (const p of passages) {
      try {
        const pVec = await embed(p);
        scores.push(cosine(qVec, pVec));
      } catch {
        scores.push(0);
      }
    }
    return scores;
  }

  /** Metriques internes pour observabilite (`/rag/stats`). */
  getMetrics() {
    const avg =
      this.metrics.callsTotal > 0
        ? Math.round(this.metrics.totalLatencyMs / this.metrics.callsTotal)
        : 0;
    return {
      enabled: this.isEnabled(),
      model: this.getModel(),
      callsTotal: this.metrics.callsTotal,
      callsFailed: this.metrics.callsFailed,
      avgLatencyMs: avg,
    };
  }
}
