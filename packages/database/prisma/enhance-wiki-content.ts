// =============================================================================
// OMNITECH Security Intranet — Enhance Wiki Content (post-traitement)
// Adds meta-descriptions, normalizes titles, enriches code blocks, reindexes RAG
// Usage: npx tsx prisma/enhance-wiki-content.ts
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
// 1. Strip HTML and extract excerpt (meta-description)
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractExcerpt(content: string, maxLen = 200): string {
  const plain = stripHtml(content);
  if (plain.length <= maxLen) return plain;
  // Cut at last word boundary before maxLen
  const truncated = plain.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 100 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

/** Check if content already has an excerpt comment */
function hasExcerpt(content: string): boolean {
  return /^<!--\s*excerpt:/.test(content.trim());
}

/** Inject excerpt as HTML comment at top of content */
function injectExcerpt(content: string, excerpt: string): string {
  return `<!-- excerpt: ${excerpt.replace(/--/g, '-')} -->\n${content}`;
}

// ---------------------------------------------------------------------------
// 2. Title normalization — Title Case with acronym preservation
// ---------------------------------------------------------------------------

const ACRONYMS = new Set([
  'AD', 'IT', 'VPN', 'VEEAM', 'ESET', 'MFA', 'LDAP', 'DNS', 'DHCP',
  'GPO', 'OU', 'CSV', 'PC', 'OS', 'CHRU', 'SFTP', 'HTTPS', 'HTTP',
  'SSL', 'TLS', 'SSH', 'RDP', 'NAS', 'SAN', 'RAID', 'SIEM', 'EDR',
  'SOC', 'RSSI', 'DSI', 'RGPD', 'CNIL', 'ANSSI', 'ISO', 'NTP',
  'ITSM', 'SLA', 'MDM', 'BYOD', 'E2E', 'PDF', 'USB', 'TOTP',
  'FIDO2', 'PGP', 'AES', 'NIST', 'REX', 'DPO', 'JIRA', 'SQL',
  'API', 'URL', 'IP', 'TCP', 'UDP', 'SNMP', 'SMTP', 'IMAP', 'POP',
  'RAM', 'CPU', 'GPU', 'SSD', 'HDD', 'LTO', 'SCSI', 'VMM', 'VM',
]);

/** French small words that stay lowercase in Title Case (unless first word) */
const SMALL_WORDS = new Set([
  'de', 'du', 'des', 'le', 'la', 'les', 'un', 'une',
  'et', 'ou', 'en', 'à', 'au', 'aux',
  'sur', 'sous', 'par', 'pour', 'avec', 'sans', 'dans',
  'a', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or',
]);

function isAllUpperCase(s: string): boolean {
  return s === s.toUpperCase() && s !== s.toLowerCase();
}

function normalizeTitle(title: string): string {
  const trimmed = title.trim();

  // Only transform titles that are fully uppercase (imported from Caramel)
  if (!isAllUpperCase(trimmed.replace(/[^a-zA-ZÀ-ÿ]/g, ''))) {
    return trimmed;
  }

  const words = trimmed.split(/\s+/);
  const result = words.map((word, idx) => {
    const upper = word.toUpperCase();

    // Check if it's a known acronym
    if (ACRONYMS.has(upper)) {
      return upper;
    }

    // Check for acronym-like patterns: 2-3 letter all-caps that aren't common words
    if (upper.length <= 3 && isAllUpperCase(word) && !SMALL_WORDS.has(word.toLowerCase())) {
      // Could be an acronym — keep uppercase if not a common French word
      const lower = word.toLowerCase();
      const commonShort = ['les', 'des', 'une', 'sur', 'par', 'pas', 'est', 'son', 'ses', 'ces', 'mes', 'tes', 'nos', 'vos'];
      if (!commonShort.includes(lower)) {
        return upper;
      }
    }

    const lower = word.toLowerCase();

    // Small words stay lowercase unless first word
    if (idx > 0 && SMALL_WORDS.has(lower)) {
      return lower;
    }

    // Title case: first letter uppercase, rest lowercase
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });

  return result.join(' ');
}

// ---------------------------------------------------------------------------
// 3. Enrich code blocks — detect and wrap PowerShell/Bash snippets
// ---------------------------------------------------------------------------

/** Detect if a text line looks like PowerShell */
function isPowerShell(text: string): boolean {
  return /\b(Get-|Set-|New-|Remove-|Import-|Export-|Invoke-|Add-|Enable-|Disable-|Start-|Stop-|Restart-)\w+/i.test(text)
    || /\$[A-Za-z_]\w*\s*=/.test(text)
    || /\b(param|function|foreach|ForEach-Object|Where-Object|Select-Object|Write-Host|Write-Output)\b/i.test(text)
    || /\bInstall-Module\b/i.test(text)
    || /\|\s*(Select|Where|ForEach|Sort|Group|Measure)-/i.test(text);
}

/** Detect if a text line looks like Bash */
function isBash(text: string): boolean {
  return /^#!/.test(text)
    || /\b(grep|awk|sed|chmod|chown|systemctl|apt|yum|dnf|curl|wget|echo|cat|ls|mkdir|cp|mv|rm)\b/.test(text)
    || /\|\s*(grep|awk|sed|sort|uniq|wc|head|tail|cut|tr)\b/.test(text)
    || /\b(if\s*\[|then|fi|done|do|while|for\s+\w+\s+in)\b/.test(text)
    || /^\s*export\s+\w+=/m.test(text);
}

/** Check if text block is already wrapped in <pre><code> */
function isAlreadyWrapped(text: string): boolean {
  return /<pre[^>]*>\s*<code/i.test(text);
}

function enrichCodeBlocks(content: string): string {
  let html = content;

  // Find text blocks that look like code but aren't wrapped in <pre><code>
  // Pattern: lines with code indicators outside of <pre> tags
  // We process text between HTML tags looking for unwrapped code

  // First, handle content that already has <pre> but no <code class="language-...">
  html = html.replace(/<pre>(?!\s*<code)([\s\S]*?)<\/pre>/gi, (match, inner) => {
    const text = inner.trim();
    if (isPowerShell(text)) {
      return `<pre><code class="language-powershell">${text}</code></pre>`;
    }
    if (isBash(text)) {
      return `<pre><code class="language-bash">${text}</code></pre>`;
    }
    return match;
  });

  // Handle <pre><code> without language class
  html = html.replace(/<pre>\s*<code(?!\s+class)>([\s\S]*?)<\/code>\s*<\/pre>/gi, (match, inner) => {
    const text = inner.trim();
    if (isPowerShell(text)) {
      return `<pre><code class="language-powershell">${text}</code></pre>`;
    }
    if (isBash(text)) {
      return `<pre><code class="language-bash">${text}</code></pre>`;
    }
    return match;
  });

  // If article starts with <pre>, add an introduction paragraph
  const trimmedHtml = html.trimStart();
  if (/^<pre/i.test(trimmedHtml)) {
    // Detect language for intro text
    const firstPreMatch = trimmedHtml.match(/<pre[^>]*>[\s\S]*?<\/pre>/i);
    if (firstPreMatch) {
      const block = firstPreMatch[0];
      let intro = '<p>Script technique :</p>\n';
      if (isPowerShell(block) || /language-powershell/i.test(block)) {
        intro = '<p>Script PowerShell pour automatisation administrative :</p>\n';
      } else if (isBash(block) || /language-bash/i.test(block)) {
        intro = '<p>Script Bash pour automatisation systeme :</p>\n';
      }
      html = intro + html.trimStart();
    }
  }

  return html;
}

// ---------------------------------------------------------------------------
// RAG reindex for a single page (reused from cleanup-wiki-html.ts)
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
    const plain = stripHtml(content);
    const chunks = chunkContent(`${title}\n\n${plain}`);
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
  console.log('[enhance-wiki-content] Starting wiki content enhancement...\n');

  const pages = await prisma.wikiPage.findMany({
    select: { id: true, title: true, content: true, slug: true },
  });
  console.log(`[enhance-wiki-content] Loaded ${pages.length} WikiPage(s)\n`);

  let titlesNormalized = 0;
  let excerptsAdded = 0;
  let codeEnriched = 0;
  let ragReindexed = 0;

  for (const page of pages) {
    let modified = false;
    let newTitle = page.title;
    let newContent = page.content;

    // --- 1. Normalize title ---
    const normalizedTitle = normalizeTitle(page.title);
    if (normalizedTitle !== page.title) {
      newTitle = normalizedTitle;
      modified = true;
      titlesNormalized++;
      console.log(`  [TITLE] "${page.title}" -> "${normalizedTitle}"`);
    }

    // --- 2. Enrich code blocks ---
    const enriched = enrichCodeBlocks(newContent);
    if (enriched !== newContent) {
      newContent = enriched;
      modified = true;
      codeEnriched++;
      console.log(`  [CODE]  "${newTitle}" — code blocks enriched`);
    }

    // --- 3. Add excerpt if missing ---
    if (!hasExcerpt(newContent)) {
      const excerpt = extractExcerpt(newContent);
      if (excerpt.length > 20) {
        newContent = injectExcerpt(newContent, excerpt);
        modified = true;
        excerptsAdded++;
        console.log(`  [META]  "${newTitle}" — excerpt: "${excerpt.slice(0, 80)}..."`);
      }
    }

    // --- 4. Persist changes and reindex ---
    if (modified) {
      await prisma.wikiPage.update({
        where: { id: page.id },
        data: {
          title: newTitle,
          content: newContent,
        },
      });
      await reindexPage(page.id, newTitle, newContent);
      ragReindexed++;
    }
  }

  console.log('\n========================================');
  console.log('[enhance-wiki-content] DONE');
  console.log(`  Total pages:        ${pages.length}`);
  console.log(`  Titles normalized:  ${titlesNormalized}`);
  console.log(`  Excerpts added:     ${excerptsAdded}`);
  console.log(`  Code blocks enriched: ${codeEnriched}`);
  console.log(`  RAG reindexed:      ${ragReindexed}`);
  console.log('========================================');
}

main()
  .catch((e) => {
    console.error('[enhance-wiki-content] Fatal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
