// =============================================================================
// OMNITECH Security Intranet — RAG Reindex Script
// Indexes Wiki pages, Documents, and other content into RagChunk table
// =============================================================================

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env from project root if DATABASE_URL is not set
if (!process.env.DATABASE_URL) {
  try {
    const envPath = resolve(__dirname, '../../../.env');
    const envContent = readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* ignore */ }
}

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CHUNK_SIZE_CHARS = 2000;
const CHUNK_OVERLAP_CHARS = 200;

type SourceType = 'DOCUMENT' | 'WIKI' | 'PROCEDURE' | 'RUNBOOK' | 'FAQ';

function chunkContent(content: string): string[] {
  if (!content) return [];
  const clean = content.replace(/\s+/g, ' ').trim();
  if (clean.length <= CHUNK_SIZE_CHARS) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE_CHARS, clean.length);
    chunks.push(clean.slice(start, end));
    if (end >= clean.length) break;
    start = end - CHUNK_OVERLAP_CHARS;
  }
  return chunks;
}

async function indexSource(
  sourceType: SourceType,
  sourceId: string,
  content: string,
  metadata?: Record<string, unknown>,
): Promise<number> {
  const chunks = chunkContent(content);
  if (chunks.length === 0) return 0;

  // Purge old chunks for this source
  await (prisma as any).ragChunk.deleteMany({
    where: { sourceType, sourceId },
  });

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    await (prisma as any).ragChunk.create({
      data: {
        sourceType,
        sourceId,
        chunkIndex: i,
        content: chunk,
        tokenCount: Math.round(chunk.length / 4),
        metadata: metadata ?? undefined,
      },
    });
  }

  return chunks.length;
}

async function main() {
  console.log('RAG Reindex — start');

  const byType: Record<string, number> = {
    DOCUMENT: 0,
    WIKI: 0,
    PROCEDURE: 0,
    RUNBOOK: 0,
    FAQ: 0,
  };

  // Documents approved
  const docs = await (prisma as any).document.findMany({
    where: { status: 'APPROVED' },
    select: { id: true, title: true, description: true },
  }).catch(() => []);
  console.log(`  Documents APPROVED found: ${docs.length}`);
  for (const d of docs) {
    const text = [d.title, d.description].filter(Boolean).join('\n\n');
    byType.DOCUMENT += await indexSource('DOCUMENT', d.id, text, { title: d.title });
  }

  // Wiki pages published
  const wikis = await (prisma as any).wikiPage.findMany({
    where: { isPublished: true },
    select: { id: true, title: true, content: true },
  }).catch(() => []);
  console.log(`  Wiki pages published found: ${wikis.length}`);
  for (const w of wikis) {
    byType.WIKI += await indexSource('WIKI', w.id, `${w.title}\n\n${w.content ?? ''}`, {
      title: w.title,
    });
  }

  // Procedures
  const procedures = await (prisma as any).procedure?.findMany?.({
    select: { id: true, title: true, content: true },
  }).catch(() => []) ?? [];
  console.log(`  Procedures found: ${procedures.length}`);
  for (const p of procedures) {
    byType.PROCEDURE += await indexSource('PROCEDURE', p.id, `${p.title}\n\n${p.content ?? ''}`, {
      title: p.title,
    });
  }

  // Runbooks
  const runbooks = await (prisma as any).runbook?.findMany?.({
    select: { id: true, title: true, content: true },
  }).catch(() => []) ?? [];
  console.log(`  Runbooks found: ${runbooks.length}`);
  for (const r of runbooks) {
    byType.RUNBOOK += await indexSource('RUNBOOK', r.id, `${r.title}\n\n${r.content ?? ''}`, {
      title: r.title,
    });
  }

  // FAQ helpdesk
  const faqs = await (prisma as any).helpdeskFaq?.findMany?.({
    select: { id: true, question: true, answer: true },
  }).catch(() => []) ?? [];
  console.log(`  FAQ entries found: ${faqs.length}`);
  for (const f of faqs) {
    byType.FAQ += await indexSource('FAQ', f.id, `${f.question}\n\n${f.answer}`, {
      question: f.question,
    });
  }

  const total = Object.values(byType).reduce((a, b) => a + b, 0);

  // Also check news articles
  let newsCount = 0;
  try {
    const news = await (prisma as any).news?.findMany?.({
      where: { isPublished: true },
      select: { id: true, title: true, content: true },
    }) ?? [];
    console.log(`  News articles published found: ${news.length}`);
    for (const n of news) {
      newsCount += await indexSource('WIKI', n.id, `${n.title}\n\n${n.content ?? ''}`, {
        title: n.title,
        type: 'news',
      });
    }
  } catch {
    console.log('  News model not available, skipping.');
  }

  const grandTotal = total + newsCount;

  console.log('\n--- RAG Reindex Results ---');
  console.log(`  DOCUMENT: ${byType.DOCUMENT} chunks`);
  console.log(`  WIKI:     ${byType.WIKI} chunks`);
  console.log(`  PROCEDURE: ${byType.PROCEDURE} chunks`);
  console.log(`  RUNBOOK:  ${byType.RUNBOOK} chunks`);
  console.log(`  FAQ:      ${byType.FAQ} chunks`);
  if (newsCount > 0) console.log(`  NEWS:     ${newsCount} chunks`);
  console.log(`  TOTAL:    ${grandTotal} chunks`);

  // Final count verification
  const dbCount = await (prisma as any).ragChunk.count();
  console.log(`\n  RagChunk table total count: ${dbCount}`);
}

main()
  .catch((e) => {
    console.error('Reindex failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
