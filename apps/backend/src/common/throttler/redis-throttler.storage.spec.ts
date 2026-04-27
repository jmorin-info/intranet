/**
 * Tests unitaires `RedisThrottlerStorage` (item 15 — Vague A v1.1).
 *
 * Stratégie : on ne dépend pas de `ioredis-mock` (non installé). On substitue
 * un client minimaliste implémentant `multi/incr/pexpire/pttl/exec/scan/del/
 * set/ping/quit/on/connect` avec une Map JS, ce qui suffit largement à
 * valider la logique de comptage / blocage / fallback.
 *
 * Couverture exigée par la spec :
 *   - un IP burst dépasse le rate limit (totalHits > limit ⇒ isBlocked=true)
 *   - le compteur survit à un "restart" (= recréation du storage qui partage
 *     la même Map, simulant la persistence Redis cross-instance)
 *   - fallback in-memory transparent quand Redis est down
 *   - mode fail-closed quand THROTTLER_REDIS_REQUIRED=true
 */
import { Logger } from "@nestjs/common";
import { RedisThrottlerStorage } from "./redis-throttler.storage";

/**
 * Mock minimal d'ioredis suffisant pour notre storage. Toutes les méthodes
 * sont synchrones-async (Promise.resolve) pour fidéliser ioredis.
 */
class FakeRedis {
  data = new Map<string, { value: string; expiresAt: number }>();
  blockedSets: string[] = [];
  events = new Map<string, Array<(...a: any[]) => void>>();
  closed = false;
  shouldFailMulti = false;

  on(evt: string, fn: (...a: any[]) => void): this {
    const arr = this.events.get(evt) || [];
    arr.push(fn);
    this.events.set(evt, arr);
    return this;
  }

  emit(evt: string, ...args: any[]): void {
    (this.events.get(evt) || []).forEach((fn) => fn(...args));
  }

  async connect(): Promise<void> {
    this.emit("ready");
  }

  async ping(): Promise<string> {
    if (this.closed) throw new Error("connection closed");
    return "PONG";
  }

  async quit(): Promise<void> {
    this.closed = true;
    this.emit("end");
  }

  private isExpired(entry: { expiresAt: number } | undefined): boolean {
    if (!entry) return true;
    return entry.expiresAt > 0 && entry.expiresAt < Date.now();
  }

  private getRaw(key: string): string | null {
    const e = this.data.get(key);
    if (!e || this.isExpired(e)) {
      this.data.delete(key);
      return null;
    }
    return e.value;
  }

  multi() {
    const ops: Array<["incr" | "pexpire" | "pttl" | "set", any[]]> = [];
    const self = this;
    return {
      incr(key: string) {
        ops.push(["incr", [key]]);
        return this;
      },
      pexpire(key: string, ms: number, mode?: string) {
        ops.push(["pexpire", [key, ms, mode]]);
        return this;
      },
      pttl(key: string) {
        ops.push(["pttl", [key]]);
        return this;
      },
      async exec(): Promise<Array<[Error | null, any]> | null> {
        if (self.shouldFailMulti) throw new Error("redis pipeline failed");
        const out: Array<[Error | null, any]> = [];
        for (const [cmd, args] of ops) {
          if (cmd === "incr") {
            const key = args[0] as string;
            const cur = self.getRaw(key);
            const next = (cur ? parseInt(cur, 10) : 0) + 1;
            const existing = self.data.get(key);
            self.data.set(key, {
              value: String(next),
              expiresAt:
                existing && !self.isExpired(existing)
                  ? existing.expiresAt
                  : 0,
            });
            out.push([null, next]);
          } else if (cmd === "pexpire") {
            const [key, ms, mode] = args as [string, number, string?];
            const e = self.data.get(key);
            if (!e) {
              out.push([null, 0]);
            } else if (mode === "NX" && e.expiresAt > 0) {
              out.push([null, 0]);
            } else {
              e.expiresAt = Date.now() + ms;
              self.data.set(key, e);
              out.push([null, 1]);
            }
          } else if (cmd === "pttl") {
            const e = self.data.get(args[0] as string);
            if (!e || self.isExpired(e)) out.push([null, -2]);
            else if (!e.expiresAt) out.push([null, -1]);
            else out.push([null, e.expiresAt - Date.now()]);
          }
        }
        return out;
      },
    };
  }

  async set(
    key: string,
    value: string,
    px?: string,
    ttl?: number,
  ): Promise<"OK"> {
    const expiresAt = px === "PX" && ttl ? Date.now() + ttl : 0;
    this.data.set(key, { value, expiresAt });
    return "OK";
  }

  async scan(
    cursor: string,
    _match: string,
    pattern: string,
    _count: string,
    _n: number,
  ): Promise<[string, string[]]> {
    // Implémentation naïve : retourne tout en une passe (cursor "0").
    const re = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
    const keys = Array.from(this.data.keys()).filter((k) => re.test(k));
    return ["0", keys];
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) if (this.data.delete(k)) count++;
    return count;
  }
}

describe("RedisThrottlerStorage", () => {
  let storage: RedisThrottlerStorage;
  let fake: FakeRedis;

  beforeEach(() => {
    // Silence logs.
    jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    jest.spyOn(Logger.prototype, "debug").mockImplementation(() => {});
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => {});

    storage = new RedisThrottlerStorage({ disableAutoConnect: true });
    fake = new FakeRedis();
    storage._setClientForTests(fake as any);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await storage.close();
  });

  it("incrémente le compteur sur chaque hit", async () => {
    const key = "ip:127.0.0.1:Foo.bar:default";
    const r1 = await storage.increment(key, 60_000, 5, 30_000, "default");
    expect(r1.totalHits).toBe(1);
    expect(r1.isBlocked).toBe(false);

    const r2 = await storage.increment(key, 60_000, 5, 30_000, "default");
    expect(r2.totalHits).toBe(2);
    expect(r2.isBlocked).toBe(false);
  });

  it("burst : passe à isBlocked=true dès que totalHits > limit", async () => {
    const key = "ip:1.2.3.4:Foo.bar:default";
    // limit = 3 → 4ème hit doit déclencher le blocage.
    const r1 = await storage.increment(key, 60_000, 3, 30_000, "default");
    const r2 = await storage.increment(key, 60_000, 3, 30_000, "default");
    const r3 = await storage.increment(key, 60_000, 3, 30_000, "default");
    expect(r3.isBlocked).toBe(false);
    const r4 = await storage.increment(key, 60_000, 3, 30_000, "default");
    expect(r4.isBlocked).toBe(true);
    expect(r4.totalHits).toBe(4);
    expect(r4.timeToBlockExpire).toBeGreaterThan(0);

    // Hits suivants : toujours bloqués (la clé blocked persiste).
    const r5 = await storage.increment(key, 60_000, 3, 30_000, "default");
    expect(r5.isBlocked).toBe(true);
    void r1;
    void r2;
  });

  it("compteur survit à un 'restart' (instance recréée, même Redis)", async () => {
    const key = "ip:5.5.5.5:Foo.bar:default";
    await storage.increment(key, 60_000, 3, 30_000, "default");
    await storage.increment(key, 60_000, 3, 30_000, "default");

    // Simule restart serveur : nouvelle instance de storage, même client Redis.
    const storage2 = new RedisThrottlerStorage({ disableAutoConnect: true });
    storage2._setClientForTests(fake as any);

    const r3 = await storage2.increment(key, 60_000, 3, 30_000, "default");
    expect(r3.totalHits).toBe(3); // ← compteur conservé !
    expect(r3.isBlocked).toBe(false);

    const r4 = await storage2.increment(key, 60_000, 3, 30_000, "default");
    expect(r4.totalHits).toBe(4);
    expect(r4.isBlocked).toBe(true);

    await storage2.close();
  });

  it("ping retourne 'redis' quand Redis est dispo", async () => {
    const ping = await storage.ping();
    expect(ping.ok).toBe(true);
    expect(ping.mode).toBe("redis");
    expect(ping.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("clearCounters supprime toutes les clés du préfixe", async () => {
    await storage.increment("k1", 60_000, 3, 0, "default");
    await storage.increment("k2", 60_000, 3, 0, "default");
    await storage.increment("k3", 60_000, 3, 0, "default");

    const { deleted } = await storage.clearCounters();
    expect(deleted).toBeGreaterThanOrEqual(3);

    const r = await storage.increment("k1", 60_000, 3, 0, "default");
    // Compteur réinitialisé à 1.
    expect(r.totalHits).toBe(1);
  });

  describe("fallback in-memory (Redis down)", () => {
    let downStorage: RedisThrottlerStorage;

    beforeEach(() => {
      // disableAutoConnect : pas de tentative de connexion réelle, donc
      // isAvailable=false → fallback in-memory transparent.
      downStorage = new RedisThrottlerStorage({ disableAutoConnect: true });
    });

    afterEach(async () => {
      await downStorage.close();
    });

    it("compte localement quand Redis est down (fail-open par défaut)", async () => {
      const r1 = await downStorage.increment("foo", 60_000, 3, 0, "default");
      const r2 = await downStorage.increment("foo", 60_000, 3, 0, "default");
      expect(r1.totalHits).toBe(1);
      expect(r2.totalHits).toBe(2);
    });

    it("ping retourne 'in-memory' quand Redis est down et fail-open", async () => {
      const ping = await downStorage.ping();
      expect(ping.ok).toBe(true);
      expect(ping.mode).toBe("in-memory");
    });

    it("fail-closed : ping=down et toutes les requêtes sont bloquées", async () => {
      const failClosed = new RedisThrottlerStorage({
        failClosed: true,
        disableAutoConnect: true,
      });
      const ping = await failClosed.ping();
      expect(ping.ok).toBe(false);
      expect(ping.mode).toBe("down");

      const r = await failClosed.increment("foo", 60_000, 3, 0, "default");
      expect(r.isBlocked).toBe(true);
      expect(r.totalHits).toBeGreaterThan(3);

      await failClosed.close();
    });
  });

  describe("erreur transitoire Redis", () => {
    it("bascule en fallback in-memory et continue de servir", async () => {
      // Premier hit OK via fake Redis.
      const r1 = await storage.increment("xkey", 60_000, 3, 0, "default");
      expect(r1.totalHits).toBe(1);

      // Simule erreur Redis : multi.exec throw.
      fake.shouldFailMulti = true;

      const r2 = await storage.increment("xkey", 60_000, 3, 0, "default");
      // Le compteur du fallback est indépendant → repart à 1.
      // L'important est qu'aucune exception ne remonte.
      expect(r2.totalHits).toBeGreaterThanOrEqual(1);
      expect(r2.isBlocked).toBe(false);
    });
  });
});
