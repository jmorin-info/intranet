import { Injectable, Logger } from '@nestjs/common';

/**
 * Service LLM unifié avec fallback chain (P1.8.1.2).
 * Primary → Fallback → Emergency selon échec/timeout.
 * Garde un compteur d'escalades pour observabilité.
 */

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface GenerateResult {
  text: string;
  modelUsed: string;
  latencyMs: number;
  fallbackLevel: 0 | 1 | 2; // 0=primary, 1=fallback, 2=emergency
}

const DEFAULT_TIMEOUT_MS = 30_000;
const PRIMARY_RETRIES = 2;

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly metrics = {
    callsByModel: new Map<string, number>(),
    fallbacksByLevel: [0, 0, 0],
  };

  /** Renvoie la chaîne ordonnée des modèles : primary, fallback, emergency. */
  private getModelChain(): string[] {
    const primary = process.env.OLLAMA_LLM_MODEL_PRIMARY || process.env.OLLAMA_MODEL || 'mistral';
    const fallback = process.env.OLLAMA_LLM_MODEL_FALLBACK || 'phi3:mini';
    const emergency = process.env.OLLAMA_LLM_MODEL_EMERGENCY || 'qwen2:0.5b';
    return [primary, fallback, emergency];
  }

  getActiveModel(): string {
    return this.getModelChain()[0];
  }

  /**
   * Génère une réponse avec fallback automatique.
   * Loggue chaque escalade de manière structurée.
   */
  async generate(prompt: string, options: GenerateOptions = {}): Promise<GenerateResult> {
    const chain = this.getModelChain();
    const start = Date.now();

    for (let level = 0; level < chain.length; level++) {
      const model = chain[level];
      const isPrimary = level === 0;
      const retries = isPrimary ? PRIMARY_RETRIES : 0;

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const text = await this.callOllama(model, prompt, options);
          this.metrics.fallbacksByLevel[level]++;
          this.metrics.callsByModel.set(model, (this.metrics.callsByModel.get(model) || 0) + 1);
          if (level > 0) {
            this.logger.warn({
              msg: 'llm.fallback_used',
              level,
              model,
              primary: chain[0],
            });
          }
          return {
            text,
            modelUsed: model,
            latencyMs: Date.now() - start,
            fallbackLevel: level as 0 | 1 | 2,
          };
        } catch (err) {
          const isLastAttempt = attempt === retries;
          if (!isLastAttempt) {
            this.logger.warn({
              msg: 'llm.retry',
              model,
              attempt: attempt + 1,
              error: (err as Error).message,
            });
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }
          this.logger.error({
            msg: 'llm.escalate',
            failedModel: model,
            nextModel: chain[level + 1] || 'NONE',
            error: (err as Error).message,
          });
        }
      }
    }

    throw new Error(`All LLM models in chain failed: ${chain.join(', ')}`);
  }

  /** Stream tokens via Ollama (avec fallback non transparent en streaming). */
  async *generateStream(prompt: string, options: GenerateOptions = {}): AsyncGenerator<string> {
    const model = this.getActiveModel();
    const url = `${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/generate`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: true,
          options: {
            num_predict: options.maxTokens ?? 500,
            temperature: options.temperature ?? 0.3,
          },
        }),
        signal: controller.signal as any,
      });

      if (!response.ok) {
        throw new Error(`Ollama ${response.status}: ${response.statusText}`);
      }

      const reader = response.body as AsyncIterable<Uint8Array>;
      const decoder = new TextDecoder();
      let buffer = '';

      for await (const chunk of reader) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line) as { response?: string };
            if (parsed.response) yield parsed.response;
          } catch {
            // partial JSON
          }
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private async callOllama(
    model: string,
    prompt: string,
    options: GenerateOptions,
  ): Promise<string> {
    const url = `${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/generate`;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            num_predict: options.maxTokens ?? 500,
            temperature: options.temperature ?? 0.3,
          },
        }),
        signal: controller.signal as any,
      });

      if (!response.ok) {
        throw new Error(`Ollama ${model} returned ${response.status}: ${response.statusText}`);
      }
      const data = (await response.json()) as { response?: string };
      return data.response?.trim() ?? '';
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Health check : vérifie que le modèle primary répond. */
  async healthCheck(): Promise<{ model: string; healthy: boolean; latencyMs: number }> {
    const model = this.getActiveModel();
    const start = Date.now();
    try {
      await this.callOllama(model, 'OK', { maxTokens: 5, timeoutMs: 5000 });
      return { model, healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { model, healthy: false, latencyMs: Date.now() - start };
    }
  }

  /** Métriques internes (utilisable par /rag/stats). */
  getMetrics() {
    return {
      callsByModel: Object.fromEntries(this.metrics.callsByModel),
      fallbacksByLevel: {
        primary: this.metrics.fallbacksByLevel[0],
        fallback: this.metrics.fallbacksByLevel[1],
        emergency: this.metrics.fallbacksByLevel[2],
      },
    };
  }
}
