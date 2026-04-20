import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

/**
 * Service d'embedding sémantique via Ollama (P1.2).
 * Appelle le endpoint /api/embeddings de l'instance Ollama locale.
 * Gère le retry exponentiel et le cache SHA-256.
 */

const EMBEDDING_DIMS = 1024;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const TIMEOUT_MS = 30_000;

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly cache = new Map<string, number[]>();

  /** Vérifie si le service d'embedding sémantique est activé. */
  isEnabled(): boolean {
    return process.env.RAG_SEMANTIC_ENABLED === 'true';
  }

  getModelId(): string {
    return process.env.OLLAMA_EMBEDDING_MODEL || 'bge-m3';
  }

  getDimension(): number {
    return EMBEDDING_DIMS;
  }

  /**
   * Génère un embedding pour un texte donné.
   * Utilise un cache en mémoire (clé = SHA-256 du texte + modèle).
   */
  async embed(text: string): Promise<number[]> {
    if (!this.isEnabled()) {
      throw new Error('RAG_SEMANTIC_ENABLED is false — semantic embeddings unavailable');
    }

    const cacheKey = this.computeCacheKey(text);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    const embedding = await this.callOllamaEmbedding(text);
    this.cache.set(cacheKey, embedding);

    // Limiter la taille du cache en mémoire (LRU simplifié)
    if (this.cache.size > 5000) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    return embedding;
  }

  /**
   * Génère des embeddings en batch.
   * Traite séquentiellement pour respecter les limites Ollama.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }

  /**
   * Appel Ollama /api/embeddings avec retry exponentiel.
   */
  private async callOllamaEmbedding(text: string): Promise<number[]> {
    const url = `${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/embeddings`;
    const model = this.getModelId();

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt: text }),
          signal: controller.signal as any,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`Ollama embedding returned ${response.status}: ${response.statusText}`);
        }

        const data = (await response.json()) as { embedding?: number[] };
        if (!data.embedding || data.embedding.length !== EMBEDDING_DIMS) {
          throw new Error(
            `Invalid embedding dimension: got ${data.embedding?.length ?? 0}, expected ${EMBEDDING_DIMS}`,
          );
        }

        return data.embedding;
      } catch (err) {
        const isLastAttempt = attempt === MAX_RETRIES - 1;
        if (isLastAttempt) {
          this.logger.error({
            msg: 'embedding.call_failed',
            model,
            attempts: MAX_RETRIES,
            error: (err as Error).message,
          });
          throw err;
        }
        // Backoff exponentiel
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        this.logger.warn({
          msg: 'embedding.retry',
          attempt: attempt + 1,
          delayMs: delay,
          error: (err as Error).message,
        });
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    // Unreachable, mais TypeScript est content
    throw new Error('embedding: max retries exhausted');
  }

  /** Clé de cache : SHA-256(model + text) */
  private computeCacheKey(text: string): string {
    return createHash('sha256')
      .update(`${this.getModelId()}:${text}`)
      .digest('hex');
  }
}
