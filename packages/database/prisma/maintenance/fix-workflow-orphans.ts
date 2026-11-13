/**
 * fix-workflow-orphans.ts — Répare les documents « bloqués » en workflow.
 * ---------------------------------------------------------------------------
 * CONTEXTE : l'import REG_016 a placé ~50 documents en statut IN_REVIEW ou
 * PENDING_APPROVAL SANS créer de ValidationRequest PENDING (et souvent sans
 * reviewerId). Conséquence : aucune action de revue/approbation n'est possible
 * (approveReview/approveDocument renvoient 403/400), la timeline est vide et la
 * file « à traiter » ignore ces documents.
 *
 * STRATÉGIE (par document orphelin = statut en workflow + AUCUNE
 * ValidationRequest PENDING) :
 *   • IN_REVIEW  + reviewerId présent + une version exploitable
 *                 → crée une ValidationRequest PENDING + 1re ValidationStep
 *                   (VERIFICATION si verifierId, sinon REVIEW) cohérente ;
 *   • PENDING_APPROVAL + approverId présent + une version
 *                 → crée une ValidationRequest PENDING + ValidationStep APPROVAL ;
 *   • sinon (pas d'acteur assigné, ou pas de version attachable)
 *                 → repasse le document en DRAFT + note d'audit
 *                   « re-soumettre après désignation d'un relecteur/approbateur ».
 *
 * SÉCURITÉ D'EXÉCUTION (identique à import-reg016.ts) :
 *   • --dry-run (DÉFAUT) : AUCUNE écriture, compte et détaille chaque cas.
 *   • --apply            : applique réellement (transaction par document).
 *   • Idempotent : ne traite que les documents SANS ValidationRequest PENDING —
 *     relançable sans effet de bord.
 *
 * Usage :
 *   tsx packages/database/prisma/maintenance/fix-workflow-orphans.ts           # dry-run
 *   tsx packages/database/prisma/maintenance/fix-workflow-orphans.ts --apply   # écrit
 */
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.slice(2).includes("--apply");

type StartStep = "VERIFICATION" | "REVIEW" | "APPROVAL";

interface Decision {
  ref: string;
  status: string;
  action: "CREATE_REQUEST" | "RESET_DRAFT";
  detail: string;
}

/**
 * Assure qu'une version exploitable existe pour rattacher la ValidationRequest.
 * Retourne l'id de version, ou null si impossible (uploadé sans version).
 * En mode --apply, crée un snapshot pour les documents natifs sans version.
 */
async function ensureVersionId(doc: {
  id: string;
  currentVersionId: string | null;
  isNative: boolean;
  content: string | null;
  ownerId: string;
}): Promise<string | null> {
  if (doc.currentVersionId) return doc.currentVersionId;
  // Une version existante non pointée par currentVersionId ?
  const anyVersion = await prisma.documentVersion.findFirst({
    where: { documentId: doc.id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (anyVersion) return anyVersion.id;

  if (!doc.isNative) return null; // uploadé sans version : rien à valider.
  if (!APPLY) return "«snapshot-à-créer»"; // dry-run : signale qu'on créerait un snapshot

  const content = doc.content ?? "";
  const snapshot = await prisma.documentVersion.create({
    data: {
      documentId: doc.id,
      versionNumber: "1.0",
      fileUrl: `inline://${doc.id}`,
      fileType: "text/html",
      fileSizeBytes: Buffer.byteLength(content, "utf8"),
      checksum: createHash("sha256").update(content).digest("hex"),
      changeLog: "Snapshot du contenu natif (remédiation workflow)",
      uploadedById: doc.ownerId,
    },
  });
  await prisma.document.update({
    where: { id: doc.id },
    data: { currentVersionId: snapshot.id },
  });
  return snapshot.id;
}

async function main() {
  console.log(
    `\n=== Remédiation workflow — ${APPLY ? "APPLY (écriture réelle)" : "DRY-RUN (aucune écriture)"} ===\n`,
  );

  // Documents en workflow SANS ValidationRequest PENDING = orphelins.
  const orphans = await prisma.document.findMany({
    where: {
      deletedAt: null,
      status: { in: ["IN_REVIEW", "PENDING_APPROVAL"] },
      validationRequests: { none: { status: "PENDING" } },
    },
    select: {
      id: true,
      reference: true,
      title: true,
      status: true,
      ownerId: true,
      verifierId: true,
      reviewerId: true,
      approverId: true,
      currentVersionId: true,
      isNative: true,
      content: true,
    },
    orderBy: { reference: "asc" },
  });

  console.log(`Documents orphelins détectés : ${orphans.length}\n`);

  const decisions: Decision[] = [];
  let createdRequests = 0;
  let resetToDraft = 0;

  for (const doc of orphans) {
    const isReview = doc.status === "IN_REVIEW";
    const requiredActorId = isReview ? doc.reviewerId : doc.approverId;
    const requiredActorLabel = isReview ? "relecteur" : "approbateur";

    // Pas d'acteur assigné → impossible d'instancier une étape cohérente.
    if (!requiredActorId) {
      decisions.push({
        ref: doc.reference,
        status: doc.status,
        action: "RESET_DRAFT",
        detail: `aucun ${requiredActorLabel} assigné`,
      });
      resetToDraft++;
      if (APPLY) {
        await prisma.$transaction([
          prisma.document.update({
            where: { id: doc.id },
            data: { status: "DRAFT" },
          }),
          prisma.auditLog.create({
            data: {
              userId: doc.ownerId,
              action: "DOCUMENT_WORKFLOW_REMEDIATION_RESET",
              resourceType: "Document",
              resourceId: doc.id,
              severity: "WARN",
              metadata: {
                previousStatus: doc.status,
                reason: `no_${requiredActorLabel}_assigned`,
                note: `Re-soumettre après désignation d'un ${requiredActorLabel}.`,
              },
            },
          }),
        ]);
      }
      continue;
    }

    const versionId = await ensureVersionId(doc);
    if (!versionId) {
      // Acteur présent mais aucune version attachable → reset DRAFT.
      decisions.push({
        ref: doc.reference,
        status: doc.status,
        action: "RESET_DRAFT",
        detail: `${requiredActorLabel} assigné mais aucune version exploitable`,
      });
      resetToDraft++;
      if (APPLY) {
        await prisma.$transaction([
          prisma.document.update({
            where: { id: doc.id },
            data: { status: "DRAFT" },
          }),
          prisma.auditLog.create({
            data: {
              userId: doc.ownerId,
              action: "DOCUMENT_WORKFLOW_REMEDIATION_RESET",
              resourceType: "Document",
              resourceId: doc.id,
              severity: "WARN",
              metadata: {
                previousStatus: doc.status,
                reason: "no_attachable_version",
                note: "Re-uploader/rédiger une version puis re-soumettre.",
              },
            },
          }),
        ]);
      }
      continue;
    }

    // Détermine l'étape de départ cohérente avec le cycle 5 rôles.
    let startStep: StartStep;
    let assigneeId: string;
    if (isReview) {
      startStep = doc.verifierId ? "VERIFICATION" : "REVIEW";
      assigneeId = doc.verifierId ?? doc.reviewerId!;
    } else {
      startStep = "APPROVAL";
      assigneeId = doc.approverId!;
    }

    decisions.push({
      ref: doc.reference,
      status: doc.status,
      action: "CREATE_REQUEST",
      detail: `ValidationRequest PENDING + step ${startStep} → ${assigneeId.slice(0, 8)}`,
    });
    createdRequests++;

    if (APPLY) {
      const realVersionId =
        versionId === "«snapshot-à-créer»"
          ? (await ensureVersionId(doc))! // ne devrait pas arriver (APPLY crée déjà)
          : versionId;
      await prisma.$transaction(async (tx) => {
        const request = await tx.validationRequest.create({
          data: {
            documentId: doc.id,
            documentVersionId: realVersionId,
            requestedById: doc.ownerId,
            currentStep: startStep,
            status: "PENDING",
          },
        });
        await tx.validationStep.create({
          data: {
            requestId: request.id,
            stepType: startStep,
            assignedToId: assigneeId,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: doc.ownerId,
            action: "DOCUMENT_WORKFLOW_REMEDIATION_REQUEST",
            resourceType: "Document",
            resourceId: doc.id,
            severity: "INFO",
            metadata: { status: doc.status, startStep, assigneeId },
          },
        });
      });
    }
  }

  // ── Rapport détaillé ──────────────────────────────────────────────────────
  console.log("Détail des décisions :");
  for (const d of decisions) {
    const tag = d.action === "CREATE_REQUEST" ? "+ REQUEST" : "→ DRAFT ";
    console.log(`  ${tag}  ${d.ref.padEnd(18)} ${d.status.padEnd(16)} ${d.detail}`);
  }

  console.log(`\n=== Rapport ===`);
  console.log(`  Orphelins traités          : ${orphans.length}`);
  console.log(`  ValidationRequest à créer  : ${createdRequests}`);
  console.log(`  Retours en DRAFT           : ${resetToDraft}`);
  const byStatus = orphans.reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`  Répartition statut         : ${JSON.stringify(byStatus)}`);
  if (!APPLY) {
    console.log(`\n(DRY-RUN — relancer avec --apply pour écrire réellement.)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
