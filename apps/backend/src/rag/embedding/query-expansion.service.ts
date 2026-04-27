import { Injectable, Logger, Optional } from "@nestjs/common";
import { createHash } from "crypto";
import { CacheService } from "../../common/cache/cache.service";
import { LlmService } from "../llm/llm.service";

/**
 * Query expansion service (Item 30 — RAG fine-tuning corpus maison).
 *
 * Avant le retrieval, demande au LLM local de generer N reformulations de la
 * query utilisateur. On execute ensuite le retrieval pour la query originale
 * + chaque reformulation, puis on fusionne les top-K (RRF cote retrieval).
 *
 * Pourquoi : robustesse aux variations lexicales et stylistiques. Un user qui
 * ecrit "comment partir de la boite" et un autre "procedure de depart d'un
 * collaborateur" doivent matcher la meme procedure RH. L'expansion comble
 * l'ecart entre vocabulaire utilisateur et vocabulaire corpus.
 *
 * Cache Redis : key = sha256(model:N:query), TTL 1h. Gain a chaque cache hit
 * (~30-50% des queries en prod sont redondantes apres normalisation).
 *
 * Activation : `RAG_QUERY_EXPANSION_ENABLED=true`
 *
 * Cout : 1 appel LLM (~2-5s sur Mistral CPU). Acceptable une fois par query
 * unique grace au cache. Si LLM down -> fallback vers la query originale
 * uniquement (best-effort, non bloquant).
 */

const DEFAULT_N = 3;
const DEFAULT_CACHE_TTL_SEC = 3600;
const DEFAULT_MAX_QUERY_CHARS = 500;

@Injectable()
export class QueryExpansionService {
  private readonly logger = new Logger(QueryExpansionService.name);
  private readonly metrics = {
    callsTotal: 0,
    callsFailed: 0,
    cacheHits: 0,
    cacheMisses: 0,
    totalLatencyMs: 0,
  };

  constructor(
    private readonly llmService: LlmService,
    @Optional() private readonly cache?: CacheService,
  ) {}

  isEnabled(): boolean {
    return process.env.RAG_QUERY_EXPANSION_ENABLED === "true";
  }

  /** N reformulations a generer (en plus de la query originale). */
  getN(): number {
    const raw = parseInt(
      process.env.RAG_QUERY_EXPANSION_N || String(DEFAULT_N),
      10,
    );
    if (Number.isNaN(raw)) return DEFAULT_N;
    return Math.max(1, Math.min(10, raw));
  }

  /**
   * Genere `N` reformulations de la query. Retourne un tableau qui inclut
   * TOUJOURS la query originale en premier (pour que les callers puissent
   * faire un seul `for ... of` sans cas particulier).
   *
   * Si la feature est off, ou si le LLM est down, retourne `[query]`.
   */
  async expand(query: string): Promise<string[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    if (!this.isEnabled()) return [trimmed];

    // Garde-fou : queries enormes (paste accidentel) -> on n'expand pas
    if (trimmed.length > DEFAULT_MAX_QUERY_CHARS) {
      return [trimmed];
    }

    const n = this.getN();
    const cacheKey = this.makeCacheKey(trimmed, n);

    // 1. Check Redis cache
    if (this.cache) {
      try {
        const cached = await this.cache.get<string[]>(cacheKey);
        if (cached && Array.isArray(cached) && cached.length > 0) {
          this.metrics.cacheHits++;
          return cached;
        }
        this.metrics.cacheMisses++;
      } catch (err) {
        // Best-effort : on continue sans cache si Redis down
        this.logger.debug({
          msg: "rag.query_expansion.cache_get_failed",
          error: (err as Error).message,
        });
      }
    }

    // 2. Generate via LLM
    const start = Date.now();
    this.metrics.callsTotal++;

    let expansions: string[];
    try {
      expansions = await this.callLlm(trimmed, n);
    } catch (err) {
      this.metrics.callsFailed++;
      this.logger.warn({
        msg: "rag.query_expansion.llm_failed",
        error: (err as Error).message,
      });
      // Fallback : pas d'expansion, on retourne la query originale
      return [trimmed];
    }

    // Toujours en premier la query originale, suivie des reformulations
    // dedupliquees (lower-case match) pour eviter les doublons.
    const seen = new Set<string>([trimmed.toLowerCase()]);
    const result: string[] = [trimmed];
    for (const exp of expansions) {
      const norm = exp.trim();
      if (!norm) continue;
      const key = norm.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(norm);
    }

    const latency = Date.now() - start;
    this.metrics.totalLatencyMs += latency;

    // 3. Store in cache (fire-and-forget)
    if (this.cache && result.length > 1) {
      void this.cache.set(cacheKey, result, DEFAULT_CACHE_TTL_SEC);
    }

    this.logger.log({
      msg: "rag.query_expansion.done",
      original: trimmed.slice(0, 80),
      nGenerated: result.length - 1,
      latencyMs: latency,
    });

    return result;
  }

  /**
   * Appel LLM pour generer les reformulations. Le prompt force une sortie
   * structuree (1 reformulation par ligne, sans numerotation) qu'on parse.
   *
   * Note : on garde la temperature a 0.4 pour avoir un peu de diversite mais
   * eviter les reformulations trop creatives qui derivent du sens.
   */
  private async callLlm(query: string, n: number): Promise<string[]> {
    const prompt = this.buildPrompt(query, n);
    const result = await this.llmService.generate(prompt, {
      maxTokens: 200,
      temperature: 0.4,
    });
    return this.parseLlmOutput(result.text, n);
  }

  /** Prompt FR pour Mistral / phi3 / qwen — pas de format-specific car generique. */
  private buildPrompt(query: string, n: number): string {
    return `Tu es un assistant qui aide a ameliorer la recherche documentaire interne. Genere ${n} reformulations differentes de la question suivante. Chaque reformulation doit conserver le sens initial mais utiliser un vocabulaire ou une structure legerement differents (synonymes, formulations alternatives).

Question originale : ${query}

Reponds UNIQUEMENT avec ${n} lignes, une reformulation par ligne, sans numerotation, sans tirets, sans explication.`;
  }

  /**
   * Parse l'output LLM : on split sur les newlines, on nettoie chaque ligne
   * (supprime numerotation eventuelle, tirets, guillemets), et on garde
   * jusqu'a `maxN` reformulations non vides.
   */
  private parseLlmOutput(text: string, maxN: number): string[] {
    if (!text) return [];
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const cleaned: string[] = [];
    for (const line of lines) {
      let s = line;
      // Strip numerotation type "1.", "1)", "(1)"
      s = s.replace(/^\s*[(]?\d+[).]?\s*/, "");
      // Strip tirets en debut de ligne
      s = s.replace(/^[-*•]\s+/, "");
      // Strip guillemets autour
      s = s.replace(/^["'""]/, "").replace(/["'""]$/, "");
      // Pas trop court (eviter les artefacts type "OK", "Voici :")
      if (s.length < 4) continue;
      cleaned.push(s.trim());
      if (cleaned.length >= maxN) break;
    }
    return cleaned;
  }

  /** Cache key : SHA-256(model:n:query) */
  private makeCacheKey(query: string, n: number): string {
    const model = this.llmService.getActiveModel();
    const hash = createHash("sha256")
      .update(`${model}:${n}:${query}`)
      .digest("hex");
    return `rag:query-expansion:${hash}`;
  }

  /** Metriques internes (utilise par /rag/stats). */
  getMetrics() {
    const avg =
      this.metrics.callsTotal > 0
        ? Math.round(this.metrics.totalLatencyMs / this.metrics.callsTotal)
        : 0;
    return {
      enabled: this.isEnabled(),
      n: this.getN(),
      callsTotal: this.metrics.callsTotal,
      callsFailed: this.metrics.callsFailed,
      cacheHits: this.metrics.cacheHits,
      cacheMisses: this.metrics.cacheMisses,
      avgLatencyMs: avg,
    };
  }
}
