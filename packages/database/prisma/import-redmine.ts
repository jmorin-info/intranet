// =============================================================================
// OMNITECH Security Intranet — Import Redmine (tickets)
// Lit un dump SQL Redmine (.sql ou .sql.gz) et importe les tickets via Prisma.
// Usage : tsx prisma/import-redmine.ts <dump.sql|dump.sql.gz>
//
// Tables Redmine parsees :
//   issues, issue_statuses, enumerations, trackers, projects, journals, custom_values
//
// Idempotent : les tickets dont la reference RDM-{id} existe deja sont ignores.
// =============================================================================

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { gunzipSync } from 'zlib';

// ---------------------------------------------------------------------------
// Load .env from project root if DATABASE_URL is not set
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

import { PrismaClient, TicketStatus, TicketPriority, TicketCategory } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RedmineIssue {
  id: number;
  subject: string;
  description: string | null;
  status_id: number;
  priority_id: number;
  tracker_id: number;
  project_id: number;
  created_on: string;
  updated_on: string;
  closed_on: string | null;
  done_ratio: number;
}

interface RedmineJournal {
  id: number;
  journalized_id: number;
  notes: string | null;
  created_on: string;
}

interface CustomFieldValues {
  sn: string | null;        // field 10
  client: string | null;    // field 11
  ip: string | null;        // field 12
  alimentation: string | null; // field 13
  dateEnvoi: string | null; // field 14
}

// ---------------------------------------------------------------------------
// Mapping tables
// ---------------------------------------------------------------------------

// Status: id -> intranet status
const STATUS_ID_MAP: Record<number, TicketStatus> = {
  1: 'OPEN',         // Nouveau
  2: 'IN_PROGRESS',  // En cours
  3: 'RESOLVED',     // Resolu
  4: 'RESOLVED',     // Commentaire
  5: 'CLOSED',       // Ferme
  6: 'CLOSED',       // Rejete
};

// Priority: id -> intranet priority
const PRIORITY_ID_MAP: Record<number, TicketPriority> = {
  1: 'LOW',       // Bas
  2: 'MEDIUM',    // Normal
  3: 'HIGH',      // Haut
  4: 'CRITICAL',  // Urgent
  5: 'CRITICAL',  // Immediat
};

// Project-based category mapping
const PROJECT_CATEGORY_MAP: Record<number, TicketCategory> = {
  4: 'HARDWARE',   // Preparation Informatique
  6: 'HARDWARE',   // RMA
  5: 'SOFTWARE',   // Projet Interne Informatique
  3: 'INCIDENT',   // Informatique interne
};

// Tracker 1 = "A faire" -> REQUEST (fallback if project not in map)
const TRACKER_CATEGORY_MAP: Record<number, TicketCategory> = {
  1: 'REQUEST',    // A faire
};

// Project slugs (from dump)
const PROJECT_SLUG_MAP: Record<number, string> = {
  3: 'informatique-interne',
  4: 'preparation-de-poste',
  5: 'projet-interne-informatique',
  6: 'rma',
  8: 'materiel-deploye-disponible-supplementaire',
  9: 'arrivee-et-depart-collaborateurs',
  10: 'sfpi',
  11: 'iso-27001',
};

// Project names (from dump)
const PROJECT_NAME_MAP: Record<number, string> = {
  3: 'Informatique interne',
  4: 'Preparation Informatique',
  5: 'Projet Interne Informatique',
  6: 'RMA',
  8: 'Materiel deploye disponible',
  9: 'Arrivee et Depart collaborateurs',
  10: 'SFPI',
  11: 'ISO 27001',
};

// Tracker names (from dump)
const TRACKER_NAME_MAP: Record<number, string> = {
  1: 'A faire',
  2: 'Deploye',
  3: 'En cours de deploiement',
  4: 'Envoye',
  5: 'Pret a etre expedie',
};

// ---------------------------------------------------------------------------
// SQL dump parser
// ---------------------------------------------------------------------------

function extractInsertRows(sql: string, tableName: string): string[][] {
  const rows: string[][] = [];
  const insertRegex = new RegExp(
    `INSERT\\s+INTO\\s+["\`]?${tableName}["\`]?\\s*(?:\\([^)]*\\)\\s*)?VALUES\\s*`,
    'gi'
  );

  let match: RegExpExecArray | null;
  while ((match = insertRegex.exec(sql)) !== null) {
    // From the end of the match, parse tuples until semicolon
    let pos = match.index + match[0].length;
    while (pos < sql.length) {
      // skip whitespace
      while (pos < sql.length && /\s/.test(sql[pos])) pos++;
      if (sql[pos] === ';' || pos >= sql.length) break;
      if (sql[pos] !== '(') break;

      // Parse one tuple
      pos++; // skip (
      const fields: string[] = [];
      let current = '';
      let inQuote = false;
      let depth = 0;

      while (pos < sql.length) {
        const ch = sql[pos];
        if (inQuote) {
          if (ch === '\\' && pos + 1 < sql.length) {
            current += ch + sql[pos + 1];
            pos += 2;
            continue;
          }
          if (ch === "'" && pos + 1 < sql.length && sql[pos + 1] === "'") {
            current += "'";
            pos += 2;
            continue;
          }
          if (ch === "'") {
            inQuote = false;
            pos++;
            continue;
          }
          current += ch;
          pos++;
        } else {
          if (ch === "'") {
            inQuote = true;
            pos++;
            continue;
          }
          if (ch === '(') {
            depth++;
            current += ch;
            pos++;
            continue;
          }
          if (ch === ')') {
            if (depth > 0) {
              depth--;
              current += ch;
              pos++;
              continue;
            }
            // End of tuple
            fields.push(current.trim());
            pos++; // skip )
            break;
          }
          if (ch === ',' && depth === 0) {
            fields.push(current.trim());
            current = '';
            pos++;
            continue;
          }
          current += ch;
          pos++;
        }
      }
      rows.push(fields);

      // skip comma between tuples
      while (pos < sql.length && /\s/.test(sql[pos])) pos++;
      if (sql[pos] === ',') pos++;
    }
  }
  return rows;
}

function cleanVal(val: string | undefined): string | null {
  if (!val) return null;
  const v = val.trim();
  if (v.toUpperCase() === 'NULL') return null;
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
    return v.slice(1, -1);
  }
  return v;
}

function cleanInt(val: string | undefined): number | null {
  const v = cleanVal(val);
  if (v === null) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

// Unescape MySQL string escapes
function unescapeSql(s: string): string {
  return s
    .replace(/\\r\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

// ---------------------------------------------------------------------------
// Build enriched description
// ---------------------------------------------------------------------------

function buildDescription(origDesc: string | null, cv: CustomFieldValues): string {
  const hasCustom = cv.sn || cv.client || cv.ip || cv.alimentation !== null || cv.dateEnvoi;

  let html = '';
  if (hasCustom) {
    html += '<h3>Informations deploiement</h3>\n<table>\n';
    if (cv.sn) html += `  <tr><td>Numero de serie</td><td>${escapeHtml(cv.sn)}</td></tr>\n`;
    if (cv.client) html += `  <tr><td>Client</td><td>${escapeHtml(cv.client)}</td></tr>\n`;
    if (cv.ip) html += `  <tr><td>Adresse IP</td><td>${escapeHtml(cv.ip)}</td></tr>\n`;
    if (cv.alimentation !== null) {
      const alimBool = cv.alimentation === '1' || cv.alimentation?.toLowerCase() === 'true';
      html += `  <tr><td>Alimentation</td><td>${alimBool ? '\u2705' : '\u274c'}</td></tr>\n`;
    }
    if (cv.dateEnvoi) html += `  <tr><td>Date d'envoi</td><td>${escapeHtml(cv.dateEnvoi)}</td></tr>\n`;
    html += '</table>\n';
  }

  if (origDesc && origDesc.trim()) {
    html += '<h3>Description</h3>\n';
    html += origDesc.trim();
  }

  return html || '(aucune description)';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Usage: tsx prisma/import-redmine.ts <dump.sql|dump.sql.gz>');
    process.exit(1);
  }

  const absPath = resolve(filePath);
  console.log(`[import-redmine] Lecture du dump : ${absPath}`);

  let rawBuf = readFileSync(absPath);
  if (absPath.endsWith('.gz')) {
    console.log('[import-redmine] Decompression gzip...');
    rawBuf = gunzipSync(rawBuf);
  }
  const sql = rawBuf.toString('utf-8');
  console.log(`[import-redmine] Taille du dump : ${(sql.length / 1024 / 1024).toFixed(1)} Mo`);

  // -----------------------------------------------------------------------
  // 1. Parse issues
  // -----------------------------------------------------------------------
  const issueRows = extractInsertRows(sql, 'issues');
  console.log(`[import-redmine] Issues trouvees dans le dump : ${issueRows.length}`);

  // issues columns: 0:id, 1:tracker_id, 2:project_id, 3:subject, 4:description,
  //   5:due_date, 6:category_id, 7:status_id, 8:assigned_to_id, 9:priority_id,
  //   10:fixed_version_id, 11:author_id, 12:lock_version, 13:created_on,
  //   14:updated_on, 15:start_date, 16:done_ratio, 17:estimated_hours,
  //   18:parent_id, 19:root_id, 20:lft, 21:rgt, 22:is_private, 23:closed_on
  const issues: RedmineIssue[] = issueRows.map(row => ({
    id:          cleanInt(row[0]) ?? 0,
    tracker_id:  cleanInt(row[1]) ?? 0,
    project_id:  cleanInt(row[2]) ?? 0,
    subject:     unescapeSql(cleanVal(row[3]) ?? '(sans titre)'),
    description: cleanVal(row[4]) ? unescapeSql(cleanVal(row[4])!) : null,
    status_id:   cleanInt(row[7]) ?? 0,
    priority_id: cleanInt(row[9]) ?? 0,
    created_on:  cleanVal(row[13]) ?? new Date().toISOString(),
    updated_on:  cleanVal(row[14]) ?? new Date().toISOString(),
    closed_on:   cleanVal(row[23]),
    done_ratio:  cleanInt(row[16]) ?? 0,
  }));

  // -----------------------------------------------------------------------
  // 2. Parse custom_values
  // -----------------------------------------------------------------------
  const cvRows = extractInsertRows(sql, 'custom_values');
  console.log(`[import-redmine] Custom values trouvees : ${cvRows.length}`);

  // custom_values: 0:id, 1:customized_type, 2:customized_id, 3:custom_field_id, 4:value
  const customByIssue = new Map<number, CustomFieldValues>();
  for (const row of cvRows) {
    const cType = cleanVal(row[1]);
    if (cType !== 'Issue') continue;
    const issueId = cleanInt(row[2]);
    const fieldId = cleanInt(row[3]);
    const value = cleanVal(row[4]);
    if (issueId === null || fieldId === null) continue;

    if (!customByIssue.has(issueId)) {
      customByIssue.set(issueId, { sn: null, client: null, ip: null, alimentation: null, dateEnvoi: null });
    }
    const cv = customByIssue.get(issueId)!;
    const trimVal = value?.trim() || null;

    switch (fieldId) {
      case 10: cv.sn = trimVal; break;
      case 11: cv.client = trimVal; break;
      case 12: cv.ip = trimVal; break;
      case 13: cv.alimentation = value; break;  // keep raw for bool check
      case 14: cv.dateEnvoi = trimVal; break;
    }
  }

  // -----------------------------------------------------------------------
  // 3. Parse journals (comments)
  // -----------------------------------------------------------------------
  const journalRows = extractInsertRows(sql, 'journals');
  console.log(`[import-redmine] Journals trouves : ${journalRows.length}`);

  // journals: 0:id, 1:journalized_id, 2:journalized_type, 3:user_id, 4:notes, 5:created_on
  const journals: RedmineJournal[] = journalRows
    .filter(row => {
      const jType = cleanVal(row[2]);
      return !jType || jType === 'Issue';
    })
    .map(row => ({
      id:              cleanInt(row[0]) ?? 0,
      journalized_id:  cleanInt(row[1]) ?? 0,
      notes:           cleanVal(row[4]) ? unescapeSql(cleanVal(row[4])!) : null,
      created_on:      cleanVal(row[5]) ?? new Date().toISOString(),
    }))
    .filter(j => j.notes && j.notes.trim().length > 0);

  const journalsByIssue = new Map<number, RedmineJournal[]>();
  for (const j of journals) {
    const arr = journalsByIssue.get(j.journalized_id) ?? [];
    arr.push(j);
    journalsByIssue.set(j.journalized_id, arr);
  }

  // -----------------------------------------------------------------------
  // 4. Resolve the fallback creator user (first ADMIN)
  // -----------------------------------------------------------------------
  const fallbackUser = await prisma.user.findFirst({
    where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!fallbackUser) {
    console.error('[import-redmine] ERREUR : aucun utilisateur ADMIN trouve dans la base intranet.');
    process.exit(1);
  }
  const creatorId = fallbackUser.id;
  console.log(`[import-redmine] Createur par defaut : ${creatorId}`);

  // -----------------------------------------------------------------------
  // 5. Import tickets (idempotent)
  // -----------------------------------------------------------------------
  let created = 0;
  let skipped = 0;
  let commentCount = 0;
  let errors = 0;

  // Stats
  const statsByProject: Record<string, number> = {};
  const statsByStatus: Record<string, number> = {};

  for (const issue of issues) {
    const reference = `RDM-${issue.id}`;

    // Idempotency check
    const existing = await prisma.ticket.findUnique({ where: { reference } });
    if (existing) {
      skipped++;
      continue;
    }

    // Resolve category: project first, then tracker fallback
    const category: TicketCategory =
      PROJECT_CATEGORY_MAP[issue.project_id] ??
      TRACKER_CATEGORY_MAP[issue.tracker_id] ??
      'OTHER';

    const status: TicketStatus = STATUS_ID_MAP[issue.status_id] ?? 'OPEN';
    const priority: TicketPriority = PRIORITY_ID_MAP[issue.priority_id] ?? 'MEDIUM';

    // Custom fields
    const cv = customByIssue.get(issue.id) ?? { sn: null, client: null, ip: null, alimentation: null, dateEnvoi: null };

    // Build enriched description
    const description = buildDescription(issue.description, cv);

    // Build tags
    const tags: string[] = [];
    const projectSlug = PROJECT_SLUG_MAP[issue.project_id];
    const trackerName = TRACKER_NAME_MAP[issue.tracker_id];
    if (projectSlug) tags.push(`redmine:${projectSlug}`);
    if (trackerName) tags.push(`tracker:${trackerName}`);
    if (issue.project_id === 4) tags.push('deploiement');
    if (issue.project_id === 6) tags.push('rma');
    if (cv.client) tags.push(`client:${cv.client.trim()}`);

    // Dates
    const closedOn = issue.closed_on ? new Date(issue.closed_on) : null;
    const resolvedAt = (status === 'RESOLVED' || status === 'CLOSED')
      ? (closedOn ?? new Date(issue.updated_on))
      : undefined;
    const closedAt = status === 'CLOSED'
      ? (closedOn ?? new Date(issue.updated_on))
      : undefined;

    try {
      const ticket = await prisma.ticket.create({
        data: {
          reference,
          title: issue.subject.slice(0, 500),
          description,
          category,
          priority,
          status,
          tags,
          creatorId,
          createdAt: new Date(issue.created_on),
          updatedAt: new Date(issue.updated_on),
          resolvedAt,
          closedAt,
        },
      });

      // Import comments
      const issueJournals = journalsByIssue.get(issue.id) ?? [];
      for (const j of issueJournals) {
        await prisma.ticketComment.create({
          data: {
            ticketId: ticket.id,
            authorId: creatorId,
            content: j.notes!,
            createdAt: new Date(j.created_on),
          },
        });
        commentCount++;
      }

      created++;

      // Stats
      const pName = PROJECT_NAME_MAP[issue.project_id] ?? `projet-${issue.project_id}`;
      statsByProject[pName] = (statsByProject[pName] ?? 0) + 1;
      statsByStatus[status] = (statsByStatus[status] ?? 0) + 1;

    } catch (err) {
      errors++;
      console.error(`[import-redmine] Erreur sur ${reference} :`, err instanceof Error ? err.message : err);
    }
  }

  // -----------------------------------------------------------------------
  // 6. Bilan
  // -----------------------------------------------------------------------
  console.log('\n========================================');
  console.log('  BILAN IMPORT REDMINE');
  console.log('========================================');
  console.log(`  Issues dans le dump  : ${issues.length}`);
  console.log(`  Tickets crees        : ${created}`);
  console.log(`  Tickets ignores (deja existants) : ${skipped}`);
  console.log(`  Commentaires importes: ${commentCount}`);
  console.log(`  Erreurs              : ${errors}`);
  console.log('');
  console.log('  --- Par projet ---');
  for (const [p, c] of Object.entries(statsByProject).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${p} : ${c}`);
  }
  console.log('');
  console.log('  --- Par statut ---');
  for (const [s, c] of Object.entries(statsByStatus).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${s} : ${c}`);
  }
  console.log('========================================\n');

  if (errors > 0) {
    console.warn('[import-redmine] Des erreurs se sont produites, verifiez les logs ci-dessus.');
  }
}

main()
  .catch(err => {
    console.error('[import-redmine] Erreur fatale :', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
