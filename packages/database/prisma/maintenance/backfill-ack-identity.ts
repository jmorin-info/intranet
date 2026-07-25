/**
 * backfill-ack-identity.ts — Backfill du snapshot d'identité des attestations
 * de lecture (DocumentAcknowledgment + CharteSignature).
 * ---------------------------------------------------------------------------
 * CONTEXTE
 * Le schéma porte depuis longtemps les colonnes `userEmail / userFirstName /
 * userLastName / userRole` sur `DocumentAcknowledgment`, avec le contrat
 * ISO 27001 A.5.28 : « la preuve doit rester exploitable 3 ans après la
 * suppression du compte » (la relation `user` est en `onDelete: SetNull`).
 * Ces colonnes n'ont jamais été renseignées par le code applicatif — les
 * attestations existantes deviendraient donc ANONYMES à la suppression du
 * compte, exactement ce que le champ devait empêcher.
 *
 * La refonte des signatures (2026-07) corrige la cause :
 *  - `AcknowledgmentsService.acknowledge()` écrit désormais le snapshot ;
 *  - `ChartesService.sign()` fait de même sur `CharteSignature` (mêmes colonnes).
 *
 * Ce script traite la conséquence : les lignes DÉJÀ en base.
 *
 * CE QUE FAIT LE SCRIPT
 *  - Parcourt les `DocumentAcknowledgment` dont au moins une colonne snapshot
 *    est NULL et dont `userId` est encore renseigné ;
 *  - Recopie email / prénom / nom / rôle depuis `User` (état actuel du compte,
 *    seule source disponible a posteriori) ;
 *  - Idem pour `CharteSignature` ;
 *  - Ne touche JAMAIS une ligne dont le snapshot est déjà complet (idempotent) ;
 *  - Ne touche JAMAIS une ligne orpheline (`userId = NULL`) : l'identité est
 *    définitivement perdue pour celles-ci, elles sont listées dans le rapport.
 *
 * SÉCURITÉ D'EXÉCUTION
 *  - `--dry-run` (DÉFAUT) : AUCUNE écriture, rapport détaillé ligne à ligne.
 *  - `--apply` : écrit réellement (UPDATE ciblés par id, un par un, un échec
 *    isolé n'interrompt pas le reste).
 *  - Relançable sans effet de bord (idempotent).
 *  - Aucun volume n'est codé en dur : le script compte lui-même.
 *
 * Usage :
 *   tsx packages/database/prisma/maintenance/backfill-ack-identity.ts
 *   tsx packages/database/prisma/maintenance/backfill-ack-identity.ts --apply
 *   tsx packages/database/prisma/maintenance/backfill-ack-identity.ts --apply --quiet
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ── Arguments CLI ──────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const QUIET = argv.includes("--quiet");

type IdentitySnapshot = {
  userEmail: string;
  userFirstName: string;
  userLastName: string;
  userRole: string;
};

type Row = {
  id: string;
  userId: string | null;
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  userRole: string | null;
  user: {
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  } | null;
  label: string;
};

interface TableReport {
  table: string;
  scanned: number;
  toBackfill: number;
  orphans: number;
  alreadyComplete: number;
  updated: number;
}

function log(...args: unknown[]) {
  if (!QUIET) console.log(...args);
}

/** Une ligne est « incomplète » dès qu'une des 4 colonnes snapshot manque. */
function isIncomplete(row: {
  userEmail: string | null;
  userFirstName: string | null;
  userLastName: string | null;
  userRole: string | null;
}): boolean {
  return (
    !row.userEmail || !row.userFirstName || !row.userLastName || !row.userRole
  );
}

function snapshotOf(user: NonNullable<Row["user"]>): IdentitySnapshot {
  return {
    userEmail: user.email,
    userFirstName: user.firstName,
    userLastName: user.lastName,
    userRole: String(user.role),
  };
}

// ── DocumentAcknowledgment ─────────────────────────────────────────────────

async function collectAcknowledgments(): Promise<Row[]> {
  const rows = await prisma.documentAcknowledgment.findMany({
    where: {
      OR: [
        { userEmail: null },
        { userFirstName: null },
        { userLastName: null },
        { userRole: null },
      ],
    },
    select: {
      id: true,
      userId: true,
      userEmail: true,
      userFirstName: true,
      userLastName: true,
      userRole: true,
      acknowledgedAt: true,
      document: { select: { reference: true, title: true } },
      user: {
        select: { email: true, firstName: true, lastName: true, role: true },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userEmail: r.userEmail,
    userFirstName: r.userFirstName,
    userLastName: r.userLastName,
    userRole: r.userRole,
    user: r.user ? { ...r.user, role: String(r.user.role) } : null,
    label: `${r.document?.reference ?? "?"} — ${r.document?.title ?? "?"} (${r.acknowledgedAt.toISOString().slice(0, 10)})`,
  }));
}

// ── CharteSignature ────────────────────────────────────────────────────────

async function collectCharteSignatures(): Promise<Row[]> {
  const rows = await prisma.charteSignature.findMany({
    where: {
      OR: [
        { userEmail: null },
        { userFirstName: null },
        { userLastName: null },
        { userRole: null },
      ],
    },
    select: {
      id: true,
      userId: true,
      userEmail: true,
      userFirstName: true,
      userLastName: true,
      userRole: true,
      signedAt: true,
      charte: { select: { slug: true, title: true } },
      charteVersion: { select: { versionNumber: true } },
      user: {
        select: { email: true, firstName: true, lastName: true, role: true },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userEmail: r.userEmail,
    userFirstName: r.userFirstName,
    userLastName: r.userLastName,
    userRole: r.userRole,
    user: r.user ? { ...r.user, role: String(r.user.role) } : null,
    label: `${r.charte?.slug ?? "?"} v${r.charteVersion?.versionNumber ?? "?"} (${r.signedAt.toISOString().slice(0, 10)})`,
  }));
}

// ── Traitement générique ───────────────────────────────────────────────────

async function processTable(
  table: "DocumentAcknowledgment" | "CharteSignature",
  rows: Row[],
  totalInTable: number,
  update: (id: string, data: IdentitySnapshot) => Promise<unknown>,
): Promise<TableReport> {
  const incomplete = rows.filter(isIncomplete);
  const orphans = incomplete.filter((r) => !r.user);
  const fixable = incomplete.filter((r): r is Row & { user: NonNullable<Row["user"]> } =>
    Boolean(r.user),
  );

  log(`\n── ${table} ─────────────────────────────────────────────`);
  log(`  Total en base                  : ${totalInTable}`);
  log(`  Snapshot déjà complet          : ${totalInTable - incomplete.length}`);
  log(`  À backfiller (user résolu)     : ${fixable.length}`);
  log(`  Orphelines (userId NULL)       : ${orphans.length}`);

  for (const r of fixable) {
    const snap = snapshotOf(r.user);
    log(
      `   → ${r.id}  ${snap.userEmail} (${snap.userFirstName} ${snap.userLastName}, ${snap.userRole})  [${r.label}]`,
    );
  }
  for (const r of orphans) {
    log(
      `   ! ${r.id}  identité définitivement perdue (userId NULL)  [${r.label}]`,
    );
  }

  let updated = 0;
  if (APPLY && fixable.length > 0) {
    for (const r of fixable) {
      try {
        await update(r.id, snapshotOf(r.user));
        updated++;
      } catch (err) {
        console.error(
          `  ✖ ${table} ${r.id} : échec du backfill —`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    log(`  ✔ ${updated}/${fixable.length} ligne(s) mise(s) à jour`);
  }

  return {
    table,
    scanned: totalInTable,
    toBackfill: fixable.length,
    orphans: orphans.length,
    alreadyComplete: totalInTable - incomplete.length,
    updated,
  };
}

async function main() {
  log("═══════════════════════════════════════════════════════════");
  log(" Backfill snapshot identité — attestations de lecture");
  log(`  Mode : ${APPLY ? "APPLY (écritures réelles)" : "DRY-RUN (aucune écriture)"}`);
  log("═══════════════════════════════════════════════════════════");

  const [ackTotal, charteTotal] = await Promise.all([
    prisma.documentAcknowledgment.count(),
    prisma.charteSignature.count(),
  ]);

  const reports: TableReport[] = [];

  reports.push(
    await processTable(
      "DocumentAcknowledgment",
      await collectAcknowledgments(),
      ackTotal,
      (id, data) =>
        prisma.documentAcknowledgment.update({ where: { id }, data }),
    ),
  );

  reports.push(
    await processTable(
      "CharteSignature",
      await collectCharteSignatures(),
      charteTotal,
      (id, data) => prisma.charteSignature.update({ where: { id }, data }),
    ),
  );

  log("\n═══════════════════ RÉSUMÉ ════════════════════════════════");
  for (const r of reports) {
    log(
      `  ${r.table.padEnd(24)} total=${r.scanned}  complet=${r.alreadyComplete}  backfillable=${r.toBackfill}  orphelines=${r.orphans}  écrites=${r.updated}`,
    );
  }
  if (!APPLY) {
    log("\n  DRY-RUN : rien n'a été écrit. Relancer avec --apply pour appliquer.");
  }
  log("═══════════════════════════════════════════════════════════");
}

main()
  .catch((err) => {
    console.error("[backfill-ack-identity] ÉCHEC :", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
