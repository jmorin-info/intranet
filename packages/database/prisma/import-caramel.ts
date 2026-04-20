// =============================================================================
// OMNITECH Security Intranet — Import Caramel (Wiki interne legacy)
// Lit un fichier .sql ou .json et crée des WikiPage via Prisma
// Usage : tsx prisma/import-caramel.ts <fichier.json|fichier.sql>
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface CaramelArticle {
  title: string;
  content: string;
  category?: string;
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

function parseJson(raw: string): CaramelArticle[] {
  const data = JSON.parse(raw);
  const items: unknown[] = Array.isArray(data) ? data : (data.articles ?? data.pages ?? data.data ?? []);
  return items.map((item: any) => ({
    title: item.title ?? item.titre ?? 'Sans titre',
    content: item.content ?? item.contenu ?? item.body ?? item.html ?? '',
    category: item.category ?? item.categorie ?? item.cat ?? undefined,
  }));
}

function parseSql(raw: string): CaramelArticle[] {
  const articles: CaramelArticle[] = [];
  // Match INSERT ... VALUES (...) statements
  const insertRegex = /INSERT\s+INTO\s+\S+\s*(?:\([^)]*\))?\s*VALUES\s*\(([^;]+)\)/gi;
  let match: RegExpExecArray | null;

  while ((match = insertRegex.exec(raw)) !== null) {
    const valuesBlock = match[1];
    // Split on ),( to handle multi-row inserts
    const rows = valuesBlock.split(/\)\s*,\s*\(/);
    for (const row of rows) {
      const cleaned = row.replace(/^\s*\(/, '').replace(/\)\s*$/, '');
      const values = extractSqlValues(cleaned);
      if (values.length >= 2) {
        articles.push({
          title: values[0] ?? 'Sans titre',
          content: values[1] ?? '',
          category: values[2] ?? undefined,
        });
      }
    }
  }
  return articles;
}

function extractSqlValues(row: string): string[] {
  const values: string[] = [];
  let current = '';
  let inString = false;
  let quote = '';

  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (inString) {
      if (c === quote) {
        if (i + 1 < row.length && row[i + 1] === quote) {
          current += c;
          i++; // skip escaped quote
        } else {
          inString = false;
        }
      } else {
        current += c;
      }
    } else {
      if (c === "'" || c === '"') {
        inString = true;
        quote = c;
      } else if (c === ',') {
        values.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }
  }
  values.push(current.trim());
  return values.map((v) => (v === 'NULL' ? '' : v));
}

// ---------------------------------------------------------------------------
// RAG indexing (mirrors reindex-rag.ts logic)
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 200;

function chunkContent(content: string): string[] {
  if (!content) return [];
  const clean = content.replace(/\s+/g, ' ').trim();
  if (clean.length <= CHUNK_SIZE) return [clean];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + CHUNK_SIZE, clean.length);
    chunks.push(clean.slice(start, end));
    if (end >= clean.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

async function indexInRag(sourceId: string, title: string, content: string): Promise<void> {
  try {
    const chunks = chunkContent(`${title}\n\n${content}`);
    await (prisma as any).ragChunk.deleteMany({ where: { sourceType: 'WIKI', sourceId } });
    for (let i = 0; i < chunks.length; i++) {
      await (prisma as any).ragChunk.create({
        data: {
          sourceType: 'WIKI',
          sourceId,
          chunkIndex: i,
          content: chunks[i],
          tokenCount: Math.round(chunks[i].length / 4),
          metadata: { title },
        },
      });
    }
  } catch {
    console.warn(`  ⚠ RAG indexing failed for "${title}", continuing...`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage : tsx prisma/import-caramel.ts <fichier.json|fichier.sql>');
    process.exit(1);
  }

  const absPath = resolve(filePath);
  console.log(`📂 Lecture de ${absPath}...`);
  const raw = readFileSync(absPath, 'utf-8');

  const isJson = absPath.endsWith('.json');
  const articles: CaramelArticle[] = isJson ? parseJson(raw) : parseSql(raw);
  console.log(`📄 ${articles.length} article(s) trouvé(s) (format ${isJson ? 'JSON' : 'SQL'})`);

  if (articles.length === 0) {
    console.log('Aucun article à importer.');
    return;
  }

  // Find first SUPER_ADMIN
  const admin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true, email: true },
  });
  if (!admin) {
    throw new Error('Aucun SUPER_ADMIN trouvé. Lancez le seed principal d\'abord.');
  }
  console.log(`👤 Auteur : ${admin.email}`);

  let created = 0;
  let skipped = 0;

  for (const article of articles) {
    const slug = toSlug(article.title);
    const existing = await prisma.wikiPage.findUnique({ where: { slug } });
    if (existing) {
      console.log(`  ⏭ Skip (existe déjà) : ${slug}`);
      skipped++;
      continue;
    }

    const page = await prisma.wikiPage.create({
      data: {
        title: article.title,
        slug,
        content: article.content,
        category: article.category || null,
        authorId: admin.id,
        isPublished: true,
        visibility: 'PUBLIC',
      },
    });

    await indexInRag(page.id, page.title, page.content);
    console.log(`  ✅ Créé : "${article.title}" [${article.category ?? 'sans catégorie'}]`);
    created++;
  }

  console.log(`\n📊 Résultat : ${created} créé(s), ${skipped} ignoré(s)`);
}

main()
  .catch((e) => {
    console.error('❌ Erreur :', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
