#!/usr/bin/env node
/**
 * SEAL Design System — migration semantic script
 *
 * Migre les classes legacy `taupe` → `seal-gray-500` sur `text-*` et `border-*`.
 * Refuse `navy` (ambigu, voir docs/migration/seal-mapping.md) et `bg-taupe` (pas d'équivalent).
 *
 * Usage :
 *   node scripts/seal-migrate.mjs                       # dry-run global
 *   node scripts/seal-migrate.mjs --apply               # applique les changements
 *   node scripts/seal-migrate.mjs --scope packages/ui   # limite à un sous-arbre
 *   node scripts/seal-migrate.mjs --file <path>         # un fichier précis
 *   node scripts/seal-migrate.mjs --self-test           # tests unitaires internes
 *
 * Sortie :
 *   - stdout : rapport groupé par fichier (dry-run) ou résumé (apply)
 *   - docs/migration/seal-migration-ambiguous.md : liste des matches refusés (navy, bg-taupe, dynamique)
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';

// ─── Configuration ──────────────────────────────────────────────────────────

const EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const IGNORE_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  '.git',
  '.turbo',
  'coverage',
  'out',
  '.claude',
]);

// Regex cible : classes taupe migrables ------------------------------
// On capture :
//   - un éventuel préfixe Tailwind (hover:, focus:, focus-visible:, dark:, group-hover:,
//     placeholder:, md:, lg:, sm:, xl:, 2xl:, aria-*:, data-*:, peer-*:, motion-*:,
//     et les chaînes type "md:hover:")
//   - l'utilitaire (text|border)
//   - -taupe
//   - une opacity optionnelle /NN
//
// IMPORTANT : on EXCLUT les matches où la classe est directement interpolée
// dans un template string (détection simple plus bas).
const VARIANT_PREFIX = '(?:[a-zA-Z][a-zA-Z0-9-]*:)*'; // préfixes enchaînables
const TAUPE_TEXT_RE = new RegExp(
  `(?<![\\w-])(${VARIANT_PREFIX})(text)-taupe(\\/[0-9]{1,3})?(?![\\w-])`,
  'g',
);
const TAUPE_BORDER_RE = new RegExp(
  `(?<![\\w-])(${VARIANT_PREFIX})(border)-taupe(\\/[0-9]{1,3})?(?![\\w-])`,
  'g',
);

// Pour l'ambigu — tout ce qui contient navy, bg-taupe, from-taupe, etc.
const AMBIGUOUS_RE = new RegExp(
  `(?<![\\w-])((?:[a-zA-Z][a-zA-Z0-9-]*:)*)((?:text|bg|border|ring|from|to|via)-(?:navy|taupe)(?:-[a-z0-9]+)?(?:\\/[0-9]{1,3})?)(?![\\w-])`,
  'g',
);

// Détection grossière d'interpolation dynamique (backtick avec ${ à proximité)
const DYNAMIC_INTERP_RE = /\$\{[^}]*\}-(navy|taupe)|text-\$\{|bg-\$\{|border-\$\{/;

// ─── CLI args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {
  apply: args.includes('--apply'),
  selfTest: args.includes('--self-test'),
  verbose: args.includes('-v') || args.includes('--verbose'),
};
const scope = extractArg('--scope');
const fileArg = extractArg('--file');
const ROOT = resolve(extractArg('--root') || process.cwd());

function extractArg(name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  return args[i + 1];
}

// ─── Tests unitaires (--self-test) ──────────────────────────────────────────

function runSelfTest() {
  const cases = [
    // [input, expected, description]
    ['text-taupe', 'text-seal-gray-500', 'basique text-taupe'],
    ['text-taupe/40', 'text-seal-gray-500/40', 'opacity préservée'],
    ['hover:text-taupe', 'hover:text-seal-gray-500', 'prefix hover'],
    ['dark:text-taupe', 'dark:text-seal-gray-500', 'prefix dark'],
    ['focus-visible:text-taupe', 'focus-visible:text-seal-gray-500', 'prefix focus-visible'],
    ['group-hover:text-taupe', 'group-hover:text-seal-gray-500', 'prefix group-hover'],
    ['md:hover:text-taupe', 'md:hover:text-seal-gray-500', 'prefix chaîné md:hover:'],
    ['placeholder:text-taupe', 'placeholder:text-seal-gray-500', 'prefix placeholder'],
    ['border-taupe', 'border-seal-gray-500', 'basique border-taupe'],
    ['border-taupe/30', 'border-seal-gray-500/30', 'border avec opacity'],
    ['hover:border-taupe/50', 'hover:border-seal-gray-500/50', 'hover border opacity'],
    // Non transformations (doivent rester identiques)
    ['text-navy', 'text-navy', 'navy non touché'],
    ['text-navy/80', 'text-navy/80', 'navy opacity non touché'],
    ['bg-taupe', 'bg-taupe', 'bg-taupe non touché'],
    ['bg-navy/10', 'bg-navy/10', 'bg-navy non touché'],
    ['text-taupee', 'text-taupee', 'pas de faux positif sur text-taupee'],
    ['my-text-taupe', 'my-text-taupe', 'pas de match au milieu d\'un mot'],
    // contexte dans une chaîne de classes
    [
      'flex items-center text-taupe hover:text-taupe/70 dark:text-slate-400',
      'flex items-center text-seal-gray-500 hover:text-seal-gray-500/70 dark:text-slate-400',
      'contexte chaîne',
    ],
    // Border et text simultanés
    [
      'border border-taupe/30 text-taupe',
      'border border-seal-gray-500/30 text-seal-gray-500',
      'border + text',
    ],
  ];

  let pass = 0;
  let fail = 0;
  for (const [input, expected, desc] of cases) {
    const out = applyMigration(input);
    const ok = out === expected;
    if (ok) pass++;
    else {
      fail++;
      console.error(`  FAIL: ${desc}`);
      console.error(`        input    : ${input}`);
      console.error(`        expected : ${expected}`);
      console.error(`        got      : ${out}`);
    }
  }

  // Détection ambigü
  const ambiguousInputs = [
    ['text-navy', true],
    ['text-navy/80', true],
    ['bg-navy/10', true],
    ['bg-taupe', true],
    ['from-navy', true],
    ['text-taupe', true], // aussi listé (même s'il sera migré)
    ['text-slate-400', false],
    ['bg-primary', false],
  ];
  for (const [input, shouldMatch] of ambiguousInputs) {
    const ms = [...input.matchAll(AMBIGUOUS_RE)];
    const got = ms.length > 0;
    if (got === shouldMatch) pass++;
    else {
      fail++;
      console.error(`  FAIL (ambigu detect): "${input}" expected match=${shouldMatch}, got=${got}`);
    }
  }

  console.log(`\nSelf-test : ${pass} pass, ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
}

// ─── Core transform ─────────────────────────────────────────────────────────

/**
 * Applique la migration taupe → seal-gray-500 sur une chaîne.
 * Retourne la chaîne modifiée.
 */
function applyMigration(src) {
  return src
    .replace(TAUPE_TEXT_RE, (_m, prefix, util, opacity) =>
      `${prefix}${util}-seal-gray-500${opacity || ''}`,
    )
    .replace(TAUPE_BORDER_RE, (_m, prefix, util, opacity) =>
      `${prefix}${util}-seal-gray-500${opacity || ''}`,
    );
}

/**
 * Collecte les occurrences légitimement migrables et celles flaggées ambigues.
 */
function analyzeFile(abs) {
  const src = readFileSync(abs, 'utf8');
  const rel = relative(ROOT, abs);

  // Détection interpolation dynamique
  const hasDynamic = DYNAMIC_INTERP_RE.test(src);

  // Collecte matches migrables (avec line number)
  const migrable = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    const re1 = new RegExp(TAUPE_TEXT_RE.source, 'g');
    while ((m = re1.exec(line)) !== null) {
      migrable.push({
        line: i + 1,
        col: m.index,
        from: m[0],
        to: `${m[1]}${m[2]}-seal-gray-500${m[3] || ''}`,
        context: line.trim().slice(0, 160),
      });
    }
    const re2 = new RegExp(TAUPE_BORDER_RE.source, 'g');
    while ((m = re2.exec(line)) !== null) {
      migrable.push({
        line: i + 1,
        col: m.index,
        from: m[0],
        to: `${m[1]}${m[2]}-seal-gray-500${m[3] || ''}`,
        context: line.trim().slice(0, 160),
      });
    }
  }

  // Collecte ambigus (navy* + bg-taupe + from-taupe…)
  const ambiguous = [];
  const allMatches = [...src.matchAll(AMBIGUOUS_RE)];
  for (const m of allMatches) {
    const cls = m[2];
    // On filtre : on veut uniquement les cas non migrés par applyMigration.
    // Donc on exclut text-taupe et border-taupe (avec shade éventuelle).
    if (/^text-taupe(\/[0-9]+)?$/.test(cls)) continue;
    if (/^border-taupe(\/[0-9]+)?$/.test(cls)) continue;
    // Le reste = ambigü (navy, bg-taupe, from-taupe, etc.)
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const lineEnd = src.indexOf('\n', m.index);
    const lineText = src.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    const lineNum = src.slice(0, m.index).split('\n').length;
    ambiguous.push({
      line: lineNum,
      class: m[0],
      context: lineText.trim().slice(0, 160),
    });
  }

  return {
    rel,
    abs,
    src,
    migrable,
    ambiguous,
    hasDynamic,
    newSrc: applyMigration(src),
  };
}

// ─── File discovery ─────────────────────────────────────────────────────────

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (st.isFile()) {
      const ix = entry.lastIndexOf('.');
      if (ix === -1) continue;
      if (!EXTS.has(entry.slice(ix))) continue;
      out.push(full);
    }
  }
  return out;
}

// ─── Reporting ──────────────────────────────────────────────────────────────

function writeAmbiguousReport(allAmbiguous) {
  const outPath = join(ROOT, 'docs/migration/seal-migration-ambiguous.md');
  const byFile = new Map();
  for (const a of allAmbiguous) {
    if (!byFile.has(a.rel)) byFile.set(a.rel, []);
    byFile.get(a.rel).push(a);
  }

  const lines = [];
  lines.push('# SEAL Migration — Cas ambigus (Session 2+)');
  lines.push('');
  lines.push(`_Généré par \`scripts/seal-migrate.mjs\` le ${new Date().toISOString()}._`);
  lines.push('');
  lines.push('Ce fichier liste toutes les occurrences **refusées** par le script de migration auto.');
  lines.push('Chaque ligne nécessite une décision humaine (designer / lead front) en session 2+.');
  lines.push('');
  lines.push('## Familles refusées');
  lines.push('');
  lines.push('- `text-navy`, `bg-navy`, `border-navy`, `from-navy`, `to-navy`, `via-navy`, `ring-navy` + toutes opacités : **navy OMNITECH vs seal-blue** (décision charte).');
  lines.push('- `bg-taupe`, `from-taupe`, `to-taupe`, `via-taupe` : pas d\'équivalent `seal-gray-*` direct comme fond.');
  lines.push('- Fichiers avec interpolation dynamique `text-${color}` : revue manuelle requise.');
  lines.push('');

  const byClass = new Map();
  for (const a of allAmbiguous) {
    byClass.set(a.class, (byClass.get(a.class) || 0) + 1);
  }
  lines.push('## Totaux par classe ambigüe');
  lines.push('');
  lines.push('| Classe | Occurrences |');
  lines.push('| --- | ---: |');
  for (const [cls, n] of [...byClass.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`| \`${cls}\` | ${n} |`);
  }
  lines.push('');

  lines.push('## Par fichier');
  lines.push('');
  const sortedFiles = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [file, arr] of sortedFiles) {
    lines.push(`### \`${file}\` — ${arr.length} occurrences`);
    lines.push('');
    lines.push('| Ligne | Classe | Contexte |');
    lines.push('| ---: | --- | --- |');
    for (const a of arr) {
      const ctx = a.context.replace(/\|/g, '\\|');
      lines.push(`| ${a.line} | \`${a.class}\` | \`${ctx}\` |`);
    }
    lines.push('');
  }

  writeFileSync(outPath, lines.join('\n'));
  console.log(`\nAmbigus → ${relative(ROOT, outPath)}`);
}

function printDryRunReport(files, scannedTotal) {
  let totalChanges = 0;
  let totalAmbiguous = 0;
  let totalDynamic = 0;
  const filesWithChanges = [];

  for (const f of files) {
    if (f.migrable.length > 0 || f.ambiguous.length > 0) {
      totalChanges += f.migrable.length;
      totalAmbiguous += f.ambiguous.length;
      if (f.hasDynamic) totalDynamic++;
      filesWithChanges.push(f);
    }
  }

  console.log(`\n── DRY-RUN ────────────────────────────────────────────`);
  console.log(`Root                 : ${ROOT}`);
  console.log(`Fichiers scannés     : ${scannedTotal}`);
  console.log(`Fichiers impactés    : ${filesWithChanges.length}`);
  console.log(`Remplacements auto   : ${totalChanges}  (taupe → seal-gray-500)`);
  console.log(`Cas ambigus          : ${totalAmbiguous}  (navy, bg-taupe, etc.)`);
  console.log(`Fichiers dynamiques  : ${totalDynamic}  (interpolation \${})`);
  console.log(`───────────────────────────────────────────────────────`);

  if (flags.verbose) {
    for (const f of filesWithChanges.slice(0, 40)) {
      console.log(`\n• ${f.rel}`);
      console.log(`  ${f.migrable.length} auto, ${f.ambiguous.length} ambigu${f.hasDynamic ? ', dynamique' : ''}`);
      for (const mg of f.migrable.slice(0, 5)) {
        console.log(`    L${mg.line}  ${mg.from}  →  ${mg.to}`);
      }
      if (f.migrable.length > 5) console.log(`    … (+${f.migrable.length - 5})`);
    }
    if (filesWithChanges.length > 40) {
      console.log(`\n… ${filesWithChanges.length - 40} fichiers supplémentaires non affichés (sans -v)`);
    }
  }
}

function applyChanges(files) {
  let totalChanges = 0;
  let filesChanged = 0;
  for (const f of files) {
    if (f.migrable.length === 0) continue;
    if (f.newSrc !== f.src) {
      writeFileSync(f.abs, f.newSrc, 'utf8');
      totalChanges += f.migrable.length;
      filesChanged++;
    }
  }
  console.log(`\n── APPLY ──────────────────────────────────────────────`);
  console.log(`Fichiers modifiés   : ${filesChanged}`);
  console.log(`Remplacements       : ${totalChanges}`);
  console.log(`───────────────────────────────────────────────────────`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

if (flags.selfTest) {
  runSelfTest();
}

let targets;
if (fileArg) {
  targets = [resolve(ROOT, fileArg)];
} else {
  const base = scope ? resolve(ROOT, scope) : ROOT;
  targets = walk(base);
}

const analyses = [];
const allAmbiguous = [];
let scannedCount = 0;
for (const abs of targets) {
  scannedCount++;
  const a = analyzeFile(abs);
  if (a.migrable.length > 0 || a.ambiguous.length > 0) analyses.push(a);
  for (const amb of a.ambiguous) {
    allAmbiguous.push({ rel: a.rel, ...amb });
  }
}

printDryRunReport(analyses, scannedCount);
writeAmbiguousReport(allAmbiguous);

if (flags.apply) {
  applyChanges(analyses);
} else {
  console.log('\n(dry-run — pass --apply pour écrire les changements)');
}
