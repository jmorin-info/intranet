import { Injectable, Logger } from "@nestjs/common";

/**
 * Service LLM unifié avec fallback chain (P1.8.1.2).
 * Primary → Fallback → Emergency selon échec/timeout.
 * Garde un compteur d'escalades pour observabilité.
 *
 * Budgets temps (fix 2026-07 — inférence CPU ~5 tok/s, prompt-eval ~16 tok/s) :
 *  - OLLAMA_TIMEOUT_MS       : budget global d'un appel non-streaming (défaut 240 s).
 *  - OLLAMA_TTFT_TIMEOUT_MS  : attente max du 1er token en streaming (défaut 120 s).
 *  - OLLAMA_IDLE_TIMEOUT_MS  : silence max entre deux chunks en streaming,
 *                              réarmé à chaque chunk reçu (défaut 30 s).
 * L'ancien abort global 30 s tuait systématiquement le flux avant le premier
 * token (38 s de prompt-eval mesurés sur un prompt RAG réaliste).
 */

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  /** Budget global de l'appel (non-streaming) ou de la génération (streaming). */
  timeoutMs?: number;
}

export interface StreamOptions extends GenerateOptions {
  /** Attente max du premier token (défaut env OLLAMA_TTFT_TIMEOUT_MS). */
  ttftTimeoutMs?: number;
  /** Idle-timeout entre chunks, réarmé à chaque chunk (défaut env OLLAMA_IDLE_TIMEOUT_MS). */
  idleTimeoutMs?: number;
  /**
   * Notifié quand on bascule sur un modèle de fallback AVANT le premier token
   * (fallback transparent pour le client : aucun token n'est encore parti).
   */
  onModelFallback?: (model: string, level: number) => void;
}

export interface GenerateResult {
  text: string;
  modelUsed: string;
  latencyMs: number;
  fallbackLevel: 0 | 1 | 2; // 0=primary, 1=fallback, 2=emergency
}

const PRIMARY_RETRIES = 2;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Budget global par défaut d'un appel LLM (surchargé par OLLAMA_TIMEOUT_MS). */
export function getOllamaTimeoutMs(): number {
  return envInt("OLLAMA_TIMEOUT_MS", 240_000);
}

function getTtftTimeoutMs(): number {
  return envInt("OLLAMA_TTFT_TIMEOUT_MS", 120_000);
}

function getIdleTimeoutMs(): number {
  return envInt("OLLAMA_IDLE_TIMEOUT_MS", 30_000);
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly metrics = {
    callsByModel: new Map<string, number>(),
    fallbacksByLevel: [0, 0, 0],
  };

  /** Renvoie la chaîne ordonnée des modèles : primary, fallback, emergency. */
  private getModelChain(): string[] {
    const primary = process.env.OLLAMA_LLM_MODEL_PRIMARY || process.env.OLLAMA_MODEL || "mistral";
    const fallback = process.env.OLLAMA_LLM_MODEL_FALLBACK || "phi3:mini";
    const emergency = process.env.OLLAMA_LLM_MODEL_EMERGENCY || "qwen2:0.5b";
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

    // `timeoutMs`, quand fourni, est un budget GLOBAL pour tout l'appel
    // (retries primary + fallback + emergency), PAS par tentative. Sans ce
    // deadline, il était réarmé neuf à chaque callOllama → jusqu'à
    // (3 retries + 2 fallbacks) × timeoutMs par generate(). On calcule ici le
    // reliquat et on le passe à chaque tentative ; budget épuisé → on arrête.
    const deadline = options.timeoutMs && options.timeoutMs > 0 ? start + options.timeoutMs : null;

    for (let level = 0; level < chain.length; level++) {
      const model = chain[level];
      const isPrimary = level === 0;
      const retries = isPrimary ? PRIMARY_RETRIES : 0;

      for (let attempt = 0; attempt <= retries; attempt++) {
        // Budget global épuisé : inutile d'entamer une nouvelle tentative.
        const remaining = deadline ? deadline - Date.now() : null;
        if (remaining !== null && remaining <= 0) {
          this.logger.error({
            msg: "llm.budget_exhausted",
            model,
            elapsedMs: Date.now() - start,
            budgetMs: options.timeoutMs,
          });
          throw new Error(
            `LLM budget exhausted after ${Date.now() - start}ms (chain: ${chain.join(", ")})`,
          );
        }
        // Le reliquat borne le timeout de CETTE tentative (jamais au-dessus du
        // budget global restant).
        const attemptOptions: GenerateOptions =
          remaining !== null ? { ...options, timeoutMs: remaining } : options;

        try {
          const text = await this.callOllama(model, prompt, attemptOptions);
          this.metrics.fallbacksByLevel[level]++;
          this.metrics.callsByModel.set(model, (this.metrics.callsByModel.get(model) || 0) + 1);
          if (level > 0) {
            this.logger.warn({
              msg: "llm.fallback_used",
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
              msg: "llm.retry",
              model,
              attempt: attempt + 1,
              error: (err as Error).message,
            });
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            continue;
          }
          this.logger.error({
            msg: "llm.escalate",
            failedModel: model,
            nextModel: chain[level + 1] || "NONE",
            error: (err as Error).message,
          });
        }
      }
    }

    throw new Error(`All LLM models in chain failed: ${chain.join(", ")}`);
  }

  /**
   * Stream tokens via Ollama.
   *
   * Garde-fous temps (remplace l'ancien abort global 30 s qui coupait le flux
   * avant le premier token sur CPU) :
   *  - time-to-first-token : `ttftTimeoutMs` (env OLLAMA_TTFT_TIMEOUT_MS)
   *  - idle-timeout réarmé à chaque chunk : `idleTimeoutMs` (env OLLAMA_IDLE_TIMEOUT_MS)
   *  - budget global optionnel : `timeoutMs` (plafonne la génération entière)
   *
   * Fallback de modèle : si un modèle échoue AVANT d'avoir émis le moindre
   * token (connexion refusée, HTTP != 2xx, TTFT dépassé), on retente en
   * toute transparence avec le modèle suivant de la chaîne (phi3:mini puis
   * qwen2:0.5b) et on notifie via `onModelFallback`. Après le premier token,
   * plus de fallback possible (des tokens sont déjà partis au client) :
   * l'erreur est propagée.
   */
  async *generateStream(prompt: string, options: StreamOptions = {}): AsyncGenerator<string> {
    const chain = this.getModelChain();
    const ttftMs = options.ttftTimeoutMs ?? getTtftTimeoutMs();
    const idleMs = options.idleTimeoutMs ?? getIdleTimeoutMs();

    for (let level = 0; level < chain.length; level++) {
      const model = chain[level];
      if (level > 0) {
        this.logger.warn({
          msg: "llm.stream.fallback",
          level,
          model,
          primary: chain[0],
        });
        options.onModelFallback?.(model, level);
      }

      let firstTokenSeen = false;
      try {
        for await (const token of this.streamModel(model, prompt, options, ttftMs, idleMs, () => {
          firstTokenSeen = true;
        })) {
          yield token;
        }
        // Stream terminé sans erreur → métriques et sortie.
        this.metrics.fallbacksByLevel[level]++;
        this.metrics.callsByModel.set(model, (this.metrics.callsByModel.get(model) || 0) + 1);
        return;
      } catch (err) {
        if (firstTokenSeen) {
          // Des tokens sont déjà partis : impossible de recommencer proprement
          // avec un autre modèle — on propage (l'appelant gère son fallback UX).
          this.logger.error({
            msg: "llm.stream.failed_mid_generation",
            model,
            error: (err as Error).message,
          });
          throw err;
        }
        this.logger.error({
          msg: "llm.stream.escalate",
          failedModel: model,
          nextModel: chain[level + 1] || "NONE",
          error: (err as Error).message,
        });
      }
    }

    throw new Error(
      `All LLM models in chain failed before first token (stream): ${chain.join(", ")}`,
    );
  }

  /**
   * Streaming d'un seul modèle avec TTFT + idle-timeout + budget global.
   * Lance une erreur si le modèle ne répond pas dans les budgets.
   */
  private async *streamModel(
    model: string,
    prompt: string,
    options: StreamOptions,
    ttftMs: number,
    idleMs: number,
    onFirstToken: () => void,
  ): AsyncGenerator<string> {
    const url = `${process.env.OLLAMA_URL || "http://localhost:11434"}/api/generate`;
    const controller = new AbortController();
    const deadline = options.timeoutMs ? Date.now() + options.timeoutMs : null;

    let timer: NodeJS.Timeout | null = null;
    const arm = (ms: number) => {
      if (timer) clearTimeout(timer);
      const remaining = deadline ? deadline - Date.now() : Infinity;
      const wait = Math.min(ms, remaining);
      if (wait <= 0) {
        controller.abort();
        return;
      }
      timer = setTimeout(() => controller.abort(), wait);
    };

    // Avant le premier chunk : fenêtre time-to-first-token.
    arm(ttftMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: true,
          options: {
            num_predict: options.maxTokens ?? 500,
            temperature: options.temperature ?? 0.3,
          },
        }),
        // Node fetch attend un AbortSignal compatible avec DOM ; les types
        // diffèrent légèrement entre node:undici et le DOM lib, on contourne.
        signal: controller.signal as AbortSignal,
      });

      if (!response.ok) {
        throw new Error(`Ollama ${response.status}: ${response.statusText}`);
      }

      const reader = response.body as AsyncIterable<Uint8Array>;
      const decoder = new TextDecoder();
      let buffer = "";

      for await (const chunk of reader) {
        // Chaque chunk réseau réarme l'idle-timeout (borné par le budget global).
        arm(idleMs);
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line) as { response?: string };
            if (parsed.response) {
              onFirstToken();
              yield parsed.response;
            }
          } catch {
            // partial JSON
          }
        }
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async callOllama(
    model: string,
    prompt: string,
    options: GenerateOptions,
  ): Promise<string> {
    const url = `${process.env.OLLAMA_URL || "http://localhost:11434"}/api/generate`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? getOllamaTimeoutMs());

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            num_predict: options.maxTokens ?? 500,
            temperature: options.temperature ?? 0.3,
          },
        }),
        // Node fetch attend un AbortSignal compatible avec DOM ; les types
        // diffèrent légèrement entre node:undici et le DOM lib, on contourne.
        signal: controller.signal as AbortSignal,
      });

      if (!response.ok) {
        throw new Error(`Ollama ${model} returned ${response.status}: ${response.statusText}`);
      }
      const data = (await response.json()) as { response?: string };
      return data.response?.trim() ?? "";
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Health check : vérifie que le modèle primary répond. */
  async healthCheck(): Promise<{
    model: string;
    healthy: boolean;
    latencyMs: number;
  }> {
    const model = this.getActiveModel();
    const start = Date.now();
    try {
      await this.callOllama(model, "OK", { maxTokens: 5, timeoutMs: 5000 });
      return { model, healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { model, healthy: false, latencyMs: Date.now() - start };
    }
  }

  /**
   * Préchauffage : charge le modèle primary en RAM via une génération d'un
   * seul token (num_predict=1). Appelé au boot (LlmWarmupService) pour
   * éliminer les +17 s de cold-start sur la première vraie requête.
   * N'utilise PAS la chaîne de fallback : on ne veut pas charger les 3
   * modèles en RAM si le primary est lent à froid.
   */
  async warmup(): Promise<{ model: string; latencyMs: number }> {
    const model = this.getActiveModel();
    const start = Date.now();
    await this.callOllama(model, "OK", {
      maxTokens: 1,
      timeoutMs: getOllamaTimeoutMs(),
    });
    return { model, latencyMs: Date.now() - start };
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
