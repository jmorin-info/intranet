/**
 * backfill-document-current-version.ts
 * ===================================
 *
 * Contexte — intégration OnlyOffice.
 * ----------------------------------
 * Depuis la refonte de l'intégration OnlyOffice, la « version courante » d'un
 * document est lue sur `Document.currentVersionId` (et non plus sur la version
 * la plus récente par `createdAt`) :
 *
 *   - `OfficeService.buildEditorConfig()` ouvre CETTE version dans l'éditeur ;
 *   - la clé de session Docs Server vaut `${documentId}-${versionId}-${checksum8}`,
 *     donc deux utilisateurs ne co-éditent que s'ils résolvent la MÊME version ;
 *   - `handleCallback()` écrase (DRAFT/IN_REVIEW) ou bump (APPROVED) CETTE version.
 *
 * Le code garde un fallback « version la plus récente par createdAt desc » quand
 * le pointeur est nul, mais ce fallback est ambigu : un overwrite de brouillon ne
 * met pas `createdAt` à jour, et une restauration de version antérieure peut
 * rendre l'ordre chronologique trompeur. Ce script renseigne donc
 * `currentVersionId` sur tous les documents où il est encore NULL.
 *
 * Règle de sélection : version la plus récente par (`createdAt` desc, `id` desc)
 * — exactement le fallback appliqué par le backend, pour que le backfill ne
 * change AUCUN comportement observable, il le fige.
 *
 * Usage :
 *   pnpm --filter @omnitech/database exec tsx prisma/maintenance/backfill-document-current-version.ts
 *   pnpm --filter @omnitech/database exec tsx prisma/maintenance/backfill-document-current-version.ts --apply
 *
 * Dry-run par défaut : aucune écriture sans `--apply`.
 * À exécuter APRÈS `prisma migrate deploy`.
 *
 * Idempotent : une seconde exécution ne trouve plus rien à corriger.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

type Report = {
  documentsTotal: number;
  documentsSansPointeur: number;
  documentsSansAucuneVersion: number;
  pointeursIncoherents: number;
  corriges: number;
};

async function main(): Promise<void> {
  console.log("========================================================");
  console.log(" Backfill Document.currentVersionId (intégration OnlyOffice)");
  console.log(` Mode : ${APPLY ? "APPLY (écritures réelles)" : "DRY-RUN (lecture seule)"}`);
  console.log("========================================================\n");

  const report: Report = {
    documentsTotal: 0,
    documentsSansPointeur: 0,
    documentsSansAucuneVersion: 0,
    pointeursIncoherents: 0,
    corriges: 0,
  };

  report.documentsTotal = await prisma.document.count({ where: { deletedAt: null } });

  // ------------------------------------------------------------------
  // 1. Documents sans pointeur de version courante
  // ------------------------------------------------------------------
  const sansPointeur = await prisma.document.findMany({
    where: { deletedAt: null, currentVersionId: null },
    select: {
      id: true,
      reference: true,
      title: true,
      status: true,
      versions: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { id: true, versionNumber: true, createdAt: true },
      },
    },
  });
  report.documentsSansPointeur = sansPointeur.length;

  for (const doc of sansPointeur) {
    const latest = doc.versions[0];
    if (!latest) {
      report.documentsSansAucuneVersion += 1;
      console.log(
        `  [SKIP] ${doc.reference} « ${doc.title} » (${doc.status}) — aucune DocumentVersion, ` +
          "rien à pointer (document importé sans fichier ?)",
      );
      continue;
    }
    console.log(
      `  [FIX ] ${doc.reference} « ${doc.title} » (${doc.status}) → v${latest.versionNumber} ` +
        `(${latest.id}, créée le ${latest.createdAt.toISOString()})`,
    );
    if (APPLY) {
      await prisma.document.update({
        where: { id: doc.id },
        data: { currentVersionId: latest.id },
      });
    }
    report.corriges += 1;
  }

  // ------------------------------------------------------------------
  // 2. Pointeurs incohérents (version appartenant à un AUTRE document)
  //    — jamais observé, mais un pointeur croisé ferait ouvrir le mauvais
  //    fichier dans l'éditeur : on le signale (correction manuelle requise).
  // ------------------------------------------------------------------
  const avecPointeur = await prisma.document.findMany({
    where: { deletedAt: null, currentVersionId: { not: null } },
    select: { id: true, reference: true, currentVersionId: true },
  });
  for (const doc of avecPointeur) {
    const version = await prisma.documentVersion.findUnique({
      where: { id: doc.currentVersionId as string },
      select: { id: true, documentId: true },
    });
    if (!version || version.documentId !== doc.id) {
      report.pointeursIncoherents += 1;
      console.log(
        `  [WARN] ${doc.reference} — currentVersionId=${doc.currentVersionId} ` +
          `${version ? "appartient à un autre document" : "n'existe plus"} ` +
          "→ à corriger manuellement (aucune écriture automatique).",
      );
    }
  }

  // ------------------------------------------------------------------
  console.log("\n--------------------------------------------------------");
  console.log(" Résumé");
  console.log("--------------------------------------------------------");
  console.log(`  Documents actifs                     : ${report.documentsTotal}`);
  console.log(`  Sans currentVersionId                : ${report.documentsSansPointeur}`);
  console.log(`  Dont sans aucune version (ignorés)   : ${report.documentsSansAucuneVersion}`);
  console.log(`  Pointeurs incohérents (à traiter)    : ${report.pointeursIncoherents}`);
  console.log(
    `  ${APPLY ? "Documents corrigés" : "Documents corrigeables"}                : ${report.corriges}`,
  );
  if (!APPLY) {
    console.log("\n  DRY-RUN : aucune écriture effectuée. Relancer avec --apply pour appliquer.");
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error("Échec du backfill :", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
