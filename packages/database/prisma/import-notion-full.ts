// =============================================================================
// OMNITECH Security Intranet — Import Notion (Full)
// Parcourt recursif de /tmp/notion-export/, importe .md + .csv dans WikiPage + RAG
// Usage : tsx prisma/import-notion-full.ts
// =============================================================================

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
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

const EXPORT_DIR = '/tmp/notion-export';

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

/** Remove Notion UUID suffix from filename, e.g. "My Page abc123def456.md" -> "My Page" */
function cleanNotionTitle(filename: string): string {
  const name = basename(filename, extname(filename));
  // Remove trailing hex UUID (Notion appends 32-char hex id, sometimes with spaces)
  return name.replace(/\s+[0-9a-f]{20,32}$/i, '').trim() || name;
}

// ---------------------------------------------------------------------------
// Category mapping from path
// ---------------------------------------------------------------------------

function resolveCategory(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');

  if (normalized.includes('Notes & Tips') || normalized.includes('Notes &amp; Tips')) {
    return 'Admin SYS \u2014 Notes & Tips';
  }
  if (normalized.includes('/Scripts/') || normalized.includes('/Scripts ')) {
    return 'Admin SYS \u2014 Scripts';
  }
  if (normalized.includes('Les proc\u00e9dures \u00e0 jours') || normalized.includes('procedures a jours')) {
    return 'Admin SYS \u2014 Proc\u00e9dures';
  }
  if (normalized.includes('AdminSYS')) {
    return 'Admin SYS';
  }
  if (normalized.includes('Priv\u00e9 et partag\u00e9') || normalized.includes('Prive et partage')) {
    return 'Notes internes';
  }
  return 'Import Notion';
}

function resolveCsvCategory(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes('Notes & Tips') || normalized.includes('Notes &amp; Tips')) {
    return 'Admin SYS \u2014 Notes & Tips';
  }
  if (normalized.includes('/Scripts ') || normalized.includes('/Scripts/')) {
    return 'Admin SYS \u2014 Scripts';
  }
  if (normalized.includes('Les proc\u00e9dures \u00e0 jours') || normalized.includes('procedures a jours')) {
    return 'Admin SYS \u2014 Proc\u00e9dures';
  }
  return 'Admin SYS';
}

// ---------------------------------------------------------------------------
// Skip logic
// ---------------------------------------------------------------------------

function shouldSkipMd(filePath: string, content: string, title: string): string | null {
  // Skip People directory
  if (filePath.replace(/\\/g, '/').includes('/People/')) {
    return 'People (skip)';
  }
  // Skip "Sans titre"
  const lower = title.toLowerCase();
  if (lower === 'sans titre' || lower === 'untitled') {
    return 'Sans titre';
  }
  // Skip empty files (<50 chars of actual content)
  if (content.length < 50) {
    return 'contenu trop court';
  }
  // Skip Bloc-notes (template pages with no real content)
  if (lower === 'bloc-notes') {
    // Check if it's just the default template
    const stripped = content.replace(/[#\s\-<>\/aside✏️]|Votre espace priv.*/gi, '').trim();
    if (stripped.length < 30) {
      return 'Bloc-notes vide';
    }
  }
  return null;
}

function shouldSkipCsv(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  // Skip People CSVs
  if (normalized.includes('people')) return true;
  // Skip _all.csv duplicates (keep only the base CSV)
  if (normalized.endsWith('_all.csv')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Markdown -> HTML (basic, no external lib)
// ---------------------------------------------------------------------------

function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const htmlLines: string[] = [];
  let inList = false;
  let inOrderedList = false;
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
        if (inOrderedList) { htmlLines.push('</ol>'); inOrderedList = false; }
        const lang = line.trim().slice(3).trim();
        inCodeBlock = true;
        htmlLines.push(lang ? `<pre><code class="language-${escapeHtml(lang)}">` : '<pre><code>');
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
    if (inOrderedList && !/^\s*\d+\.\s/.test(line)) {
      htmlLines.push('</ol>');
      inOrderedList = false;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      htmlLines.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
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

    // Ordered list items
    if (/^\s*\d+\.\s+(.+)/.test(line)) {
      if (!inOrderedList) { htmlLines.push('<ol>'); inOrderedList = true; }
      const content = line.replace(/^\s*\d+\.\s+/, '');
      htmlLines.push(`<li>${inlineFormat(content)}</li>`);
      continue;
    }

    // Blockquote
    if (/^>\s?(.*)/.test(line)) {
      const content = line.replace(/^>\s?/, '');
      htmlLines.push(`<blockquote>${inlineFormat(content)}</blockquote>`);
      continue;
    }

    // Strip Notion <aside> tags (callouts)
    if (line.trim().startsWith('<aside>') || line.trim().startsWith('</aside>')) {
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
  if (inOrderedList) htmlLines.push('</ol>');
  if (inCodeBlock) htmlLines.push('</code></pre>');

  return htmlLines.join('\n');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineFormat(text: string): string {
  let result = text;
  // Images (before links so ![...](...) is not caught by link regex)
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
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
// CSV -> HTML table
// ---------------------------------------------------------------------------

function csvToHtmlTable(csvContent: string): string {
  // Handle BOM
  const clean = csvContent.replace(/^\uFEFF/, '');
  const lines = clean.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return '';

  // Simple CSV parse (handles quoted fields)
  function parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    return fields;
  }

  const headers = parseCsvLine(lines[0]);
  let html = '<table>\n<thead><tr>';
  for (const h of headers) {
    html += `<th>${escapeHtml(h)}</th>`;
  }
  html += '</tr></thead>\n<tbody>\n';

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    html += '<tr>';
    for (let j = 0; j < headers.length; j++) {
      html += `<td>${escapeHtml(cols[j] || '')}</td>`;
    }
    html += '</tr>\n';
  }
  html += '</tbody>\n</table>';
  return html;
}

// ---------------------------------------------------------------------------
// Recursive file discovery
// ---------------------------------------------------------------------------

interface ImportFile {
  path: string;
  type: 'md' | 'csv';
  category: string;
  title: string;
}

function discoverFiles(dir: string): ImportFile[] {
  const results: ImportFile[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      results.push(...discoverFiles(fullPath));
    } else {
      const ext = extname(entry).toLowerCase();
      if (ext === '.md') {
        const title = cleanNotionTitle(entry);
        const category = resolveCategory(fullPath);
        results.push({ path: fullPath, type: 'md', category, title });
      } else if (ext === '.csv') {
        if (!shouldSkipCsv(fullPath)) {
          const title = cleanNotionTitle(entry) + ' (tableau)';
          const category = resolveCsvCategory(fullPath);
          results.push({ path: fullPath, type: 'csv', category, title });
        }
      }
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
  console.log(`📂 Scan de ${EXPORT_DIR}...`);

  if (!existsSync(EXPORT_DIR)) {
    console.error(`❌ Dossier introuvable : ${EXPORT_DIR}`);
    process.exit(1);
  }

  const files = discoverFiles(EXPORT_DIR);
  const mdFiles = files.filter(f => f.type === 'md');
  const csvFiles = files.filter(f => f.type === 'csv');
  console.log(`📄 ${mdFiles.length} fichier(s) .md, ${csvFiles.length} fichier(s) .csv trouvé(s)`);

  // Find first SUPER_ADMIN
  const admin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true, email: true },
  });
  if (!admin) {
    throw new Error("Aucun SUPER_ADMIN trouvé. Lancez le seed principal d'abord.");
  }
  console.log(`👤 Auteur : ${admin.email}`);

  let created = 0;
  let skipped = 0;
  let ragIndexed = 0;
  const errors: string[] = [];

  // --- Process .md files ---
  console.log('\n--- Markdown files ---');
  for (const file of mdFiles) {
    let content: string;
    try {
      content = readFileSync(file.path, 'utf-8');
    } catch {
      console.log(`  ⏭ Skip (lecture impossible) : ${file.path}`);
      skipped++;
      continue;
    }

    const skipReason = shouldSkipMd(file.path, content, file.title);
    if (skipReason) {
      console.log(`  ⏭ Skip (${skipReason}) : ${file.title}`);
      skipped++;
      continue;
    }

    const slug = toSlug(file.title);
    if (!slug) {
      console.log(`  ⏭ Skip (slug vide) : ${file.path}`);
      skipped++;
      continue;
    }

    // Idempotent: skip if slug already exists
    const existing = await prisma.wikiPage.findUnique({ where: { slug } });
    if (existing) {
      console.log(`  ⏭ Skip (existe déjà) : ${slug}`);
      skipped++;
      continue;
    }

    const htmlContent = markdownToHtml(content);

    try {
      const page = await prisma.wikiPage.create({
        data: {
          title: file.title,
          slug,
          content: htmlContent,
          category: file.category,
          authorId: admin.id,
          isPublished: true,
          visibility: 'PUBLIC',
        },
      });

      await indexInRag(page.id, page.title, page.content);
      ragIndexed++;
      console.log(`  ✅ Créé : "${file.title}" [${file.category}]`);
      created++;
    } catch (err: any) {
      errors.push(`${file.title}: ${err.message}`);
      console.error(`  ❌ Erreur : "${file.title}" — ${err.message}`);
    }
  }

  // --- Process .csv files ---
  console.log('\n--- CSV files (tableaux récapitulatifs) ---');
  for (const file of csvFiles) {
    let content: string;
    try {
      content = readFileSync(file.path, 'utf-8');
    } catch {
      console.log(`  ⏭ Skip (lecture impossible) : ${file.path}`);
      skipped++;
      continue;
    }

    if (content.length < 50) {
      console.log(`  ⏭ Skip (contenu trop court) : ${file.title}`);
      skipped++;
      continue;
    }

    const slug = toSlug(file.title);
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

    const htmlTable = csvToHtmlTable(content);
    const htmlContent = `<h2>${escapeHtml(file.title)}</h2>\n${htmlTable}`;

    try {
      const page = await prisma.wikiPage.create({
        data: {
          title: file.title,
          slug,
          content: htmlContent,
          category: file.category,
          authorId: admin.id,
          isPublished: true,
          visibility: 'PUBLIC',
        },
      });

      await indexInRag(page.id, page.title, page.content);
      ragIndexed++;
      console.log(`  ✅ Créé : "${file.title}" [${file.category}]`);
      created++;
    } catch (err: any) {
      errors.push(`${file.title}: ${err.message}`);
      console.error(`  ❌ Erreur : "${file.title}" — ${err.message}`);
    }
  }

  // --- Bilan ---
  console.log('\n' + '='.repeat(60));
  console.log(`📊 BILAN IMPORT NOTION`);
  console.log(`   Créés  : ${created}`);
  console.log(`   Ignorés: ${skipped}`);
  console.log(`   RAG    : ${ragIndexed} page(s) indexée(s)`);
  if (errors.length > 0) {
    console.log(`   Erreurs: ${errors.length}`);
    for (const e of errors) console.log(`     - ${e}`);
  }
  console.log('='.repeat(60));
}

main()
  .catch((e) => {
    console.error('❌ Erreur fatale :', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
