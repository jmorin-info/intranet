import { Injectable, Logger, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { LlmService } from "../rag/llm/llm.service";
import { EmbeddingService } from "../rag/embedding/embedding.service";

/**
 * Wave D — Item 31 — Mémoire conversationnelle persistante de Noa.
 *
 * Architecture (cf. docs/architecture/NOA_MEMORY.md) :
 *   1. extract(userId, conversation) — Ollama JSON-prompted "extract user-facts"
 *   2. store(userId, items)         — UPSERT NoaMemory + embedding pgvector
 *   3. recall(userId, query, k=5)   — top-k cosine similarity + recency boost
 *   4. forget(userId, ids|all)      — RGPD article 17 (right to erasure)
 *
 * Le service est tolérant aux pannes Ollama : si l'extraction LLM ou
 * l'embedding échouent, on logge mais on ne propage pas l'erreur (le chat
 * doit fonctionner même sans mémoire).
 *
 * Toutes les opérations sont gated par `User.noaMemoryEnabled` (default true).
 * Si le user a désactivé : recall renvoie [], store est no-op.
 */
@Injectable()
export class NoaMemoryService {
  private readonly logger = new Logger(NoaMemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly llm?: LlmService,
    @Optional() private readonly embedding?: EmbeddingService,
  ) {}

  // ==========================================================================
  // 1. EXTRACT — LLM extracts facts from a conversation
  // ==========================================================================

  /**
   * Demande au LLM d'extraire les faits utilisateur pertinents d'un échange.
   * Renvoie une liste vide en cas d'erreur LLM (best-effort, fire-and-forget).
   *
   * Le prompt est volontairement strict (JSON only) pour permettre le parsing.
   * importanceScore convention :
   *   - 0.9 : préférence explicite ("appelle-moi X", "tutoie-moi")
   *   - 0.7 : projet/contexte récurrent ("je travaille sur le projet Y")
   *   - 0.5 : mention factuelle ("je suis du département Z")
   *   - 0.3 : information passagère / context-only
   */
  async extract(
    userId: string,
    conversation: { user: string; assistant: string },
  ): Promise<ExtractedMemory[]> {
    if (!this.llm) return [];
    const prompt = this.buildExtractPrompt(conversation);
    try {
      const result = await this.llm.generate(prompt, {
        maxTokens: 400,
        temperature: 0.1,
        timeoutMs: 15_000,
      });
      const items = this.parseExtractedJson(result.text);
      this.logger.debug({
        msg: "noa.memory.extracted",
        userId,
        itemCount: items.length,
      });
      return items;
    } catch (err) {
      this.logger.warn({
        msg: "noa.memory.extract_failed",
        userId,
        error: (err as Error).message,
      });
      return [];
    }
  }

  private buildExtractPrompt(conversation: {
    user: string;
    assistant: string;
  }): string {
    return `Tu es un extracteur de faits utilisateur pour un assistant intranet d'entreprise.
Analyse l'échange ci-dessous et extrait UNIQUEMENT les faits pertinents pour personnaliser
les réponses futures (préférences, contexte de travail, projets en cours, équipe, contraintes).

NE PAS extraire :
- Des informations sensibles (mots de passe, identifiants, données médicales).
- Des éléments triviaux (salutations, "merci", "ok").
- Des suppositions non confirmées par l'utilisateur.

Réponds UNIQUEMENT en JSON, dans le format suivant — aucun texte avant ou après :
{ "items": [{ "key": "string-court-snake-case", "value": "phrase complète", "importance": 0.0-1.0 }] }

Exemple de bonnes clés : "preference.tutoiement", "projet.actif", "departement", "contrainte.disponibilite".

Si rien à extraire, réponds : { "items": [] }

ÉCHANGE :
USER: ${conversation.user}
ASSISTANT: ${conversation.assistant}

JSON:`;
  }

  private parseExtractedJson(raw: string): ExtractedMemory[] {
    if (!raw) return [];
    // Tolérance : on essaye d'isoler le premier objet JSON parsable
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[0]) as { items?: unknown[] };
      if (!Array.isArray(parsed.items)) return [];
      const items: ExtractedMemory[] = [];
      for (const item of parsed.items) {
        if (
          item &&
          typeof item === "object" &&
          "key" in item &&
          "value" in item
        ) {
          const key = String((item as { key: unknown }).key).trim();
          const value = String((item as { value: unknown }).value).trim();
          let importance = Number(
            (item as { importance?: unknown }).importance ?? 0.5,
          );
          if (!Number.isFinite(importance)) importance = 0.5;
          importance = Math.max(0, Math.min(1, importance));
          if (!key || !value) continue;
          if (key.length > 64 || value.length > 1000) continue;
          items.push({ key, value, importance });
        }
      }
      return items;
    } catch {
      return [];
    }
  }

  // ==========================================================================
  // 2. STORE — UPSERT NoaMemory + embedding
  // ==========================================================================

  /**
   * Persiste les memories et calcule l'embedding pgvector. UPSERT par
   * (userId, key) : si une mémoire existe déjà sur la même clé, on remplace
   * sa valeur (la version la plus récente prime).
   *
   * Renvoie le nombre de mémoires effectivement persistées.
   */
  async store(userId: string, items: ExtractedMemory[]): Promise<number> {
    if (items.length === 0) return 0;
    const enabled = await this.isMemoryEnabled(userId);
    if (!enabled) return 0;

    let stored = 0;
    for (const item of items) {
      try {
        // Upsert par (userId, key) : suppression de l'ancienne version
        const existing = await this.prisma.noaMemory.findFirst({
          where: { userId, key: item.key },
          select: { id: true },
        });

        let memoryId: string;
        if (existing) {
          const updated = await this.prisma.noaMemory.update({
            where: { id: existing.id },
            data: {
              value: item.value,
              importanceScore: item.importance,
              expiresAt: this.computeExpiry(item.importance),
            },
            select: { id: true },
          });
          memoryId = updated.id;
        } else {
          const created = await this.prisma.noaMemory.create({
            data: {
              userId,
              key: item.key,
              value: item.value,
              importanceScore: item.importance,
              expiresAt: this.computeExpiry(item.importance),
            },
            select: { id: true },
          });
          memoryId = created.id;
        }

        // Embedding (best-effort, ne bloque pas le store)
        await this.upsertEmbedding(memoryId, item.value).catch((err) => {
          this.logger.warn({
            msg: "noa.memory.embedding_failed",
            memoryId,
            error: (err as Error).message,
          });
        });

        stored += 1;
      } catch (err) {
        this.logger.warn({
          msg: "noa.memory.store_failed",
          userId,
          key: item.key,
          error: (err as Error).message,
        });
      }
    }
    return stored;
  }

  /**
   * TTL : memories peu importantes expirent à 6 mois ; importantes (>0.8)
   * n'expirent jamais (expiresAt=null) jusqu'à un forget explicite.
   */
  private computeExpiry(importance: number): Date | null {
    if (importance > 0.8) return null;
    return new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
  }

  private async upsertEmbedding(memoryId: string, text: string): Promise<void> {
    if (!this.embedding || !this.embedding.isEnabled()) return;
    const vector = await this.embedding.embed(text);
    // pgvector raw : Prisma ne gère pas la colonne `embedding vector(1024)`
    const vectorLiteral = `[${vector.join(",")}]`;
    await this.prisma.$executeRawUnsafe(
      `UPDATE "NoaMemory" SET "embedding" = $1::vector WHERE "id" = $2`,
      vectorLiteral,
      memoryId,
    );
  }

  // ==========================================================================
  // 3. RECALL — top-k similarity + recency boost
  // ==========================================================================

  /**
   * Renvoie les top-k mémoires les plus pertinentes pour `query`.
   * - Filtre `importanceScore >= minImportance` (default 0.5).
   * - Pondère similarité cosine (50%) + importance (30%) + recency (20%).
   * - Incrémente recallCount + lastRecalledAt sur les hits (refresh TTL).
   *
   * En cas d'erreur d'embedding : fallback sur tri par importance.
   */
  async recall(
    userId: string,
    query: string,
    options: RecallOptions = {},
  ): Promise<NoaMemoryRecord[]> {
    const k = options.k ?? 5;
    const minImportance = options.minImportance ?? 0.5;

    const enabled = await this.isMemoryEnabled(userId);
    if (!enabled) return [];

    // Tentative de recall sémantique via pgvector
    if (this.embedding && this.embedding.isEnabled()) {
      try {
        const vector = await this.embedding.embed(query);
        const literal = `[${vector.join(",")}]`;
        // Cosine distance : plus c'est petit, plus c'est proche
        const rows = await this.prisma.$queryRawUnsafe<NoaMemoryRow[]>(
          `SELECT id, "userId", key, value, "importanceScore", "recallCount", "lastRecalledAt", "createdAt", "updatedAt", "expiresAt", metadata, 1 - (embedding <=> $1::vector) AS cosine_similarity
           FROM "NoaMemory"
           WHERE "userId" = $2 AND "importanceScore" >= $3 AND embedding IS NOT NULL AND ("expiresAt" IS NULL OR "expiresAt" > now())
           ORDER BY embedding <=> $1::vector ASC
           LIMIT $4`,
          literal,
          userId,
          minImportance,
          k * 3, // sur-sample pour le rerank
        );

        const ranked = rows
          .map((r) => ({
            ...r,
            score: this.scoreMemory(r),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, k);

        await this.markRecalled(ranked.map((r) => r.id));
        return ranked.map(rowToRecord);
      } catch (err) {
        this.logger.warn({
          msg: "noa.memory.recall_vector_failed",
          userId,
          error: (err as Error).message,
        });
      }
    }

    // Fallback : tri par importance + récence (sans similarité)
    const fallback = await this.prisma.noaMemory.findMany({
      where: {
        userId,
        importanceScore: { gte: minImportance },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: [{ importanceScore: "desc" }, { updatedAt: "desc" }],
      take: k,
    });
    await this.markRecalled(fallback.map((r) => r.id));
    return fallback.map((r) => ({
      id: r.id,
      key: r.key,
      value: r.value,
      importanceScore: r.importanceScore,
      recallCount: r.recallCount,
      createdAt: r.createdAt,
    }));
  }

  /** Score combiné : 0.5 * cosine + 0.3 * importance + 0.2 * recency */
  private scoreMemory(row: NoaMemoryRow): number {
    const sim = Number(row.cosine_similarity ?? 0);
    const importance = row.importanceScore ?? 0.5;
    const ageMs = Date.now() - new Date(row.updatedAt).getTime();
    const monthMs = 30 * 24 * 3600_000;
    const recency = Math.max(0, 1 - ageMs / (6 * monthMs));
    return 0.5 * sim + 0.3 * importance + 0.2 * recency;
  }

  private async markRecalled(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      await this.prisma.noaMemory.updateMany({
        where: { id: { in: ids } },
        data: { recallCount: { increment: 1 }, lastRecalledAt: new Date() },
      });
    } catch (err) {
      // Non-bloquant
      this.logger.debug(
        `noa.memory.mark_recalled_failed: ${(err as Error).message}`,
      );
    }
  }

  // ==========================================================================
  // 4. FORGET — RGPD article 17
  // ==========================================================================

  /** Liste paginée pour la page /profile/noa-memory. */
  async list(
    userId: string,
    options: { page?: number; limit?: number } = {},
  ): Promise<{ data: NoaMemoryRecord[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 20));
    const [rows, total] = await Promise.all([
      this.prisma.noaMemory.findMany({
        where: { userId },
        orderBy: [{ importanceScore: "desc" }, { updatedAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.noaMemory.count({ where: { userId } }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        key: r.key,
        value: r.value,
        importanceScore: r.importanceScore,
        recallCount: r.recallCount,
        createdAt: r.createdAt,
      })),
      total,
      page,
      limit,
    };
  }

  async forget(userId: string, memoryId: string): Promise<boolean> {
    const result = await this.prisma.noaMemory.deleteMany({
      where: { id: memoryId, userId },
    });
    return result.count > 0;
  }

  async forgetAll(userId: string): Promise<number> {
    const result = await this.prisma.noaMemory.deleteMany({
      where: { userId },
    });
    return result.count;
  }

  /** Export RGPD : JSON brut de toutes les mémoires + métadonnées. */
  async exportForUser(userId: string): Promise<{
    userId: string;
    exportedAt: string;
    items: Array<{
      key: string;
      value: string;
      importanceScore: number;
      recallCount: number;
      createdAt: Date;
      updatedAt: Date;
      expiresAt: Date | null;
    }>;
  }> {
    const rows = await this.prisma.noaMemory.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    return {
      userId,
      exportedAt: new Date().toISOString(),
      items: rows.map((r) => ({
        key: r.key,
        value: r.value,
        importanceScore: r.importanceScore,
        recallCount: r.recallCount,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        expiresAt: r.expiresAt,
      })),
    };
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Lit `User.noaMemoryEnabled`. Default true (opt-out) — un user qui n'a
   * jamais touché au toggle a la mémoire active.
   */
  private async isMemoryEnabled(userId: string): Promise<boolean> {
    try {
      const u = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { noaMemoryEnabled: true },
      });
      return u?.noaMemoryEnabled !== false;
    } catch {
      return true;
    }
  }

  /**
   * Construit le bloc "system memory" injecté en début de prompt si des
   * mémoires existent pour le user. Renvoie une chaîne vide si pas de hit.
   */
  formatForPrompt(memories: NoaMemoryRecord[]): string {
    if (memories.length === 0) return "";
    const lines = memories.map((m) => `- ${m.value}`).join("\n");
    return `Contexte utilisateur (mémoire persistante Noa) :\n${lines}\n\n`;
  }
}

// =============================================================================
// Types
// =============================================================================

export interface ExtractedMemory {
  key: string;
  value: string;
  importance: number; // 0..1
}

export interface RecallOptions {
  k?: number;
  minImportance?: number;
}

export interface NoaMemoryRecord {
  id: string;
  key: string;
  value: string;
  importanceScore: number;
  recallCount: number;
  createdAt: Date;
}

interface NoaMemoryRow {
  id: string;
  userId: string;
  key: string;
  value: string;
  importanceScore: number;
  recallCount: number;
  lastRecalledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
  metadata: Prisma.JsonValue | null;
  cosine_similarity?: number;
}

function rowToRecord(r: NoaMemoryRow): NoaMemoryRecord {
  return {
    id: r.id,
    key: r.key,
    value: r.value,
    importanceScore: r.importanceScore,
    recallCount: r.recallCount,
    createdAt: r.createdAt,
  };
}
