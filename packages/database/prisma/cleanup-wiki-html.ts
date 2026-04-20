// =============================================================================
// OMNITECH Security Intranet — Cleanup Wiki HTML (Caramel imports)
// Cleans up WordPress-imported HTML and consolidates categories
// Usage: npx tsx prisma/cleanup-wiki-html.ts
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
// Category renames
// ---------------------------------------------------------------------------

const CATEGORY_RENAMES: Record<string, string> = {
  'Non classé': 'Divers',
  'non classe': 'Divers',
  'INFO': 'Actualités Caramel',
  'Caramel': 'Divers',
  'Notes internes': 'Notes',
};

// ---------------------------------------------------------------------------
// HTML cleanup transformations
// ---------------------------------------------------------------------------

function cleanWikiHtml(content: string, pageTitle: string): string {
  let html = content;

  // 1. Normalize line endings: \r\n -> \n
  html = html.replace(/\r\n/g, '\n');
  html = html.replace(/\r/g, '\n');

  // 2. Remove WordPress shortcodes: [shortcode ...] and [/shortcode]
  html = html.replace(/\[\/[^\]]+\]/g, '');
  html = html.replace(/\[[^\]]+\]/g, '');

  // 3. Convert DokuWiki-style headings inside <strong> tags
  //    <strong>====== Title ======</strong> -> <h2>Title</h2>
  //    <strong>===== Title =====</strong> -> <h3>Title</h3>
  html = html.replace(/<strong>\s*={6}\s*(.*?)\s*={6}\s*<\/strong>/gi, '<h2>$1</h2>');
  html = html.replace(/<strong>\s*={5}\s*(.*?)\s*={5}\s*<\/strong>/gi, '<h3>$1</h3>');
  html = html.replace(/<strong>\s*={4}\s*(.*?)\s*={4}\s*<\/strong>/gi, '<h3>$1</h3>');

  // Also handle bare ====== markers (not inside <strong>)
  html = html.replace(/={6}\s*(.*?)\s*={6}/g, '<h2>$1</h2>');
  html = html.replace(/={5}\s*(.*?)\s*={5}/g, '<h3>$1</h3>');
  html = html.replace(/={4}\s*(.*?)\s*={4}/g, '<h3>$1</h3>');

  // 4. Remove all class="..." attributes
  html = html.replace(/\s+class="[^"]*"/gi, '');
  html = html.replace(/\s+class='[^']*'/gi, '');

  // 5. Remove style="..." except on tables/th/td where width or background is used
  html = html.replace(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)\s+style="([^"]*)"([^>]*?)>/gi,
    (match, tag, before, styleVal, after) => {
      const tagLower = tag.toLowerCase();
      // Keep style on table elements if they contain width or background
      if (['table', 'th', 'td', 'tr', 'col', 'colgroup'].includes(tagLower)) {
        const keepProps = styleVal
          .split(';')
          .map((p: string) => p.trim())
          .filter((p: string) => /^(width|min-width|max-width|background|background-color)\s*:/i.test(p));
        if (keepProps.length > 0) {
          return `<${tag}${before} style="${keepProps.join('; ')}"${after}>`;
        }
      }
      return `<${tag}${before}${after}>`;
    }
  );

  // 6. Remove <div> wrappers that are now empty of attributes (unwrap them)
  //    <div>content</div> -> content
  //    Handle nested cases by running multiple passes
  for (let i = 0; i < 5; i++) {
    const before = html;
    html = html.replace(/<div\s*>([\s\S]*?)<\/div>/gi, '$1');
    if (html === before) break;
  }

  // 7. Remove redundant <h1> if content matches the page title
  const titleNorm = pageTitle.trim().toLowerCase().replace(/\s+/g, ' ');
  html = html.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (match, inner) => {
    const innerNorm = inner.replace(/<[^>]*>/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (innerNorm === titleNorm) {
      return ''; // remove redundant h1
    }
    return match; // keep non-matching h1
  });

  // 8. Clean up &nbsp; — multiple &nbsp; or &nbsp; surrounded by spaces -> single space
  html = html.replace(/(&nbsp;\s*){2,}/gi, ' ');
  html = html.replace(/&nbsp;/gi, ' ');

  // 9. Remove style="list-style-type: none;" specifically (may have survived step 5)
  html = html.replace(/\s+style="list-style-type:\s*none;?\s*"/gi, '');

  // 10. Collapse multiple blank lines
  html = html.replace(/\n{3,}/g, '\n\n');

  // 11. Trim
  html = html.trim();

  return html;
}

// ---------------------------------------------------------------------------
// RAG reindex for a single page
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

async function reindexPage(pageId: string, title: string, content: string): Promise<void> {
  try {
    const chunks = chunkContent(`${title}\n\n${content}`);
    await (prisma as any).ragChunk.deleteMany({ where: { sourceType: 'WIKI', sourceId: pageId } });
    for (let i = 0; i < chunks.length; i++) {
      await (prisma as any).ragChunk.create({
        data: {
          sourceType: 'WIKI',
          sourceId: pageId,
          chunkIndex: i,
          content: chunks[i],
          tokenCount: Math.round(chunks[i].length / 4),
          metadata: { title },
        },
      });
    }
  } catch {
    console.warn(`  [WARN] RAG reindex failed for "${title}"`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('[cleanup-wiki-html] Starting HTML cleanup and category consolidation...\n');

  // 1. Load all WikiPages
  const pages = await prisma.wikiPage.findMany({
    select: { id: true, title: true, content: true, category: true, slug: true },
  });
  console.log(`[cleanup-wiki-html] Loaded ${pages.length} WikiPage(s)\n`);

  let cleaned = 0;
  let unchanged = 0;
  let categoriesRenamed = 0;

  for (const page of pages) {
    const newContent = cleanWikiHtml(page.content, page.title);
    const oldCategory = page.category ?? '';
    const newCategory = CATEGORY_RENAMES[oldCategory] ?? oldCategory;

    const contentChanged = newContent !== page.content;
    const categoryChanged = newCategory !== oldCategory;

    if (!contentChanged && !categoryChanged) {
      unchanged++;
      continue;
    }

    const updateData: Record<string, string> = {};
    if (contentChanged) updateData.content = newContent;
    if (categoryChanged) updateData.category = newCategory;

    await prisma.wikiPage.update({
      where: { id: page.id },
      data: updateData,
    });

    if (contentChanged) {
      await reindexPage(page.id, page.title, newContent);
      cleaned++;
      console.log(`  [CLEAN] "${page.title}" (slug: ${page.slug})`);
    }

    if (categoryChanged) {
      categoriesRenamed++;
      console.log(`  [CAT]   "${page.title}": "${oldCategory}" -> "${newCategory}"`);
    }

    if (!contentChanged && categoryChanged) {
      unchanged++; // content unchanged, only category renamed
    }
  }

  console.log('\n========================================');
  console.log('[cleanup-wiki-html] DONE');
  console.log(`  Total pages:        ${pages.length}`);
  console.log(`  Content cleaned:    ${cleaned}`);
  console.log(`  Content unchanged:  ${unchanged}`);
  console.log(`  Categories renamed: ${categoriesRenamed}`);
  console.log('========================================');
}

main()
  .catch((e) => {
    console.error('[cleanup-wiki-html] Fatal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
