#!/usr/bin/env node
/**
 * Migration one-shot : convertit les pages WikiPage stockées en markdown
 * brut (via la première vague de sync WebDAV) en HTML pour que l'UI wiki
 * (dangerouslySetInnerHTML) les rende correctement.
 *
 * Heuristique de détection "stocké en markdown" :
 *   - content ne commence PAS par '<' (donc pas de tag HTML)
 *   - OU content contient des marqueurs markdown (## , ```, **, etc.)
 *   - On évite de re-convertir un contenu déjà HTML.
 *
 * Création d'un snapshot WikiPageVersion avant écrasement (rollback possible).
 *
 * Usage : node scripts/migrate-wiki-md-to-html.cjs [--dry-run]
 */
const { PrismaClient } = require(
  '/root/omnitech-intranet/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/@prisma/client',
);
const { marked } = require(
  '/root/omnitech-intranet/apps/backend/node_modules/marked',
);

const DRY = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force'); // re-process even already-HTML
const prisma = new PrismaClient();

// Pré-traite le markdown Obsidian : wikilinks [[slug|texte]] → liens HTML.
// On normalise aussi les "frontmatter" YAML ouverts/fermés en début de doc :
// si présent, on l'extrait pour ne pas le rendre comme du texte brut.
function preprocessObsidianMd(md) {
  if (!md) return '';
  let s = md;
  // Frontmatter YAML — on le strip (déjà capturé séparément ailleurs).
  s = s.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  // Wikilinks [[target|label]] → [label](/wiki/target-slug)
  s = s.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, (_m, target, label) => {
    const slug = String(target).trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `[${label.trim()}](/wiki/${slug})`;
  });
  // Wikilinks simples [[target]] → [target](/wiki/target-slug)
  s = s.replace(/\[\[([^\]]+)\]\]/g, (_m, target) => {
    const slug = String(target).trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `[${target.trim()}](/wiki/${slug})`;
  });
  // Images Obsidian ![[file.png]] → ne sont pas téléchargeables ici, on garde
  // un placeholder lisible.
  s = s.replace(/!\[\[([^\]]+)\]\]/g, (_m, file) =>
    `*[Image Obsidian non synchronisée : ${file.trim()}]*`,
  );
  // Tags Obsidian (#tag inline) — laisser tels quels, marked les rendra
  // comme du texte. Optionnel : on pourrait les transformer en pills.
  return s;
}

function looksLikeHtml(s) {
  if (!s) return true;
  const t = s.trim();
  if (t.startsWith('<')) return true;
  // Détection plus fine : présence de tags fermants dans les 500 premiers chars
  return /<\/(p|h\d|ul|ol|li|pre|code|table|div|span|blockquote)>/.test(
    t.slice(0, 500),
  );
}

function looksLikeWikiLinkOrTable(s) {
  if (!s) return false;
  return /\[\[/.test(s) || /\n\s*\|.*\|/.test(s);
}

async function main() {
  const pages = await prisma.wikiPage.findMany({
    where: {
      webdavFolder: { not: null },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      authorId: true,
      content: true,
      updatedAt: true,
    },
  });

  let toMigrate = 0;
  let skipped = 0;
  let migrated = 0;
  let errors = 0;

  // Récupère le markdown ORIGINAL depuis WikiPageVersion si disponible (les
  // pages déjà migrées en HTML mais avec wikilinks bruts → on re-process à
  // partir du markdown source). Sinon on prend le content tel quel.
  for (const p of pages) {
    const isHtml = looksLikeHtml(p.content);
    const hasObsidianBits = looksLikeWikiLinkOrTable(p.content);

    let sourceMd = p.content || '';
    if (isHtml && FORCE) {
      // Cherche le snapshot pre-migration (markdown original)
      const snap = await prisma.wikiPageVersion.findFirst({
        where: { pageId: p.id, changeLog: 'pre-migration md→html (one-shot)' },
        orderBy: { createdAt: 'desc' },
        select: { content: true },
      });
      if (snap?.content && !looksLikeHtml(snap.content)) {
        sourceMd = snap.content;
      } else {
        skipped += 1;
        continue;
      }
    } else if (isHtml && !hasObsidianBits) {
      skipped += 1;
      continue;
    }

    toMigrate += 1;
    try {
      const md = preprocessObsidianMd(sourceMd);
      const html = marked.parse(md, { async: false });
      if (DRY) {
        console.log(`[dry] ${p.slug}: ${sourceMd.length}B md → ${html.length}B html`);
        continue;
      }
      // Snapshot version pour rollback (sauf si on re-process déjà-HTML — on a déjà la version)
      if (!isHtml) {
        await prisma.wikiPageVersion.create({
          data: {
            pageId: p.id,
            content: p.content,
            title: p.title,
            authorId: p.authorId,
            changeLog: 'pre-migration md→html (one-shot)',
          },
        });
      }
      await prisma.wikiPage.update({
        where: { id: p.id },
        data: { content: html },
      });
      migrated += 1;
    } catch (err) {
      errors += 1;
      console.error(`[error] ${p.slug}: ${err.message}`);
    }
  }

  console.log(`Pages WebDAV: ${pages.length}`);
  console.log(`  Already HTML (skipped): ${skipped}`);
  console.log(`  Markdown to migrate: ${toMigrate}`);
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Errors: ${errors}`);
  if (DRY) console.log('(dry-run — no changes written)');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
