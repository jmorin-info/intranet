// =============================================================================
// OMNITECH Security Intranet — Import Caramel WordPress dump
// Parse cara_posts, cara_terms, cara_term_taxonomy, cara_term_relationships
// from a raw MariaDB SQL dump and create WikiPage entries via Prisma.
// Usage: tsx prisma/import-caramel-wp.ts
// =============================================================================

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// Load .env
// ---------------------------------------------------------------------------
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

const SQL_PATH = '/tmp/caramel-full.sql';

// ---------------------------------------------------------------------------
// SQL value parser — handles escaped quotes, backslash escapes, nested parens
// ---------------------------------------------------------------------------

function extractSqlValues(row: string): string[] {
  const values: string[] = [];
  let current = '';
  let inString = false;
  let quote = '';

  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (inString) {
      if (c === '\\') {
        // Backslash escape: take next char literally
        i++;
        if (i < row.length) {
          const next = row[i];
          if (next === 'n') current += '\n';
          else if (next === 'r') current += '\r';
          else if (next === 't') current += '\t';
          else if (next === '0') current += '\0';
          else current += next; // \' \" \\ etc.
        }
      } else if (c === quote) {
        if (i + 1 < row.length && row[i + 1] === quote) {
          current += c;
          i++; // doubled quote escape
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
// Split multi-row INSERT VALUES block into individual row strings
// Handles content that may contain '),' inside quoted strings
// ---------------------------------------------------------------------------

function splitInsertRows(valuesBlock: string): string[] {
  const rows: string[] = [];
  let current = '';
  let inString = false;
  let quote = '';
  let depth = 0;

  for (let i = 0; i < valuesBlock.length; i++) {
    const c = valuesBlock[i];

    if (inString) {
      current += c;
      if (c === '\\') {
        i++;
        if (i < valuesBlock.length) current += valuesBlock[i];
      } else if (c === quote) {
        if (i + 1 < valuesBlock.length && valuesBlock[i + 1] === quote) {
          current += valuesBlock[++i];
        } else {
          inString = false;
        }
      }
    } else {
      if (c === "'" || c === '"') {
        inString = true;
        quote = c;
        current += c;
      } else if (c === '(') {
        depth++;
        if (depth === 1) {
          current = ''; // start of a new row — don't include the opening paren
          continue;
        }
        current += c;
      } else if (c === ')') {
        depth--;
        if (depth === 0) {
          rows.push(current);
          current = '';
        } else {
          current += c;
        }
      } else {
        if (depth > 0) {
          current += c;
        }
        // chars between rows (commas, whitespace) are ignored when depth===0
      }
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// WordPress post structure (by column index in cara_posts)
// ---------------------------------------------------------------------------
// 0:ID 1:post_author 2:post_date 3:post_date_gmt 4:post_content 5:post_title
// 6:post_excerpt 7:post_status 8:comment_status 9:ping_status 10:post_password
// 11:post_name 12:to_ping 13:pinged 14:post_modified 15:post_modified_gmt
// 16:post_content_filtered 17:post_parent 18:guid 19:menu_order
// 20:post_type 21:post_mime_type 22:comment_count

interface WpPost {
  id: number;
  postContent: string;
  postTitle: string;
  postStatus: string;
  postName: string; // slug
  postType: string;
}

interface WpTerm {
  termId: number;
  name: string;
  slug: string;
}

interface WpTermTaxonomy {
  termTaxonomyId: number;
  termId: number;
  taxonomy: string;
}

interface WpTermRelationship {
  objectId: number;
  termTaxonomyId: number;
}

// ---------------------------------------------------------------------------
// Extract INSERT block for a specific table
// ---------------------------------------------------------------------------

function extractInsertBlock(sql: string, tableName: string): string | null {
  const pattern = new RegExp(
    `INSERT INTO \`${tableName}\` VALUES\\s*`,
    'i',
  );
  const match = pattern.exec(sql);
  if (!match) return null;

  const startIdx = match.index + match[0].length;
  // Find the end: semicolon at depth 0
  let inStr = false;
  let q = '';
  let depth = 0;
  for (let i = startIdx; i < sql.length; i++) {
    const c = sql[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === q) {
        if (i + 1 < sql.length && sql[i + 1] === q) { i++; continue; }
        inStr = false;
      }
    } else {
      if (c === "'" || c === '"') { inStr = true; q = c; }
      else if (c === '(') depth++;
      else if (c === ')') { depth--; }
      else if (c === ';' && depth <= 0) {
        return sql.slice(startIdx, i);
      }
    }
  }
  return sql.slice(startIdx);
}

// ---------------------------------------------------------------------------
// Parse tables
// ---------------------------------------------------------------------------

function parsePosts(sql: string): WpPost[] {
  const block = extractInsertBlock(sql, 'cara_posts');
  if (!block) return [];
  const rows = splitInsertRows(block);
  const posts: WpPost[] = [];
  for (const row of rows) {
    const vals = extractSqlValues(row);
    if (vals.length < 23) continue;
    posts.push({
      id: parseInt(vals[0]) || 0,
      postContent: vals[4],
      postTitle: vals[5],
      postStatus: vals[7],
      postName: vals[11],
      postType: vals[20],
    });
  }
  return posts;
}

function parseTerms(sql: string): WpTerm[] {
  const block = extractInsertBlock(sql, 'cara_terms');
  if (!block) return [];
  const rows = splitInsertRows(block);
  return rows.map((row) => {
    const vals = extractSqlValues(row);
    return {
      termId: parseInt(vals[0]) || 0,
      name: vals[1] ?? '',
      slug: vals[2] ?? '',
    };
  });
}

function parseTermTaxonomy(sql: string): WpTermTaxonomy[] {
  const block = extractInsertBlock(sql, 'cara_term_taxonomy');
  if (!block) return [];
  const rows = splitInsertRows(block);
  return rows.map((row) => {
    const vals = extractSqlValues(row);
    return {
      termTaxonomyId: parseInt(vals[0]) || 0,
      termId: parseInt(vals[1]) || 0,
      taxonomy: vals[2] ?? '',
    };
  });
}

function parseTermRelationships(sql: string): WpTermRelationship[] {
  const block = extractInsertBlock(sql, 'cara_term_relationships');
  if (!block) return [];
  const rows = splitInsertRows(block);
  return rows.map((row) => {
    const vals = extractSqlValues(row);
    return {
      objectId: parseInt(vals[0]) || 0,
      termTaxonomyId: parseInt(vals[1]) || 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Build category map: postId -> category name
// ---------------------------------------------------------------------------

function buildCategoryMap(
  terms: WpTerm[],
  taxonomies: WpTermTaxonomy[],
  relationships: WpTermRelationship[],
): Map<number, string> {
  // termId -> term name
  const termNameMap = new Map<number, string>();
  for (const t of terms) termNameMap.set(t.termId, t.name);

  // termTaxonomyId -> term name (only for taxonomy='category')
  const ttIdToName = new Map<number, string>();
  for (const tt of taxonomies) {
    if (tt.taxonomy === 'category') {
      const name = termNameMap.get(tt.termId);
      if (name) ttIdToName.set(tt.termTaxonomyId, name);
    }
  }

  // objectId (post ID) -> category name (first category found)
  const map = new Map<number, string>();
  for (const rel of relationships) {
    const catName = ttIdToName.get(rel.termTaxonomyId);
    if (catName && !map.has(rel.objectId)) {
      map.set(rel.objectId, catName);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// HTML entity decoder (no external dependency)
// ---------------------------------------------------------------------------

function decodeHtmlEntities(str: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
    '&#039;': "'", '&apos;': "'", '&#8217;': '\u2019', '&#8216;': '\u2018',
    '&#8220;': '\u201C', '&#8221;': '\u201D', '&#8211;': '\u2013',
    '&#8212;': '\u2014', '&#8230;': '\u2026', '&nbsp;': ' ',
    '&eacute;': '\u00E9', '&egrave;': '\u00E8', '&ecirc;': '\u00EA',
    '&agrave;': '\u00E0', '&acirc;': '\u00E2', '&ocirc;': '\u00F4',
    '&ucirc;': '\u00FB', '&ugrave;': '\u00F9', '&iuml;': '\u00EF',
    '&ccedil;': '\u00E7', '&Eacute;': '\u00C9', '&Egrave;': '\u00C8',
    '&rsquo;': '\u2019', '&lsquo;': '\u2018', '&rdquo;': '\u201D',
    '&ldquo;': '\u201C', '&ndash;': '\u2013', '&mdash;': '\u2014',
    '&hellip;': '\u2026', '&laquo;': '\u00AB', '&raquo;': '\u00BB',
  };
  let result = str;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.split(entity).join(char);
  }
  // Numeric entities: &#123; or &#x1A;
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  result = result.replace(/&#(\d+);/g, (_, dec) =>
    String.fromCharCode(parseInt(dec, 10)),
  );
  return result;
}

// ---------------------------------------------------------------------------
// Clean WordPress HTML content
// ---------------------------------------------------------------------------

const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr',
  'ul', 'ol', 'li', 'a', 'img', 'strong', 'b', 'em', 'i',
  'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote', 'div', 'span', 'figure', 'figcaption',
]);

function cleanHtml(html: string): string {
  let content = html;

  // Remove WordPress shortcodes: [shortcode attr="val"]...[/shortcode] and [shortcode /]
  content = content.replace(/\[\/[^\]]+\]/g, ''); // closing shortcodes first
  content = content.replace(/\[[^\]]+\]/g, '');    // opening/self-closing shortcodes

  // Strip disallowed HTML tags but keep their content
  content = content.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/g, (match, tagName) => {
    const tag = tagName.toLowerCase();
    if (ALLOWED_TAGS.has(tag)) return match;
    return ''; // strip the tag, keep surrounding text
  });

  // Remove HTML comments
  content = content.replace(/<!--[\s\S]*?-->/g, '');

  // Decode HTML entities
  content = decodeHtmlEntities(content);

  // Normalize whitespace (collapse multiple blank lines)
  content = content.replace(/(\r\n|\r)/g, '\n');
  content = content.replace(/\n{3,}/g, '\n\n');
  content = content.trim();

  return content;
}

// ---------------------------------------------------------------------------
// Slug helpers
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
    console.warn(`  [WARN] RAG indexing failed for "${title}", continuing...`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`[import-caramel-wp] Reading ${SQL_PATH}...`);
  const sql = readFileSync(SQL_PATH, 'utf-8');
  console.log(`[import-caramel-wp] SQL file loaded (${(sql.length / 1024 / 1024).toFixed(1)} MB)`);

  // 1. Parse all relevant tables
  const allPosts = parsePosts(sql);
  console.log(`[import-caramel-wp] Total rows in cara_posts: ${allPosts.length}`);

  const terms = parseTerms(sql);
  console.log(`[import-caramel-wp] Terms: ${terms.length}`);

  const taxonomies = parseTermTaxonomy(sql);
  console.log(`[import-caramel-wp] Term taxonomies: ${taxonomies.length}`);

  const relationships = parseTermRelationships(sql);
  console.log(`[import-caramel-wp] Term relationships: ${relationships.length}`);

  // 2. Filter: post_type IN ('post','page') AND post_status = 'publish'
  const filtered = allPosts.filter(
    (p) =>
      (p.postType === 'post' || p.postType === 'page') &&
      p.postStatus === 'publish',
  );
  console.log(`[import-caramel-wp] Filtered (post/page + publish): ${filtered.length}`);

  if (filtered.length === 0) {
    console.log('[import-caramel-wp] Nothing to import.');
    return;
  }

  // 3. Build category map
  const categoryMap = buildCategoryMap(terms, taxonomies, relationships);
  const categoriesUsed = new Set<string>();

  // 4. Find first SUPER_ADMIN
  const admin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true, email: true },
  });
  if (!admin) {
    throw new Error('No SUPER_ADMIN found. Run seed first.');
  }
  console.log(`[import-caramel-wp] Author: ${admin.email}`);

  // 5. Import
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const post of filtered) {
    try {
      const title = decodeHtmlEntities(post.postTitle || 'Sans titre');
      const slug = post.postName || toSlug(title);
      const content = cleanHtml(post.postContent);
      const category = categoryMap.get(post.id) || 'Caramel';
      categoriesUsed.add(category);

      // Idempotent: skip if slug exists
      const existing = await prisma.wikiPage.findUnique({ where: { slug } });
      if (existing) {
        console.log(`  [SKIP] "${title}" (slug: ${slug})`);
        skipped++;
        continue;
      }

      const page = await prisma.wikiPage.create({
        data: {
          title,
          slug,
          content,
          category,
          authorId: admin.id,
          isPublished: true,
          visibility: 'PUBLIC',
        },
      });

      await indexInRag(page.id, page.title, page.content);
      console.log(`  [OK] "${title}" [${category}]`);
      created++;
    } catch (err: any) {
      console.error(`  [ERR] post ID ${post.id}: ${err.message}`);
      errors++;
    }
  }

  // 6. Summary
  console.log('\n========================================');
  console.log('[import-caramel-wp] DONE');
  console.log(`  Created:  ${created}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Errors:   ${errors}`);
  console.log(`  Categories: ${[...categoriesUsed].sort().join(', ')}`);
  console.log('========================================');
}

main()
  .catch((e) => {
    console.error('[import-caramel-wp] Fatal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
