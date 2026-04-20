/**
 * reset-demo.ts
 * =============
 *
 * Nettoie la base pour "repartir à neuf" côté données de test, tout en
 * préservant :
 *   - Les utilisateurs, départements, rôles (sinon plus personne ne se connecte)
 *   - Les actualités (`NewsPost`, `NewsPostView`, `NewsCategory` si présent)
 *   - Les quiz (`QuizCampaign`)
 *   - La config système (`AppConfig`, `Banner`)
 *   - Les frameworks de conformité (`ComplianceFramework`, `IsoControl`, etc.)
 *   - Les sources de veille (`VeilleSource`) — on garde le catalogue, on vide
 *     uniquement les bulletins/alertes collectés
 *
 * Et vide :
 *   - Documents + versions + validations + signatures + acks
 *   - Tickets + commentaires
 *   - Incidents + remediations + timeline
 *   - Audit logs
 *   - Notifications, push subscriptions
 *   - Veille items/bulletins/acks
 *   - Chartes versions/signatures (le catalogue Charte est conservé)
 *   - Runbooks exécutions (catalogue Runbook conservé)
 *   - Satisfaction + réponses
 *   - Access reviews, campagnes
 *   - Approval workflows + instances
 *   - Wiki pages + versions
 *   - LdapPendingUser
 *   - Calendar events
 *   - RAG chunks + logs
 *   - Signature campagnes + requêtes
 *   - Saved filters, bookmarks
 *
 * Usage :
 *   pnpm --filter @omnitech/database tsx prisma/reset-demo.ts          # dry-run
 *   pnpm --filter @omnitech/database tsx prisma/reset-demo.ts --apply  # exécute
 *
 * ATTENTION : destructif. Le dry-run est par défaut : aucune écriture
 * sans `--apply`. Ne jamais exécuter en production sans double validation.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/* ------------------------------------------------------------------ */
/*  Catégories                                                         */
/* ------------------------------------------------------------------ */

/**
 * Tables préservées intégralement.
 * Leur contenu n'est pas touché.
 */
const PRESERVED = [
  'User',
  'RefreshToken',
  'PushSubscription',
  'Department',
  'UserDepartment',
  'NewsPost',
  'NewsPostView',
  'QuizCampaign',
  'AppConfig',
  'Banner',
  'ComplianceFramework',
  'FrameworkControl',
  'FrameworkDocumentLink',
  'IsoControl',
  'VeilleSource',
  'Charte',
  'Runbook',
  'OnboardingStep',
  'SpaceAccessConfig',
  'SurveyQuestion',
  'ApprovalWorkflow',
  'WorkflowStep',
] as const;

/**
 * Tables à vider. L'ordre respecte les contraintes de clés étrangères :
 * d'abord les "enfants" (dépendants), puis les "parents" (référencés).
 *
 * Si CASCADE est en place côté Prisma, l'ordre n'est pas critique mais
 * on le respecte par sécurité.
 */
const TO_WIPE_ORDERED = [
  // Documents — enfants d'abord
  'DocumentAcknowledgment',
  'DocumentIsoControl',
  'ValidationStep',
  'ValidationRequest',
  'SignatureRequest',
  'DocumentVersion',
  'Document',

  // Tickets
  'TicketComment',
  'Ticket',

  // Incidents
  'IncidentTimelineEntry',
  'Remediation',
  'Incident',

  // Veille (garde les sources)
  'VeilleAck',
  'VeilleItem',
  'VeilleBulletin',

  // Chartes (garde le catalogue Charte)
  'CharteSignature',
  'CharteVersion',

  // Runbooks (garde le catalogue Runbook)
  'RunbookExecution',

  // Satisfaction (garde le catalogue SurveyQuestion)
  'QuestionAnswer',
  'SatisfactionResponse',
  'SatisfactionSurvey',

  // Access reviews
  'AccessReview',
  'AccessReviewCampaign',

  // Approval instances (garde le catalogue ApprovalWorkflow)
  'ApprovalStepInstance',
  'ApprovalInstance',

  // Signature campaigns
  'CampaignSignature',
  'SignatureCampaign',

  // Wiki
  'WikiPageVersion',
  'WikiPage',

  // LDAP pending
  'LdapPendingUser',

  // Calendar
  'CalendarEvent',

  // Audit & notifications
  'AuditLog',
  'Notification',
  'DataExportRequest',

  // Alerts
  'SecurityAlertRead',
  'SecurityAlert',

  // RAG
  'RagQueryLog',
  'RagChunk',

  // Divers
  'SavedFilter',
  'ExternalAccess',
  'ComplianceTask',
  'ItExport',
] as const;

/* ------------------------------------------------------------------ */
/*  Runner                                                             */
/* ------------------------------------------------------------------ */

type ModelDelegate = { count: () => Promise<number>; deleteMany: (args?: unknown) => Promise<{ count: number }> };

function delegateFor(model: string): ModelDelegate | null {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  const p = prisma as unknown as Record<string, ModelDelegate | undefined>;
  return p[key] ?? null;
}

async function countRows(model: string): Promise<number | null> {
  const d = delegateFor(model);
  if (!d) return null;
  try {
    return await d.count();
  } catch {
    return null;
  }
}

function fmt(n: number | null): string {
  if (n === null) return '  (n/a)';
  return n.toString().padStart(6, ' ');
}

async function main() {
  const apply = process.argv.includes('--apply');

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  OMNITECH — reset-demo                                     ║');
  console.log(`║  Mode : ${apply ? 'APPLY (destructif) ⚠️  ' : 'DRY-RUN (lecture seule)'}                     ║`);
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  // Préservées
  console.log('── Tables PRÉSERVÉES ───────────────────────────────────────');
  for (const model of PRESERVED) {
    const n = await countRows(model);
    console.log(`  ${fmt(n)}  ${model}`);
  }
  console.log('');

  // À vider
  console.log('── Tables À VIDER ──────────────────────────────────────────');
  let totalToWipe = 0;
  const nonZero: Array<{ model: string; before: number }> = [];
  for (const model of TO_WIPE_ORDERED) {
    const n = await countRows(model);
    console.log(`  ${fmt(n)}  ${model}`);
    if (n && n > 0) {
      totalToWipe += n;
      nonZero.push({ model, before: n });
    }
  }
  console.log('');
  console.log(`Total de lignes candidates à la suppression : ${totalToWipe}`);
  console.log('');

  if (!apply) {
    console.log('ℹ️  Dry-run terminé. Aucune écriture effectuée.');
    console.log('   Relance avec --apply pour exécuter (destructif).');
    return;
  }

  // APPLY
  console.log('⚠️  Mode APPLY activé — suppression dans 3 secondes…');
  await new Promise((r) => setTimeout(r, 3000));

  const results: Array<{ model: string; deleted: number }> = [];
  for (const model of TO_WIPE_ORDERED) {
    const d = delegateFor(model);
    if (!d) {
      console.log(`  SKIP (model introuvable côté Prisma): ${model}`);
      continue;
    }
    try {
      const res = await d.deleteMany();
      results.push({ model, deleted: res.count });
      console.log(`  ✓ ${model.padEnd(32)} — ${res.count} lignes supprimées`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ ${model.padEnd(32)} — échec : ${msg}`);
    }
  }

  console.log('');
  console.log('── Recomptage post-wipe ────────────────────────────────────');
  for (const { model } of nonZero) {
    const after = await countRows(model);
    console.log(`  ${fmt(after)}  ${model}`);
  }
  console.log('');
  console.log('✅ Reset-demo terminé.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
