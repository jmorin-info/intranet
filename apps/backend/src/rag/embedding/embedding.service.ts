import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import { assertBackgroundCapacity, positiveInt, throwIfAborted } from "../reindex-safety";

const EMBEDDING_DIMS = 1024;
const MAX_RETRIES = 3;
const TIMEOUT_MS = 30_000;
export interface EmbeddingOptions { signal?: AbortSignal; background?: boolean }

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly cache = new Map<string, { vector: number[]; expiresAt: number }>();
  // One in-flight local embedding, including requests from search and ingestion.
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;

  isEnabled(): boolean { return process.env.RAG_SEMANTIC_ENABLED === "true"; }
  getModelId(): string { return process.env.OLLAMA_EMBEDDING_MODEL || "bge-m3"; }
  getDimension(): number { return EMBEDDING_DIMS; }

  async embed(text: string, options: EmbeddingOptions = {}): Promise<number[]> {
    throwIfAborted(options.signal);
    if (!this.isEnabled()) throw new Error("Semantic embeddings unavailable");
    if (!text.trim() || text.length > 16_000) throw new Error("Embedding input must contain 1–16000 characters");
    const key = this.computeCacheKey(text);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      this.cache.delete(key); this.cache.set(key, cached);
      return [...cached.vector];
    }
    this.cache.delete(key);
    if (this.pending >= 32) throw new Error("Embedding queue is full");
    this.pending++;
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    // Abort queued work promptly without opening a parallel slot prematurely.
    try {
      await this.waitForTurn(previous, options.signal);
      throwIfAborted(options.signal);
      if (options.background) assertBackgroundCapacity(true);
      const embedding = await this.callOllamaEmbedding(text, options);
      const ttl = positiveInt(process.env.RAG_EMBEDDING_CACHE_TTL_MS, 300_000, 3_600_000);
      this.cache.set(key, { vector: [...embedding], expiresAt: Date.now() + ttl });
      const max = positiveInt(process.env.RAG_EMBEDDING_CACHE_MAX, 256, 2048);
      while (this.cache.size > max) this.cache.delete(this.cache.keys().next().value!);
      return embedding;
    } finally { void previous.then(() => { this.pending--; release(); }); }
  }

  async embedBatch(texts: string[], options: EmbeddingOptions = {}): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) results.push(await this.embed(text, options));
    return results;
  }

  private async waitForTurn(previous: Promise<void>, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    if (!signal) return previous;
    let onAbort!: () => void;
    try {
      await Promise.race([previous, new Promise<never>((_, reject) => {
        onAbort = () => reject(signal.reason instanceof Error ? signal.reason : new Error("Embedding cancelled"));
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      })]);
    } finally { signal.removeEventListener("abort", onAbort); }
  }

  private async callOllamaEmbedding(text: string, options: EmbeddingOptions): Promise<number[]> {
    const url = `${process.env.OLLAMA_URL || "http://localhost:11434"}/api/embeddings`;
    const model = this.getModelId();
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      throwIfAborted(options.signal);
      if (options.background) assertBackgroundCapacity(true);
      const controller = new AbortController();
      const onAbort = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener("abort", onAbort, { once: true });
      if (options.signal?.aborted) onAbort();
      const timeout = setTimeout(() => controller.abort(new Error("Embedding request timed out")), TIMEOUT_MS);
      try {
        const raw = Number(process.env.OLLAMA_EMBEDDING_KEEP_ALIVE_SECONDS ?? 60);
        const keepAlive = Number.isFinite(raw) ? Math.max(0, Math.min(300, Math.floor(raw))) : 60;
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, prompt: text, keep_alive: `${keepAlive}s` }), signal: controller.signal });
        if (!response.ok) throw new Error(`Ollama embedding returned ${response.status}`);
        const data = await response.json() as { embedding?: number[] };
        if (!Array.isArray(data.embedding) || data.embedding.length !== EMBEDDING_DIMS || !data.embedding.every((n) => typeof n === "number" && Number.isFinite(n))) throw new Error("Invalid embedding vector");
        throwIfAborted(options.signal);
        return data.embedding;
      } catch (error) {
        throwIfAborted(options.signal);
        if (attempt === MAX_RETRIES - 1) throw error;
        this.logger.warn({ msg: "embedding.retry", attempt: attempt + 1 });
      } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", onAbort);
      }
      let abort: (() => void) | undefined;
      let delayTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await new Promise<void>((resolve) => {
          delayTimer = setTimeout(resolve, 1000 * 2 ** attempt);
          abort = resolve;
          options.signal?.addEventListener("abort", abort, { once: true });
          if (options.signal?.aborted) resolve();
        });
      } finally {
        clearTimeout(delayTimer);
        if (abort) options.signal?.removeEventListener("abort", abort);
      }
    }
    throw new Error("Embedding retries exhausted");
  }

  private computeCacheKey(text: string): string { return createHash("sha256").update(`${this.getModelId()}:${text}`).digest("hex"); }
}
