// =============================================================================
// OMNITECH Security Intranet — Import CSV générique
// Lit un fichier CSV et crée des WikiPage via Prisma
// Usage : tsx prisma/import-csv.ts <fichier.csv>
// Colonnes attendues : title, content (ou body), category (optionnel)
// Séparateur auto-détecté (`;` ou `,`)
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
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// CSV Parser (no external lib)
// ---------------------------------------------------------------------------

function detectSeparator(headerLine: string): string {
  const semicolons = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return semicolons >= commas ? ';' : ',';
}

function parseCsvLine(line: string, sep: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === sep) {
        values.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }
  }
  values.push(current.trim());
  return values;
}

function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];

  const sep = detectSeparator(lines[0]);
  const headers = parseCsvLine(lines[0], sep).map((h) => h.toLowerCase().trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i], sep);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// RAG indexing
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
    console.error('Usage : tsx prisma/import-csv.ts <fichier.csv>');
    process.exit(1);
  }

  const absPath = resolve(filePath);
  console.log(`📂 Lecture de ${absPath}...`);
  const raw = readFileSync(absPath, 'utf-8');
  const rows = parseCsv(raw);
  console.log(`📄 ${rows.length} ligne(s) trouvée(s)`);

  if (rows.length === 0) {
    console.log('Aucune ligne à importer.');
    return;
  }

  // Validate headers
  const sampleKeys = Object.keys(rows[0]);
  const hasTitle = sampleKeys.includes('title') || sampleKeys.includes('titre');
  const hasContent = sampleKeys.includes('content') || sampleKeys.includes('body') || sampleKeys.includes('contenu');
  if (!hasTitle || !hasContent) {
    console.error(`❌ Colonnes manquantes. Trouvées : [${sampleKeys.join(', ')}]`);
    console.error('   Attendues : title (ou titre) + content (ou body/contenu) + category (optionnel)');
    process.exit(1);
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

  for (const row of rows) {
    const title = row['title'] || row['titre'] || 'Sans titre';
    const content = row['content'] || row['body'] || row['contenu'] || '';
    const category = row['category'] || row['categorie'] || row['cat'] || undefined;
    const slug = toSlug(title);

    if (!slug) {
      console.log(`  ⏭ Skip (slug vide) : "${title}"`);
      skipped++;
      continue;
    }

    const existing = await prisma.wikiPage.findUnique({ where: { slug } });
    if (existing) {
      console.log(`  ⏭ Skip (existe déjà) : ${slug}`);
      skipped++;
      continue;
    }

    const page = await prisma.wikiPage.create({
      data: {
        title,
        slug,
        content,
        category: category || null,
        authorId: admin.id,
        isPublished: true,
        visibility: 'PUBLIC',
      },
    });

    await indexInRag(page.id, page.title, page.content);
    console.log(`  ✅ Créé : "${title}" [${category ?? 'sans catégorie'}]`);
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
