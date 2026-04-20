// =============================================================================
// OMNITECH Security Intranet — Import Notion
// Parcourt un export Notion (dossier de .md) et crée des WikiPage
// Usage : tsx prisma/import-notion.ts <dossier-export-notion>
// =============================================================================

import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, basename, dirname, extname, join } from 'path';

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

/** Notion export filenames often have a UUID suffix, e.g. "My Page abc123def.md" */
function cleanNotionTitle(filename: string): string {
  const name = basename(filename, extname(filename));
  // Remove trailing hex UUID (Notion appends 32-char hex id)
  return name.replace(/\s+[0-9a-f]{32}$/i, '').trim() || name;
}

// ---------------------------------------------------------------------------
// Markdown → HTML (basic, no external lib)
// ---------------------------------------------------------------------------

function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const htmlLines: string[] = [];
  let inList = false;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Fenced code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        htmlLines.push('</code></pre>');
        inCodeBlock = false;
      } else {
        if (inList) { htmlLines.push('</ul>'); inList = false; }
        inCodeBlock = true;
        htmlLines.push('<pre><code>');
      }
      continue;
    }
    if (inCodeBlock) {
      htmlLines.push(escapeHtml(line));
      continue;
    }

    // Close list if current line is not a list item
    if (inList && !/^\s*[-*]\s/.test(line)) {
      htmlLines.push('</ul>');
      inList = false;
    }

    // Headings
    if (/^######\s+(.+)/.test(line)) {
      htmlLines.push(`<h6>${inlineFormat(line.replace(/^######\s+/, ''))}</h6>`);
      continue;
    }
    if (/^#####\s+(.+)/.test(line)) {
      htmlLines.push(`<h5>${inlineFormat(line.replace(/^#####\s+/, ''))}</h5>`);
      continue;
    }
    if (/^####\s+(.+)/.test(line)) {
      htmlLines.push(`<h4>${inlineFormat(line.replace(/^####\s+/, ''))}</h4>`);
      continue;
    }
    if (/^###\s+(.+)/.test(line)) {
      htmlLines.push(`<h3>${inlineFormat(line.replace(/^###\s+/, ''))}</h3>`);
      continue;
    }
    if (/^##\s+(.+)/.test(line)) {
      htmlLines.push(`<h2>${inlineFormat(line.replace(/^##\s+/, ''))}</h2>`);
      continue;
    }
    if (/^#\s+(.+)/.test(line)) {
      htmlLines.push(`<h1>${inlineFormat(line.replace(/^#\s+/, ''))}</h1>`);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      htmlLines.push('<hr>');
      continue;
    }

    // Unordered list items
    if (/^\s*[-*]\s+(.+)/.test(line)) {
      if (!inList) { htmlLines.push('<ul>'); inList = true; }
      const content = line.replace(/^\s*[-*]\s+/, '');
      htmlLines.push(`<li>${inlineFormat(content)}</li>`);
      continue;
    }

    // Blockquote
    if (/^>\s?(.*)/.test(line)) {
      const content = line.replace(/^>\s?/, '');
      htmlLines.push(`<blockquote>${inlineFormat(content)}</blockquote>`);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      continue;
    }

    // Paragraph
    htmlLines.push(`<p>${inlineFormat(line)}</p>`);
  }

  if (inList) htmlLines.push('</ul>');
  if (inCodeBlock) htmlLines.push('</code></pre>');

  return htmlLines.join('\n');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineFormat(text: string): string {
  let result = text;
  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');
  // Italic
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  result = result.replace(/_(.+?)_/g, '<em>$1</em>');
  // Inline code
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return result;
}

// ---------------------------------------------------------------------------
// Recursive .md discovery
// ---------------------------------------------------------------------------

interface NotionFile {
  path: string;
  category: string;
}

function findMarkdownFiles(dir: string, rootDir: string): NotionFile[] {
  const results: NotionFile[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...findMarkdownFiles(fullPath, rootDir));
    } else if (extname(entry).toLowerCase() === '.md') {
      // Category = parent folder name relative to root, or 'Import Notion' if at root
      const parentDir = dirname(fullPath);
      const category =
        parentDir === rootDir
          ? 'Import Notion'
          : cleanNotionTitle(basename(parentDir));
      results.push({ path: fullPath, category });
    }
  }
  return results;
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
  const dirPath = process.argv[2];
  if (!dirPath) {
    console.error('Usage : tsx prisma/import-notion.ts <dossier-export-notion>');
    process.exit(1);
  }

  const absDir = resolve(dirPath);
  console.log(`📂 Scan de ${absDir}...`);
  const files = findMarkdownFiles(absDir, absDir);
  console.log(`📄 ${files.length} fichier(s) .md trouvé(s)`);

  if (files.length === 0) {
    console.log('Aucun fichier .md à importer.');
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

  for (const file of files) {
    const title = cleanNotionTitle(basename(file.path));
    const slug = toSlug(title);

    if (!slug) {
      console.log(`  ⏭ Skip (slug vide) : ${file.path}`);
      skipped++;
      continue;
    }

    const existing = await prisma.wikiPage.findUnique({ where: { slug } });
    if (existing) {
      console.log(`  ⏭ Skip (existe déjà) : ${slug}`);
      skipped++;
      continue;
    }

    const mdContent = readFileSync(file.path, 'utf-8');
    const htmlContent = markdownToHtml(mdContent);

    const page = await prisma.wikiPage.create({
      data: {
        title,
        slug,
        content: htmlContent,
        category: file.category,
        authorId: admin.id,
        isPublished: true,
        visibility: 'PUBLIC',
      },
    });

    await indexInRag(page.id, page.title, page.content);
    console.log(`  ✅ Créé : "${title}" [${file.category}]`);
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
