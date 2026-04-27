/**
 * Item 30 — Collecteur de paires (query, positive, negatives) pour fine-tuning futur.
 *
 * Extrait du log RAG de production un dataset JSONL au format Sentence-Transformers
 * triplet : { "query": "...", "positive": "...", "negatives": ["...", "..."] }
 *
 * Heuristique de positif : on prend les chunks "cliques" (RagQueryLog avec
 * `rating = 1` ou `feedback` JSON `{ helpful: true }`). Les chunks "negatifs"
 * sont les autres chunks du meme top-K qui n'ont pas ete utilises.
 *
 * Sans clicks explicites (premiers mois en prod), on prend comme positif le
 * chunk de plus haut score quand le rating est positif (proxy raisonnable).
 *
 * Sortie : `storage/rag-finetuning/pairs-YYYYMMDD.jsonl`
 *
 * Usage :
 *   pnpm ts-node scripts/rag/collect-pairs.ts [--since=2026-04-01] [--min-rating=1] [--dry-run]
 *
 * Pre-requis : avoir > N (typ. 5000) paires de qualite avant de declencher
 * un fine-tuning. Voir docs/rag/FINE_TUNING_PLAN.md.
 */

import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ---------- CLI args ----------
function arg(name: string, fallback?: string): string | undefined {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!found) return fallback;
  return found.split("=").slice(1).join("=");
}

const SINCE_RAW = arg("since"); // ISO date (YYYY-MM-DD)
const MIN_RATING = parseInt(arg("min-rating", "1") ?? "1", 10);
const DRY_RUN = process.argv.includes("--dry-run");
const OUT_DIR = arg("out-dir", "storage/rag-finetuning") ?? "storage/rag-finetuning";

interface Pair {
  query: string;
  positive: string;
  negatives: string[];
  meta: {
    queryId: string;
    rating: number;
    sourceTypes: string[];
    createdAt: string;
  };
}

async function main() {
  console.log("=== RAG Pairs Collector — Item 30 ===");
  console.log(
    `since=${SINCE_RAW ?? "(none)"} | min-rating=${MIN_RATING} | dry-run=${DRY_RUN}`,
  );

  const since = SINCE_RAW ? new Date(SINCE_RAW) : undefined;

  // 1. Recuperer les RagQueryLog avec rating positif
  const where: Record<string, unknown> = {
    rating: { gte: MIN_RATING },
  };
  if (since) where.createdAt = { gte: since };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logs: any[] = await (prisma as any).ragQueryLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10000,
  });
  console.log(`Found ${logs.length} positive rated queries`);

  const pairs: Pair[] = [];

  for (const log of logs) {
    if (!log.query || typeof log.query !== "string") continue;

    // 2. Pour chaque log, retrouver les chunks utilises au moment de la query.
    // Heuristique simple : on rejoue le retrieval lexical sur RagChunk
    // (vrai proxy aurait besoin de stocker le top-K dans RagQueryLog —
    // a faire dans une iteration future).
    const tokens = tokenize(log.query);
    if (tokens.length === 0) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidates: any[] = await (prisma as any).ragChunk.findMany({
      where: {
        OR: tokens.map((t: string) => ({
          content: { contains: t, mode: "insensitive" },
        })),
      },
      take: 20,
      select: { id: true, content: true, sourceType: true },
    });

    if (candidates.length === 0) continue;

    // Score local TF puis tri
    const scored = candidates
      .map((c: { id: string; content: string; sourceType: string }) => {
        const lc = c.content.toLowerCase();
        let score = 0;
        for (const t of tokens) {
          let idx = 0;
          while ((idx = lc.indexOf(t, idx)) !== -1) {
            score += 3;
            idx += t.length;
          }
        }
        return { c, score };
      })
      .sort((a, b) => b.score - a.score);

    const top = scored.slice(0, 6);
    if (top.length < 2) continue;

    // Positive = top-1, negatives = top 2..5
    pairs.push({
      query: log.query,
      positive: top[0].c.content.slice(0, 1500),
      negatives: top.slice(1, 5).map((s) => s.c.content.slice(0, 1500)),
      meta: {
        queryId: log.id,
        rating: log.rating ?? 0,
        sourceTypes: top.slice(0, 5).map((s) => s.c.sourceType),
        createdAt: (log.createdAt as Date).toISOString(),
      },
    });
  }

  console.log(`Generated ${pairs.length} pairs`);

  if (DRY_RUN) {
    console.log("Dry run — sample first 2 pairs:");
    for (const p of pairs.slice(0, 2)) {
      console.log(JSON.stringify(p, null, 2));
    }
    return;
  }

  // 3. Ecrire le fichier JSONL
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const outPath = path.resolve(OUT_DIR, `pairs-${date}.jsonl`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const lines = pairs.map((p) => JSON.stringify(p)).join("\n");
  fs.writeFileSync(outPath, lines + "\n", "utf8");

  console.log(`Wrote ${pairs.length} lines to ${outPath}`);
  console.log("");
  console.log(
    `Total cumulatif estime : verifier la taille de ${OUT_DIR}/ pour decider du seuil 5k pour le fine-tuning.`,
  );
}

function tokenize(s: string): string[] {
  const stop = new Set([
    "le",
    "la",
    "les",
    "un",
    "une",
    "des",
    "du",
    "de",
    "et",
    "en",
    "au",
    "aux",
    "ce",
    "ces",
    "qui",
    "que",
    "quoi",
    "dont",
    "ou",
    "est",
    "sur",
    "par",
    "pour",
    "dans",
    "avec",
    "comme",
    "mais",
  ]);
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length >= 3 && !stop.has(w))
    .slice(0, 8);
}

main()
  .catch((err) => {
    console.error("FATAL", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
