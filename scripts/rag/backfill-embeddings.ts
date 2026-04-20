/**
 * Backfill embeddings pour les chunks existants (P1.2.3).
 * Utilise Ollama bge-m3 pour générer les embeddings de tous les RagChunks
 * dont la colonne embedding est NULL.
 *
 * Usage :
 *   pnpm ts-node scripts/rag/backfill-embeddings.ts [--batch=50] [--rate-limit=10] [--dry-run]
 */

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'bge-m3';
const BATCH_SIZE = parseInt(process.argv.find(a => a.startsWith('--batch='))?.split('=')[1] || '50');
const RATE_LIMIT = parseInt(process.argv.find(a => a.startsWith('--rate-limit='))?.split('=')[1] || '10');
const DRY_RUN = process.argv.includes('--dry-run');

// Minimal Prisma setup
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

interface ChunkRow {
  id: string;
  content: string;
}

async function getEmbedding(text: string): Promise<number[]> {
  const resp = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, prompt: text }),
  });
  if (!resp.ok) throw new Error(`Ollama ${resp.status}: ${resp.statusText}`);
  const data = (await resp.json()) as { embedding?: number[] };
  if (!data.embedding || data.embedding.length !== 1024) {
    throw new Error(`Invalid embedding: ${data.embedding?.length ?? 0} dims`);
  }
  return data.embedding;
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log(`=== RAG Embedding Backfill ===`);
  console.log(`Model: ${MODEL} | Batch: ${BATCH_SIZE} | Rate limit: ${RATE_LIMIT}/s | Dry run: ${DRY_RUN}`);
  console.log('');

  // Count total chunks needing embedding
  const totalNull: number = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS c FROM "RagChunk" WHERE embedding IS NULL`
  ).then((r: any) => r[0]?.c ?? 0);

  const totalAll: number = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS c FROM "RagChunk"`
  ).then((r: any) => r[0]?.c ?? 0);

  console.log(`Chunks à traiter: ${totalNull} / ${totalAll} total`);
  if (totalNull === 0) {
    console.log('✅ Tous les chunks ont déjà un embedding.');
    process.exit(0);
  }

  let processed = 0;
  let errors = 0;
  const startTime = Date.now();
  const delayMs = 1000 / RATE_LIMIT;

  while (true) {
    // Fetch next batch of unembedded chunks
    const chunks: ChunkRow[] = await prisma.$queryRawUnsafe(`
      SELECT id, content FROM "RagChunk"
      WHERE embedding IS NULL
      ORDER BY "indexedAt" ASC
      LIMIT ${BATCH_SIZE}
    `);

    if (chunks.length === 0) break;

    for (const chunk of chunks) {
      try {
        if (DRY_RUN) {
          console.log(`[DRY] Would embed chunk ${chunk.id} (${chunk.content.length} chars)`);
        } else {
          const embedding = await getEmbedding(chunk.content);
          const embStr = `[${embedding.join(',')}]`;
          await prisma.$executeRawUnsafe(
            `UPDATE "RagChunk" SET embedding = $1::vector WHERE id = $2`,
            embStr,
            chunk.id,
          );
        }
        processed++;

        // Progress
        if (processed % 10 === 0) {
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = processed / elapsed;
          const eta = Math.round((totalNull - processed) / rate);
          console.log(`  [${processed}/${totalNull}] ${rate.toFixed(1)} chunks/s | ETA: ${eta}s`);
        }

        // Rate limiting
        await sleep(delayMs);
      } catch (err) {
        errors++;
        console.error(`  ❌ Chunk ${chunk.id}: ${(err as Error).message}`);
        if (errors > 10) {
          console.error('Trop d\'erreurs, arrêt.');
          process.exit(1);
        }
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log(`=== Résultat ===`);
  console.log(`✅ ${processed} chunks embeddés en ${elapsed}s`);
  console.log(`❌ ${errors} erreurs`);

  // Vérification finale
  const remaining: number = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS c FROM "RagChunk" WHERE embedding IS NULL`
  ).then((r: any) => r[0]?.c ?? 0);
  console.log(`Chunks sans embedding restants: ${remaining}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
