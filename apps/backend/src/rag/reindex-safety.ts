import { readFileSync } from "node:fs";

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("RAG operation cancelled");
}

export function positiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

/** Swap is deliberately excluded: it cannot hold a resident inference model safely. */
export function availableMemoryBytes(): number {
  try {
    const mem = readFileSync("/proc/meminfo", "utf8").match(/^MemAvailable:\s+(\d+) kB$/m);
    if (!mem) return 0;
    let available = Number(mem[1]) * 1024;
    try {
      const limit = readFileSync("/sys/fs/cgroup/memory.max", "utf8").trim();
      if (limit !== "max") {
        const used = Number(readFileSync("/sys/fs/cgroup/memory.current", "utf8").trim());
        available = Math.min(available, Math.max(0, Number(limit) - used));
      }
    } catch { /* non-cgroup / cgroup v1: Linux MemAvailable remains the guard */ }
    return Number.isFinite(available) ? available : 0;
  } catch { return 0; }
}

export function assertBackgroundCapacity(semantic: boolean): void {
  if (process.env.RAG_MAINTENANCE_MODE === "true") throw new Error("RAG maintenance mode enabled");
  const floorMiB = semantic ? 2048 : 256;
  const configured = positiveInt(process.env.RAG_REINDEX_MIN_AVAILABLE_MB, floorMiB, 65536);
  const required = Math.max(floorMiB, configured) * 1024 * 1024;
  if (availableMemoryBytes() < required) throw new Error(`RAG capacity guard: at least ${required / 1024 / 1024} MiB MemAvailable required`);
}
