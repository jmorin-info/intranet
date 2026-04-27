/**
 * RedisThrottlerStorage — backend Redis pour `@nestjs/throttler` (item 15
 * de la roadmap Vague A v1.1).
 *
 * Implémente l'interface `ThrottlerStorage` du package officiel en
 * s'appuyant sur ioredis (déjà disponible côté backend pour BullMQ + cache).
 *
 * Pourquoi un storage maison plutôt qu'une lib externe ?
 *   - Aucune compat 100% garantie pour `@nestjs/throttler@6.x` côté
 *     `@nest-lab/throttler-storage-redis` au moment de la rédaction.
 *   - L'API ThrottlerStorage est minimale (1 méthode `increment`).
 *   - On veut un fallback in-memory transparent si Redis est down, ce que
 *     les libs tierces ne fournissent pas par défaut.
 *
 * Algorithme :
 *   - Une clé Redis par "tracker × throttler × handler", TTL = `ttl` (ms).
 *   - INCR atomique pour le compteur ; PEXPIRE NX la première fois pour fixer
 *     l'expiration.
 *   - Si `totalHits > limit`, on pose une seconde clé `${key}:blocked` avec
 *     TTL `blockDuration` ; tant qu'elle existe, le compteur est considéré
 *     comme "bloqué" et on retourne `isBlocked=true`.
 *
 * Robustesse :
 *   - Si Redis est down ou répond une erreur, on retombe automatiquement sur
 *     un compteur in-memory (le `MemoryStorageService` officiel) pour ne pas
 *     bloquer les requêtes : "fail-open" en environnement dégradé.
 *   - Le mode strict (THROTTLER_REDIS_REQUIRED=true) refuse au contraire les
 *     requêtes (fail-closed) si Redis est down — utile en prod sensible.
 */
import { Logger } from "@nestjs/common";
import type { ThrottlerStorage } from "@nestjs/throttler";
import type { ThrottlerStorageRecord } from "@nestjs/throttler/dist/throttler-storage-record.interface";
import Redis from "ioredis";

/**
 * Implémentation in-memory minimale, utilisée comme fallback transparent
 * lorsque Redis est down. Reproduit la logique du `ThrottlerStorageService`
 * officiel sans dépendance directe (pour pouvoir l'instancier librement
 * sans passer par `forRoot` qui crée déjà le storage par défaut).
 */
class InMemoryFallbackStorage implements ThrottlerStorage {
  private counters = new Map<
    string,
    { count: number; expiresAt: number; blockedUntil: number }
  >();

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const now = Date.now();
    let entry = this.counters.get(key);
    if (!entry || entry.expiresAt <= now) {
      entry = { count: 0, expiresAt: now + ttl, blockedUntil: 0 };
    }
    entry.count += 1;
    const isBlocked = entry.count > limit;
    if (isBlocked && entry.blockedUntil <= now) {
      entry.blockedUntil = now + (blockDuration > 0 ? blockDuration : ttl);
    }
    this.counters.set(key, entry);

    // GC opportuniste pour éviter la croissance illimitée de la Map.
    if (this.counters.size > 10_000) {
      for (const [k, v] of this.counters) {
        if (v.expiresAt <= now && v.blockedUntil <= now) {
          this.counters.delete(k);
        }
      }
    }

    return {
      totalHits: entry.count,
      timeToExpire: Math.max(0, entry.expiresAt - now),
      isBlocked,
      timeToBlockExpire: Math.max(0, entry.blockedUntil - now),
    };
  }
}

export interface RedisThrottlerStorageOptions {
  /** URL Redis (priorité), ex: redis://:pass@host:6379/2 */
  url?: string;
  /** Composantes individuelles utilisées si `url` n'est pas défini. */
  host?: string;
  port?: number;
  password?: string;
  /** Préfixe de clé pour isoler les compteurs (par défaut "throttle:"). */
  keyPrefix?: string;
  /**
   * Fail-closed : si Redis est down, refuser les requêtes (compteur=∞).
   * Par défaut false → fallback in-memory.
   */
  failClosed?: boolean;
  /**
   * Si true, ne tente PAS de se connecter à Redis dans le constructeur.
   * Utile pour les tests qui injectent un client mocké via
   * `_setClientForTests()`.
   */
  disableAutoConnect?: boolean;
}

/**
 * Storage Redis pour le ThrottlerModule.
 *
 * Lifecycle : on connecte Redis paresseusement à la première requête (et
 * non au démarrage du module) afin de ne pas bloquer le boot si Redis tarde.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private client: Redis | null = null;
  private isAvailable = false;
  private readonly fallback = new InMemoryFallbackStorage();
  private readonly options: {
    url?: string;
    host: string;
    port: number;
    password?: string;
    keyPrefix: string;
    failClosed: boolean;
  };

  constructor(opts: RedisThrottlerStorageOptions = {}) {
    this.options = {
      url: opts.url,
      host: opts.host ?? process.env.REDIS_HOST ?? "localhost",
      port: opts.port ?? parseInt(process.env.REDIS_PORT ?? "6379", 10),
      password: opts.password ?? process.env.REDIS_PASSWORD ?? undefined,
      keyPrefix: opts.keyPrefix ?? "throttle:",
      failClosed: opts.failClosed ?? false,
    };
    if (!opts.disableAutoConnect) {
      this.connect();
    }
  }

  /**
   * Tentative de connexion Redis (lazy). En cas d'erreur, on reste en
   * fallback in-memory.
   */
  private connect(): void {
    try {
      this.client = this.options.url
        ? new Redis(this.options.url, {
            lazyConnect: true,
            enableOfflineQueue: false,
            maxRetriesPerRequest: 1,
            retryStrategy: (times) => (times > 5 ? null : Math.min(times * 500, 3000)),
          })
        : new Redis({
            host: this.options.host,
            port: this.options.port,
            password: this.options.password,
            lazyConnect: true,
            enableOfflineQueue: false,
            maxRetriesPerRequest: 1,
            retryStrategy: (times) => (times > 5 ? null : Math.min(times * 500, 3000)),
          });

      this.client.on("error", (err) => {
        if (this.isAvailable) {
          this.logger.warn(
            `Redis throttler error: ${err.message} — falling back to in-memory`,
          );
        }
        this.isAvailable = false;
      });

      this.client.on("ready", () => {
        this.isAvailable = true;
        this.logger.log(
          `Redis throttler storage ready (${this.options.url ?? `${this.options.host}:${this.options.port}`})`,
        );
      });

      this.client.on("end", () => {
        this.isAvailable = false;
      });

      // Connect en arrière-plan : ne pas bloquer le boot si Redis lag.
      this.client
        .connect()
        .catch((err) => {
          this.isAvailable = false;
          this.logger.warn(
            `Redis throttler unavailable at boot, fallback in-memory: ${
              err instanceof Error ? err.message : err
            }`,
          );
        });
    } catch (err) {
      this.client = null;
      this.isAvailable = false;
      this.logger.warn(
        `Redis throttler init failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /** Healthcheck léger : exposé pour `/api/v1/health`. */
  async ping(): Promise<{ ok: boolean; mode: "redis" | "in-memory" | "down"; latencyMs?: number }> {
    if (!this.client || !this.isAvailable) {
      // Fail-closed : on remonte "down". Sinon "in-memory" (fallback actif).
      if (this.options.failClosed) return { ok: false, mode: "down" };
      return { ok: true, mode: "in-memory" };
    }
    const t0 = Date.now();
    try {
      const pong = await this.client.ping();
      return {
        ok: pong === "PONG",
        mode: "redis",
        latencyMs: Date.now() - t0,
      };
    } catch {
      return this.options.failClosed
        ? { ok: false, mode: "down" }
        : { ok: true, mode: "in-memory" };
    }
  }

  /** Permet à un opérateur de purger tous les compteurs (runbook). */
  async clearCounters(): Promise<{ deleted: number }> {
    if (!this.client || !this.isAvailable) return { deleted: 0 };
    let deleted = 0;
    let cursor = "0";
    const pattern = `${this.options.keyPrefix}*`;
    do {
      const [next, keys] = await this.client.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        500,
      );
      cursor = next;
      if (keys.length > 0) {
        deleted += await this.client.del(...keys);
      }
    } while (cursor !== "0");
    this.logger.log(`Throttler counters cleared (deleted=${deleted})`);
    return { deleted };
  }

  /**
   * Exposed for tests : injecte un client (ioredis-mock) à la place du
   * client réel. Marque immédiatement le storage comme available.
   */
  _setClientForTests(client: Redis): void {
    this.client = client;
    this.isAvailable = true;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (!this.client || !this.isAvailable) {
      if (this.options.failClosed) {
        // Fail-closed : on simule un blocage permanent → 429 systématique.
        return {
          totalHits: limit + 1,
          timeToExpire: ttl,
          isBlocked: true,
          timeToBlockExpire: blockDuration > 0 ? blockDuration : ttl,
        };
      }
      // Fail-open : fallback in-memory.
      return this.fallback.increment(
        key,
        ttl,
        limit,
        blockDuration,
        _throttlerName,
      );
    }

    const fullKey = `${this.options.keyPrefix}${key}`;
    const blockedKey = `${fullKey}:blocked`;

    try {
      // Pipeline atomique : INCR + PEXPIRE NX + GET blocked TTL.
      const pipeline = this.client.multi();
      pipeline.incr(fullKey);
      pipeline.pexpire(fullKey, ttl, "NX");
      pipeline.pttl(fullKey);
      pipeline.pttl(blockedKey);
      const results = await pipeline.exec();

      if (!results) throw new Error("redis pipeline exec returned null");

      // results = [[err, val], ...]
      const totalHits = Number(results[0][1] ?? 0);
      const ttlRemainingMs = Number(results[2][1] ?? 0);
      const blockedTtlMs = Number(results[3][1] ?? -2);

      let isBlocked = blockedTtlMs > 0;
      let timeToBlockExpire = isBlocked ? blockedTtlMs : 0;

      if (totalHits > limit && !isBlocked) {
        // Premier dépassement : poser la clé "blocked" avec TTL = blockDuration.
        const dur = blockDuration > 0 ? blockDuration : ttl;
        await this.client.set(blockedKey, "1", "PX", dur);
        isBlocked = true;
        timeToBlockExpire = dur;
      }

      return {
        totalHits,
        timeToExpire: Math.max(0, ttlRemainingMs),
        isBlocked,
        timeToBlockExpire,
      };
    } catch (err) {
      // Erreur Redis transitoire → fallback in-memory pour cette requête,
      // sans incrémenter à nouveau le compteur Redis.
      this.logger.debug(
        `redis throttler increment failed (fallback): ${
          err instanceof Error ? err.message : err
        }`,
      );
      this.isAvailable = false;
      if (this.options.failClosed) {
        return {
          totalHits: limit + 1,
          timeToExpire: ttl,
          isBlocked: true,
          timeToBlockExpire: blockDuration > 0 ? blockDuration : ttl,
        };
      }
      return this.fallback.increment(
        key,
        ttl,
        limit,
        blockDuration,
        _throttlerName,
      );
    }
  }

  /** Ferme proprement la connexion ioredis. */
  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        // ignore
      }
      this.client = null;
      this.isAvailable = false;
    }
  }
}

/**
 * Construit un `RedisThrottlerStorage` à partir des variables d'env.
 * Variables reconnues (par ordre de priorité) :
 *   - THROTTLER_REDIS_URL : URL complète (ex: redis://:pwd@host:6379/2)
 *   - REDIS_URL           : URL Redis générique (réutilisable)
 *   - REDIS_HOST/PORT/PASSWORD : composantes éclatées
 *   - THROTTLER_REDIS_REQUIRED=true : active le mode fail-closed
 */
export function createThrottlerStorageFromEnv(): RedisThrottlerStorage {
  const url = process.env.THROTTLER_REDIS_URL || process.env.REDIS_URL;
  const failClosed = process.env.THROTTLER_REDIS_REQUIRED === "true";
  return new RedisThrottlerStorage({
    url: url || undefined,
    failClosed,
  });
}
