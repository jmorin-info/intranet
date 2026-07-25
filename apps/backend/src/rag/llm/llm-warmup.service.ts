import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { LlmService } from "./llm.service";
import { EmbeddingService } from "../embedding/embedding.service";

/**
 * Préchauffage des modèles IA au boot du backend (fix 2026-07).
 *
 * Sur cette machine (CPU, pas de GPU), le chargement à froid du modèle
 * primary coûte ~17,5 s et celui de bge-m3 ~10,7 s : la première requête
 * utilisateur après un restart payait ce coût en plus de l'inférence.
 *
 * Fire-and-forget et non bloquant : le boot NestJS n'attend pas le warmup,
 * et tout échec est seulement loggué (Ollama down ≠ backend down).
 * Actif uniquement si OLLAMA_ENABLED=true.
 */
@Injectable()
export class LlmWarmupService implements OnModuleInit {
  private readonly logger = new Logger(LlmWarmupService.name);

  constructor(
    private readonly llmService: LlmService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  onModuleInit(): void {
    const enabled = process.env.OLLAMA_ENABLED === "true" || process.env.OLLAMA_ENABLED === "1";
    if (!enabled) {
      this.logger.log("llm.warmup.skipped — OLLAMA_ENABLED != true");
      return;
    }
    // Fire-and-forget : ne bloque jamais le démarrage du backend.
    void this.warmupAll();
  }

  /** Exposé pour les tests ; exécute les deux préchauffages séquentiellement. */
  async warmupAll(): Promise<void> {
    try {
      const { model, latencyMs } = await this.llmService.warmup();
      this.logger.log({ msg: "llm.warmup.done", model, latencyMs });
    } catch (err) {
      this.logger.warn({
        msg: "llm.warmup.failed",
        error: (err as Error).message,
      });
    }

    if (this.embeddingService.isEnabled()) {
      const start = Date.now();
      try {
        await this.embeddingService.embed("warmup omnitech intranet");
        this.logger.log({
          msg: "embedding.warmup.done",
          model: this.embeddingService.getModelId(),
          latencyMs: Date.now() - start,
        });
      } catch (err) {
        this.logger.warn({
          msg: "embedding.warmup.failed",
          error: (err as Error).message,
        });
      }
    }
  }
}
