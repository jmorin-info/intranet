import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import Redis from "ioredis";
import { AppMetricsService } from "../../health/app-metrics.service";

/**
 * Central Redis cache service.
 *
 * Implements the cache-aside pattern with graceful failover: if Redis is
 * unreachable, cache operations silently no-op (get returns null, set is a
 * best-effort, wrap falls through to the factory function).
 *
 * Connection is configured via env vars: REDIS_HOST, REDIS_PORT, REDIS_PASSWORD.
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client: Redis | null = null;
  private isAvailable = false;

  constructor(@Optional() private readonly metrics?: AppMetricsService) {}

  async onModuleInit() {
    try {
      this.client = new Redis({
        host: process.env.REDIS_HOST || "localhost",
        port: parseInt(process.env.REDIS_PORT || "6379", 10),
        password: process.env.REDIS_PASSWORD || undefined,
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => {
          // Back off aggressively; if Redis is down we just stop trying.
          if (times > 3) return null;
          return Math.min(times * 500, 2000);
        },
      });

      this.client.on("error", (err) => {
        if (this.isAvailable) {
          this.logger.warn(`Redis error: ${err.message}`);
        }
        this.isAvailable = false;
      });

      this.client.on("ready", () => {
        this.isAvailable = true;
        this.logger.log("Cache service connected to Redis");
      });

      this.client.on("end", () => {
        this.isAvailable = false;
      });

      await this.client.connect();
    } catch (err) {
      this.isAvailable = false;
      this.logger.warn(
        `Redis unavailable, cache disabled: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        // ignore
      }
      this.client = null;
    }
  }

  /** Retrieve a JSON-serialized value from cache. Returns null on miss or failure. */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable || !this.client) return null;
    try {
      const raw = await this.client.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      this.logger.debug(
        `cache.get(${key}) failed: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  /** Set a JSON-serialized value with optional TTL (seconds). */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (!this.isAvailable || !this.client) return;
    try {
      const payload = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, payload, "EX", ttlSeconds);
      } else {
        await this.client.set(key, payload);
      }
    } catch (err) {
      this.logger.debug(
        `cache.set(${key}) failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Delete a single key or multiple keys matching a glob pattern (e.g. "stats:dashboard:*").
   * Uses SCAN iteration to avoid blocking Redis on large keyspaces.
   */
  async del(pattern: string): Promise<void> {
    if (!this.isAvailable || !this.client) return;
    try {
      if (
        !pattern.includes("*") &&
        !pattern.includes("?") &&
        !pattern.includes("[")
      ) {
        await this.client.del(pattern);
        return;
      }

      const stream = this.client.scanStream({ match: pattern, count: 100 });
      const pipeline = this.client.pipeline();
      let queued = 0;

      await new Promise<void>((resolve, reject) => {
        stream.on("data", (keys: string[]) => {
          if (keys && keys.length > 0) {
            for (const k of keys) {
              pipeline.del(k);
              queued++;
            }
          }
        });
        stream.on("end", () => resolve());
        stream.on("error", (err) => reject(err));
      });

      if (queued > 0) {
        await pipeline.exec();
      }
    } catch (err) {
      this.logger.debug(
        `cache.del(${pattern}) failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Cache-aside helper. Returns the cached value if present, otherwise calls
   * `fn`, stores the result, and returns it. On any Redis failure, `fn` is
   * still invoked directly so the caller always gets a correct result.
   */
  async wrap<T>(
    key: string,
    ttlSeconds: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    let cached: T | null = null;
    try {
      cached = await this.get<T>(key);
    } catch {
      this.metrics?.incCacheOp("wrap", "error");
      cached = null;
    }
    if (cached !== null) {
      this.metrics?.incCacheOp("wrap", "hit");
      return cached;
    }
    this.metrics?.incCacheOp("wrap", "miss");
    const fresh = await fn();
    // Fire-and-forget the cache write; failure should never block the response.
    void this.set<T>(key, fresh, ttlSeconds);
    return fresh;
  }
}
