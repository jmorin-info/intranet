/**
 * RAG Evaluation Runner (P1.6.2)
 * Exécute le gold set contre le pipeline RAG et calcule les métriques retrieval.
 *
 * Usage:
 *   DATABASE_URL=... OLLAMA_URL=... tsx tests/rag/evaluation/run-eval.ts \
 *     --mode=hybrid --k=5 --output=reports/eval.json
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

// --- CLI args ---
const MODE = (process.argv.find(a => a.startsWith('--mode='))?.split('=')[1] || 'hybrid') as 'lexical' | 'vector' | 'hybrid';
const K = parseInt(process.argv.find(a => a.startsWith('--k='))?.split('=')[1] || '5');
const OUTPUT = process.argv.find(a => a.startsWith('--output='))?.split('=')[1] || `reports/eval-${Date.now()}.json`;
const GOLD_SET = process.argv.find(a => a.startsWith('--gold-set='))?.split('=')[1] || 'tests/rag/gold-set/gold-set-v1.0.json';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || 'bge-m3';
const SIMILARITY_THRESHOLD = parseFloat(process.env.VECTOR_SIMILARITY_THRESHOLD || '0.3');

// --- Metrics ---

function recallAtK(retrievedIds: string[], expectedTypes: string[], retrievedTypes: string[], k: number): number {
  if (expectedTypes.length === 0) return 1.0; // edge case: no expected → pass
  const topK = retrievedTypes.slice(0, k);
  const hits = expectedTypes.filter(t => topK.includes(t));
  return hits.length / expectedTypes.length;
}

function meanReciprocalRank(retrievedTypes: string[], expectedTypes: string[]): number {
  if (expectedTypes.length === 0) return 1.0;
  for (let i = 0; i < retrievedTypes.length; i++) {
    if (expectedTypes.includes(retrievedTypes[i])) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

function termCoverage(snippets: string[], mustContain: string[]): number {
  if (mustContain.length === 0) return 1.0;
  const allText = snippets.join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const hits = mustContain.filter(term =>
    allText.includes(term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  );
  return hits.length / mustContain.length;
}

// --- Search functions ---

async function getEmbedding(text: string): Promise<number[]> {
  const resp = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
  });
  if (!resp.ok) throw new Error(`Ollama ${resp.status}`);
  const data = (await resp.json()) as { embedding: number[] };
  return data.embedding;
}

async function vectorSearch(query: string, limit: number): Promise<any[]> {
  const embedding = await getEmbedding(query);
  const embStr = `[${embedding.join(',')}]`;
  return prisma.$queryRawUnsafe(`
    SELECT id, "sourceType", "sourceId", metadata, LEFT(content, 200) as snippet,
           1 - (embedding <=> '${embStr}'::vector) AS similarity
    FROM "RagChunk"
    WHERE embedding IS NOT NULL AND 1 - (embedding <=> '${embStr}'::vector) >= ${SIMILARITY_THRESHOLD}
    ORDER BY embedding <=> '${embStr}'::vector
    LIMIT ${limit}
  `);
}

async function lexicalSearch(query: string, limit: number): Promise<any[]> {
  const terms = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/\W+/).filter(t => t.length >= 3).slice(0, 8);
  if (terms.length === 0) return [];
  const where = terms.map(t => `content ILIKE '%${t}%'`).join(' OR ');
  return prisma.$queryRawUnsafe(`
    SELECT id, "sourceType", "sourceId", metadata, LEFT(content, 200) as snippet
    FROM "RagChunk"
    WHERE ${where}
    LIMIT ${limit}
  `);
}

async function hybridSearch(query: string, limit: number): Promise<any[]> {
  const [lex, vec] = await Promise.all([
    lexicalSearch(query, limit * 2),
    vectorSearch(query, limit * 2),
  ]);
  // RRF fusion
  const scores = new Map<string, { score: number; result: any }>();
  const k = 60;
  lex.forEach((r, idx) => {
    const key = r.id;
    scores.set(key, { score: (scores.get(key)?.score ?? 0) + 1 / (k + idx + 1), result: r });
  });
  vec.forEach((r, idx) => {
    const key = r.id;
    const existing = scores.get(key);
    if (existing) existing.score += 1 / (k + idx + 1);
    else scores.set(key, { score: 1 / (k + idx + 1), result: r });
  });
  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.result);
}

// --- Main ---

interface QuestionResult {
  questionId: string;
  question: string;
  retrievedSourceTypes: string[];
  retrievedSnippets: string[];
  metrics: {
    recallAt5: number;
    mrr: number;
    termCoverage: number;
  };
  latencyMs: number;
  passed: boolean;
}

async function main() {
  console.log(`=== RAG Eval — mode=${MODE}, k=${K} ===\n`);

  const goldSet = JSON.parse(readFileSync(GOLD_SET, 'utf-8'));
  const questions = goldSet.questions;
  console.log(`Gold set: ${goldSet.version} (${questions.length} questions)\n`);

  const results: QuestionResult[] = [];
  let totalRecall = 0;
  let totalMRR = 0;
  let totalTermCov = 0;
  let passed = 0;

  for (const q of questions) {
    const start = Date.now();

    let retrieved: any[];
    try {
      if (MODE === 'lexical') retrieved = await lexicalSearch(q.question, K);
      else if (MODE === 'vector') retrieved = await vectorSearch(q.question, K);
      else retrieved = await hybridSearch(q.question, K);
    } catch (err) {
      console.error(`  ❌ ${q.id}: ${(err as Error).message}`);
      results.push({
        questionId: q.id, question: q.question,
        retrievedSourceTypes: [], retrievedSnippets: [],
        metrics: { recallAt5: 0, mrr: 0, termCoverage: 0 },
        latencyMs: Date.now() - start, passed: false,
      });
      continue;
    }

    const latencyMs = Date.now() - start;
    const retrievedTypes = retrieved.map((r: any) => r.sourceType);
    const snippets = retrieved.map((r: any) => r.snippet || '');

    const recall = recallAtK([], q.expectedSourceTypes, retrievedTypes, K);
    const mrr = meanReciprocalRank(retrievedTypes, q.expectedSourceTypes);
    const tc = termCoverage(snippets, q.mustContainTerms);
    const questionPassed = (q.expectedSourceTypes.length === 0) ? (retrieved.length === 0 || recall < 0.5) : (recall >= 0.5 && tc >= 0.5);

    totalRecall += recall;
    totalMRR += mrr;
    totalTermCov += tc;
    if (questionPassed) passed++;

    results.push({
      questionId: q.id, question: q.question,
      retrievedSourceTypes: retrievedTypes,
      retrievedSnippets: snippets.map(s => s.slice(0, 100)),
      metrics: { recallAt5: recall, mrr, termCoverage: tc },
      latencyMs, passed: questionPassed,
    });

    const status = questionPassed ? '✅' : '❌';
    console.log(`  ${status} ${q.id} [${q.category}] recall=${recall.toFixed(2)} mrr=${mrr.toFixed(2)} tc=${tc.toFixed(2)} ${latencyMs}ms`);
  }

  const n = questions.length;
  const aggregate = {
    mode: MODE,
    k: K,
    goldSetVersion: goldSet.version,
    totalQuestions: n,
    passRate: passed / n,
    meanRecallAt5: totalRecall / n,
    meanMRR: totalMRR / n,
    meanTermCoverage: totalTermCov / n,
    p50LatencyMs: results.map(r => r.latencyMs).sort((a, b) => a - b)[Math.floor(n / 2)],
    p95LatencyMs: results.map(r => r.latencyMs).sort((a, b) => a - b)[Math.floor(n * 0.95)],
  };

  console.log(`\n=== RÉSULTATS AGRÉGÉS ===`);
  console.log(`Mode: ${MODE} | K: ${K}`);
  console.log(`Pass rate: ${(aggregate.passRate * 100).toFixed(1)}%`);
  console.log(`Mean Recall@${K}: ${aggregate.meanRecallAt5.toFixed(3)}`);
  console.log(`Mean MRR: ${aggregate.meanMRR.toFixed(3)}`);
  console.log(`Mean Term Coverage: ${aggregate.meanTermCoverage.toFixed(3)}`);
  console.log(`Latency p50: ${aggregate.p50LatencyMs}ms | p95: ${aggregate.p95LatencyMs}ms`);

  // Save output
  const outputDir = join(process.cwd(), OUTPUT.split('/').slice(0, -1).join('/'));
  mkdirSync(outputDir, { recursive: true });
  const report = { runId: `eval-${Date.now()}`, timestamp: new Date().toISOString(), aggregate, results };
  writeFileSync(join(process.cwd(), OUTPUT), JSON.stringify(report, null, 2));
  console.log(`\nRapport sauvegardé: ${OUTPUT}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
