import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { ConflictException } from "@nestjs/common";

/** Fail-closed global lease; bounded job deadline is shorter than its expiry. */
export async function acquireReindexLease(durationMs: number): Promise<() => Promise<void>> {
  const options = { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0, retryStrategy: () => null, connectTimeout: 3_000, commandTimeout: 3_000 };
  const client = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, options)
    : new Redis({ ...options, host: process.env.REDIS_HOST || "127.0.0.1", port: Number(process.env.REDIS_PORT || 6379), password: process.env.REDIS_PASSWORD || undefined });
  // Never log connection strings / passwords through Redis error events.
  client.on("error", () => {});
  const token = randomUUID();
  const key = "omnitech:rag:reindex:v1";
  try {
    await client.connect();
    if (await client.set(key, token, "PX", durationMs + 60_000, "NX") !== "OK") throw new ConflictException("A RAG reindex is already running");
    return async () => {
      try {
        await client.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, key, token);
      } finally { client.disconnect(); }
    };
  } catch (error) {
    client.disconnect();
    if (error instanceof ConflictException) throw error;
    throw new Error("RAG reindex lock unavailable; no indexing started");
  }
}
