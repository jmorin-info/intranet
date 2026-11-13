/**
 * close-legacy-review-steps.ts — Clôture les ValidationStep « fantômes ».
 * ---------------------------------------------------------------------------
 * CONTEXTE : avant la refonte du cycle qualité 5 rôles, `approveReview` /
 * `requestApproval` CRÉAIENT une nouvelle ValidationStep (déjà APPROVED) sans
 * jamais clôturer la step d'origine. Résultat en base : tout document ayant
 * passé la revue avant ce déploiement porte une ValidationStep `action: null`
 * dont le `stepType` (typiquement REVIEW) ne correspond PLUS au `currentStep`
 * de sa ValidationRequest encore PENDING (currentStep = APPROVAL, ou document
 * déjà REVIEW_APPROVED / PENDING_APPROVAL).
 *
 * Ces steps orphelines provoquent :
 *   • des relances (cron remindStaleWorkflowSteps) sur des étapes déjà décidées ;
 *   • l'apparition de documents PENDING_APPROVAL dans la file du relecteur
 *     (getPendingForUser) → clic « Approuver » → 403 garanti.
 *
 * Le code applicatif (HEAD) filtre désormais ces steps (cron + file typés par
 * currentStep), donc elles sont devenues INERTES. Ce script nettoie néanmoins
 * le passif pour que la base reflète l'état réel du workflow.
 *
 * STRATÉGIE : clôture chaque ValidationStep `action: null` dont le `stepType`
 * diffère du `currentStep` de sa ValidationRequest PENDING, en posant
 * `action: "APPROVED"`, `actionAt = now()`, un commentaire de traçabilité, et
 * `decidedById = assignedToId` (l'acteur qui l'avait effectivement traitée).
 * On NE touche PAS les steps dont stepType === currentStep (étape réellement
 * en cours). Filtrer sur currentStep — et non sur le statut du document — est
 * indispensable : approveReview ne modifie pas currentStep, donc un document
 * REVIEW_APPROVED légitime reste à currentStep = "REVIEW" et ne doit PAS être
 * clôturé.
 *
 * SÉCURITÉ D'EXÉCUTION (identique à fix-workflow-orphans.ts) :
 *   • --dry-run (DÉFAUT) : AUCUNE écriture, compte et détaille chaque cas.
 *   • --apply            : applique réellement (transaction par step).
 *   • Idempotent : une step déjà clôturée (action != null) n'est plus
 *     sélectionnée — relançable sans effet de bord.
 *
 * À exécuter en dry-run PUIS --apply AVANT le premier passage du cron
 * (0 9 * * 1-5) suivant le déploiement.
 *
 * Usage :
 *   tsx packages/database/prisma/maintenance/close-legacy-review-steps.ts          # dry-run
 *   tsx packages/database/prisma/maintenance/close-legacy-review-steps.ts --apply   # écrit
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.slice(2).includes("--apply");

interface Decision {
  ref: string;
  docStatus: string;
  currentStep: string;
  stepType: string;
  stepId: string;
}

async function main() {
  console.log(
    `\n=== Clôture des steps héritées — ${APPLY ? "APPLY (écriture réelle)" : "DRY-RUN (aucune écriture)"} ===\n`,
  );

  // Steps non décidées d'une request PENDING, dont le type ne correspond pas à
  // l'étape courante = steps fantômes (double-step historique).
  const pendingSteps = await prisma.validationStep.findMany({
    where: {
      action: null,
      request: { status: "PENDING" },
    },
    include: {
      request: {
        select: {
          currentStep: true,
          document: {
            select: {
              id: true,
              reference: true,
              status: true,
              ownerId: true,
              deletedAt: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const decisions: Decision[] = [];

  for (const step of pendingSteps) {
    const req = step.request;
    const doc = req?.document;
    if (!req || !doc || doc.deletedAt) continue;
    // Étape réellement en cours : on n'y touche pas.
    if (step.stepType === req.currentStep) continue;

    decisions.push({
      ref: doc.reference,
      docStatus: doc.status,
      currentStep: req.currentStep,
      stepType: step.stepType,
      stepId: step.id,
    });

    if (APPLY) {
      await prisma.$transaction(async (tx) => {
        await tx.validationStep.update({
          where: { id: step.id },
          data: {
            action: "APPROVED",
            actionAt: new Date(),
            decidedById: step.assignedToId,
            comment: "Clôture rétroactive (remédiation historique double-step)",
          },
        });
        await tx.auditLog.create({
          data: {
            userId: doc.ownerId,
            action: "DOCUMENT_WORKFLOW_REMEDIATION_STEP_CLOSED",
            resourceType: "Document",
            resourceId: doc.id,
            severity: "INFO",
            metadata: {
              stepId: step.id,
              stepType: step.stepType,
              currentStep: req.currentStep,
              documentStatus: doc.status,
              assignedToId: step.assignedToId,
            },
          },
        });
      });
    }
  }

  // ── Rapport détaillé ──────────────────────────────────────────────────────
  console.log("Détail des steps à clôturer :");
  for (const d of decisions) {
    console.log(
      `  ${d.ref.padEnd(18)} doc=${d.docStatus.padEnd(16)} currentStep=${d.currentStep.padEnd(12)} step=${d.stepType.padEnd(12)} (${d.stepId.slice(0, 8)})`,
    );
  }

  console.log(`\n=== Rapport ===`);
  console.log(`  Steps action=null sur request PENDING : ${pendingSteps.length}`);
  console.log(`  Steps fantômes à clôturer             : ${decisions.length}`);
  const byType = decisions.reduce<Record<string, number>>((acc, d) => {
    acc[d.stepType] = (acc[d.stepType] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`  Répartition stepType                  : ${JSON.stringify(byType)}`);
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
