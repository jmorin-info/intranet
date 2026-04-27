import { Injectable, Logger } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { RagService, RagSearchContext } from "../rag.service";
import { LlmService } from "../llm/llm.service";
import { RerankerService } from "../embedding/reranker.service";
import { QueryExpansionService } from "../embedding/query-expansion.service";
import { HybridSearchService } from "../embedding/hybrid-search.service";

/**
 * RAG evaluation service (Item 30 — admin POST /rag/eval).
 *
 * Execute le golden dataset contre le pipeline actuel et calcule :
 *  - recall@5  : proportion de queries dont au moins un chunk attendu
 *                (matche par sourceType + keyword) figure dans le top-5
 *  - MRR       : Mean Reciprocal Rank du premier chunk pertinent
 *  - termCoverage : proportion moyenne de keywords attendus presents dans
 *                les snippets retournes
 *  - faithfulness (optional) : LLM-judge — note 0..1 sur la fidelite de la
 *                reponse generee aux sources, en comparaison du groundTruth
 *  - latence p50/p95
 *
 * Persistance dans `RagBenchmarkRun` (Prisma) pour suivi historique.
 *
 * Securite : reserve aux ADMIN/SUPER_ADMIN cote controller. Pas de PII dans
 * les benchmarks (le golden dataset est curate manuellement).
 */

export interface GoldenExample {
  id: string;
  question: string;
  expectedKeywords: string[];
  expectedSourceTypes?: string[];
  groundTruthAnswer?: string;
}

export interface GoldenDataset {
  version: string;
  createdAt: string;
  description: string;
  examples: GoldenExample[];
}

export interface EvalQueryResult {
  id: string;
  question: string;
  recallHit: boolean;
  reciprocalRank: number;
  termCoverage: number;
  faithfulness?: number;
  latencyMs: number;
  topSourceTypes: string[];
  topScore: number;
}

export interface EvalRunResult {
  datasetVersion: string;
  mode: string;
  numQueries: number;
  numChunks: number;
  recall5: number;
  mrr: number;
  termCoverage: number;
  faithfulness?: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  perQuery: EvalQueryResult[];
  config: Record<string, unknown>;
  notes?: string;
  storedRunId?: string;
}

const DEFAULT_DATASET_PATH = path.resolve(
  __dirname,
  "golden-dataset.json",
);

@Injectable()
export class RagEvalService {
  private readonly logger = new Logger(RagEvalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ragService: RagService,
    private readonly llmService: LlmService,
    private readonly reranker: RerankerService,
    private readonly queryExpansion: QueryExpansionService,
    private readonly hybridSearch: HybridSearchService,
  ) {}

  /**
   * Charge le dataset golden depuis le filesystem. Permet de fournir un path
   * custom (tests / multiples versions).
   */
  loadDataset(datasetPath: string = DEFAULT_DATASET_PATH): GoldenDataset {
    const raw = fs.readFileSync(datasetPath, "utf8");
    const parsed = JSON.parse(raw) as GoldenDataset;
    if (!parsed.version || !Array.isArray(parsed.examples)) {
      throw new Error(`Invalid golden dataset at ${datasetPath}`);
    }
    return parsed;
  }

  /**
   * Run le benchmark complet et persiste le resultat dans RagBenchmarkRun.
   *
   * @param options.datasetPath  override du path golden (defaut : bundled)
   * @param options.mode         label libre du mode evalue (ex: "vector",
   *                             "hybrid_alpha_0.7", "rerank_on", ...)
   * @param options.adminCtx     contexte RBAC pour le retrieval (admin =
   *                             accees ALL pour eval realiste)
   * @param options.evalFaithfulness   active le LLM-judge (couteux, ~10s/query)
   * @param options.persist      true = stocke dans RagBenchmarkRun
   * @param options.notes        notes humaines stockees dans le run
   */
  async runEval(options: {
    datasetPath?: string;
    mode?: string;
    adminCtx?: RagSearchContext;
    evalFaithfulness?: boolean;
    persist?: boolean;
    notes?: string;
  } = {}): Promise<EvalRunResult> {
    const dataset = this.loadDataset(options.datasetPath);
    const mode = options.mode || this.inferModeLabel();
    const evalFaithfulness = options.evalFaithfulness ?? false;
    const persist = options.persist ?? true;

    const config = this.collectConfigSnapshot();
    const numChunks = await this.countChunks();

    this.logger.log({
      msg: "rag.eval.run.start",
      datasetVersion: dataset.version,
      numExamples: dataset.examples.length,
      mode,
      evalFaithfulness,
    });

    const perQuery: EvalQueryResult[] = [];
    const latencies: number[] = [];

    for (const ex of dataset.examples) {
      const start = Date.now();
      try {
        // On utilise un fake-admin context pour avoir RBAC ALL (eval realiste
        // sur le corpus complet). En prod, l'eval est lancee par un admin.
        const sources = await this.ragService.search(
          ex.question,
          5,
          options.adminCtx,
        );
        const latency = Date.now() - start;
        latencies.push(latency);

        const recallHit = this.checkRecall(sources, ex);
        const rr = this.reciprocalRank(sources, ex);
        const tc = this.termCoverage(sources, ex);
        let faithfulness: number | undefined;
        if (evalFaithfulness && sources.length > 0) {
          faithfulness = await this.evalFaithfulnessLlm(ex, sources).catch(
            (err) => {
              this.logger.warn({
                msg: "rag.eval.faithfulness_failed",
                queryId: ex.id,
                error: (err as Error).message,
              });
              return undefined;
            },
          );
        }

        perQuery.push({
          id: ex.id,
          question: ex.question,
          recallHit,
          reciprocalRank: rr,
          termCoverage: tc,
          faithfulness,
          latencyMs: latency,
          topSourceTypes: sources.slice(0, 3).map((s) => s.sourceType),
          topScore: sources.length > 0 ? sources[0].score : 0,
        });
      } catch (err) {
        this.logger.warn({
          msg: "rag.eval.query_failed",
          queryId: ex.id,
          error: (err as Error).message,
        });
        latencies.push(Date.now() - start);
        perQuery.push({
          id: ex.id,
          question: ex.question,
          recallHit: false,
          reciprocalRank: 0,
          termCoverage: 0,
          faithfulness: undefined,
          latencyMs: Date.now() - start,
          topSourceTypes: [],
          topScore: 0,
        });
      }
    }

    const recall5 = this.mean(perQuery.map((q) => (q.recallHit ? 1 : 0)));
    const mrr = this.mean(perQuery.map((q) => q.reciprocalRank));
    const tcAvg = this.mean(perQuery.map((q) => q.termCoverage));
    const faithAvg = evalFaithfulness
      ? this.mean(
          perQuery
            .map((q) => q.faithfulness)
            .filter((v): v is number => v !== undefined),
        )
      : undefined;

    const result: EvalRunResult = {
      datasetVersion: dataset.version,
      mode,
      numQueries: perQuery.length,
      numChunks,
      recall5,
      mrr,
      termCoverage: tcAvg,
      faithfulness: faithAvg,
      latencyP50Ms: this.percentile(latencies, 50),
      latencyP95Ms: this.percentile(latencies, 95),
      perQuery,
      config,
      notes: options.notes,
    };

    if (persist) {
      try {
        const stored = await this.prisma.ragBenchmarkRun.create({
          data: {
            datasetVersion: result.datasetVersion,
            mode: result.mode,
            recall5: result.recall5,
            mrr: result.mrr,
            faithfulness: result.faithfulness,
            termCoverage: result.termCoverage,
            latencyP50Ms: result.latencyP50Ms,
            latencyP95Ms: result.latencyP95Ms,
            numQueries: result.numQueries,
            numChunks: result.numChunks,
            config: result.config as unknown as Prisma.InputJsonValue,
            notes: result.notes,
          },
        });
        result.storedRunId = stored.id;
      } catch (err) {
        this.logger.warn({
          msg: "rag.eval.persist_failed",
          error: (err as Error).message,
        });
      }
    }

    this.logger.log({
      msg: "rag.eval.run.done",
      datasetVersion: result.datasetVersion,
      mode: result.mode,
      recall5: result.recall5.toFixed(3),
      mrr: result.mrr.toFixed(3),
      termCoverage: result.termCoverage.toFixed(3),
      faithfulness: result.faithfulness?.toFixed(3),
      p50: result.latencyP50Ms,
      p95: result.latencyP95Ms,
    });

    return result;
  }

  // ---------- Metriques ----------

  /**
   * Recall@5 hit : un chunk du top-5 matche au moins UN keyword attendu
   * (lower-case, NFD-normalized) ET (si specifie) un sourceType attendu.
   */
  private checkRecall(
    sources: Array<{ sourceType: string; snippet: string; title?: string }>,
    ex: GoldenExample,
  ): boolean {
    if (sources.length === 0) return false;
    const top5 = sources.slice(0, 5);

    const expectedTypes = ex.expectedSourceTypes
      ? new Set(ex.expectedSourceTypes.map((t) => t.toUpperCase()))
      : null;

    return top5.some((s) => {
      const text = this.norm(`${s.title ?? ""} ${s.snippet}`);
      const keywordHit = ex.expectedKeywords.some((kw) =>
        text.includes(this.norm(kw)),
      );
      if (!keywordHit) return false;
      if (!expectedTypes) return true;
      return expectedTypes.has(s.sourceType.toUpperCase());
    });
  }

  /** Reciprocal Rank du premier chunk pertinent (1/rank, 0 si aucun). */
  private reciprocalRank(
    sources: Array<{ sourceType: string; snippet: string; title?: string }>,
    ex: GoldenExample,
  ): number {
    const expectedTypes = ex.expectedSourceTypes
      ? new Set(ex.expectedSourceTypes.map((t) => t.toUpperCase()))
      : null;

    for (let i = 0; i < sources.length; i++) {
      const s = sources[i];
      const text = this.norm(`${s.title ?? ""} ${s.snippet}`);
      const keywordHit = ex.expectedKeywords.some((kw) =>
        text.includes(this.norm(kw)),
      );
      if (!keywordHit) continue;
      if (expectedTypes && !expectedTypes.has(s.sourceType.toUpperCase()))
        continue;
      return 1 / (i + 1);
    }
    return 0;
  }

  /**
   * Term coverage : proportion des keywords attendus qui apparaissent dans
   * au moins un snippet du top-5. 0..1.
   */
  private termCoverage(
    sources: Array<{ snippet: string; title?: string }>,
    ex: GoldenExample,
  ): number {
    if (ex.expectedKeywords.length === 0) return 1;
    const text = this.norm(
      sources
        .slice(0, 5)
        .map((s) => `${s.title ?? ""} ${s.snippet}`)
        .join(" "),
    );
    let hits = 0;
    for (const kw of ex.expectedKeywords) {
      if (text.includes(this.norm(kw))) hits++;
    }
    return hits / ex.expectedKeywords.length;
  }

  /**
   * LLM-as-judge : on demande au LLM si la "reponse synthetisable a partir des
   * sources" est fidele a la groundTruthAnswer. Note 0..1 (parsing simple).
   *
   * Cout : 1 appel LLM / query, ~5-10s. Active uniquement quand demande
   * explicitement (option `evalFaithfulness=true`).
   */
  private async evalFaithfulnessLlm(
    ex: GoldenExample,
    sources: Array<{ snippet: string; title?: string }>,
  ): Promise<number> {
    if (!ex.groundTruthAnswer) return 0;
    const context = sources
      .slice(0, 3)
      .map((s, i) => `[${i + 1}] ${s.title ?? ""}\n${s.snippet}`)
      .join("\n\n");
    const prompt = `Tu es un evaluateur. Note de 0 a 10 la fidelite des sources retrouvees a la reponse de reference. Reponds UNIQUEMENT par un entier 0..10.

Question : ${ex.question}
Reponse de reference : ${ex.groundTruthAnswer}
Sources retrouvees :
${context}

Note (0-10) :`;
    const r = await this.llmService.generate(prompt, {
      maxTokens: 6,
      temperature: 0.1,
    });
    const m = r.text.match(/(\d+)/);
    if (!m) return 0;
    const n = parseInt(m[1], 10);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(10, n)) / 10;
  }

  // ---------- Helpers ----------

  private mean(xs: number[]): number {
    if (xs.length === 0) return 0;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  }

  private percentile(xs: number[], p: number): number {
    if (xs.length === 0) return 0;
    const sorted = [...xs].sort((a, b) => a - b);
    const idx = Math.min(
      sorted.length - 1,
      Math.ceil((p / 100) * sorted.length) - 1,
    );
    return sorted[Math.max(0, idx)];
  }

  /** NFD lower + accent strip. */
  private norm(s: string): string {
    return s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  }

  private async countChunks(): Promise<number> {
    try {
      return await this.prisma.ragChunk.count();
    } catch {
      return 0;
    }
  }

  /** Snapshot config sterilisee — pas de secrets, juste les flags pertinents. */
  private collectConfigSnapshot(): Record<string, unknown> {
    return {
      ragHybridMode: process.env.RAG_HYBRID_MODE || "lexical",
      ragSemanticEnabled: process.env.RAG_SEMANTIC_ENABLED === "true",
      ragBm25Enabled: process.env.RAG_BM25_ENABLED === "true",
      ragHybridFusion: process.env.RAG_HYBRID_FUSION || "weighted",
      ragHybridAlpha: process.env.RAG_HYBRID_ALPHA || "0.7",
      ragRerankerEnabled: this.reranker.isEnabled(),
      ragRerankerModel: this.reranker.getModel(),
      ragRerankerTopK: this.reranker.getTopK(),
      ragRerankerTopN: this.reranker.getTopN(),
      ragQueryExpansionEnabled: this.queryExpansion.isEnabled(),
      ragQueryExpansionN: this.queryExpansion.getN(),
      ragSemanticChunkingEnabled:
        process.env.RAG_SEMANTIC_CHUNKING_ENABLED === "true",
      ollamaEmbeddingModel: process.env.OLLAMA_EMBEDDING_MODEL || "bge-m3",
      ollamaLlmPrimary: process.env.OLLAMA_LLM_MODEL_PRIMARY || "mistral",
      vectorSimilarityThreshold:
        process.env.VECTOR_SIMILARITY_THRESHOLD || "0.5",
    };
  }

  /**
   * Construit un label de mode lisible a partir des flags actifs.
   * Ex: "hybrid+bm25+rerank+expand-3" ou "vector".
   */
  private inferModeLabel(): string {
    const parts: string[] = [];
    parts.push(process.env.RAG_HYBRID_MODE || "lexical");
    if (this.hybridSearch.isBM25Enabled()) parts.push("bm25");
    if (this.reranker.isEnabled()) parts.push("rerank");
    if (this.queryExpansion.isEnabled()) {
      parts.push(`expand-${this.queryExpansion.getN()}`);
    }
    if (process.env.RAG_SEMANTIC_CHUNKING_ENABLED === "true") {
      parts.push("semchunk");
    }
    return parts.join("+");
  }
}
